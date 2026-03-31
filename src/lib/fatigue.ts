/**
 * NBA Rest Advantage — Weighted Decay Fatigue Model
 *
 * Unlike simple "add points for back-to-back" systems, this model
 * treats fatigue as a continuous, compounding signal:
 *
 * 1. DECAY LOAD: Each recent game contributes fatigue that decays
 *    exponentially over time (yesterday's game hurts more than
 *    one from 5 days ago)
 *
 * 2. TRAVEL LOAD: Cumulative travel distance over the lookback window (each leg
 *    uses home/away context: e.g. away→home returns to home city; away→away
 *    uses a direct road leg on 0–1 day gaps, or via home when 2+ days off),
 *    then log-scaled (the first 1000 miles hurt more than the next 1000)
 *
 * 3. MULTIPLIERS: Contextual factors that amplify base fatigue:
 *    - Back-to-back: compounds the decay load
 *    - Altitude: visiting Denver/Utah without acclimation
 *    - Schedule density: games-per-day ratio in the window
 *
 * 4. FRESHNESS BONUS: Extended rest reduces fatigue, with
 *    diminishing returns (5 days off ≈ 3 days off)
 *
 * Final score = (decayLoad + travelLoad) × multipliers + freshnessBonus
 * Range: typically 0 (fully rested) to ~15 (extremely fatigued)
 */

import { differenceInCalendarDays, parseISO } from "date-fns";
import { haversineDistance } from "./haversine";

// ─── Configuration ──────────────────────────────────────────────
// These are tunable constants. After backtesting, you can adjust
// them to improve prediction accuracy.

/** How fast fatigue fades. Higher = fades faster. */
const DECAY_RATE = 0.5;

/** How many days back we look for recent games. */
const LOOKBACK_DAYS = 7;

/** Base fatigue cost of playing one game. */
const GAME_BASE_COST = 3.0;

/** Scales travel distance into fatigue points. */
const TRAVEL_SCALE = 1.8;

/** Reference distance for logarithmic scaling (miles). */
const TRAVEL_REFERENCE_MILES = 1000;

/** Extra fatigue multiplier when playing on consecutive days. */
const B2B_MULTIPLIER = 1.4;

/** Fatigue multiplier for visiting altitude arenas (DEN, UTA). */
const ALTITUDE_MULTIPLIER = 1.15;

/** At what games-per-day ratio density kicks in. */
const DENSITY_THRESHOLD = 0.5; // 3.5 games in 7 days = 0.5

/** Maximum density multiplier. */
const DENSITY_MAX_MULTIPLIER = 1.3;

/** Max freshness bonus (for 3+ days rest). */
const FRESHNESS_MAX_BONUS = -2.0;

/** Days of rest where freshness bonus maxes out. */
const FRESHNESS_PLATEAU_DAYS = 3;

/** Extra fatigue when the team's most recent game went to overtime (one OT). */
const OVERTIME_SINGLE_BONUS = 0.5;

/** Extra fatigue when that game went to double overtime or beyond. */
const OVERTIME_MULTI_BONUS = 1.0;

// ─── Types ──────────────────────────────────────────────────────

export interface RecentGame {
  date: string; // "YYYY-MM-DD"
  teamId: number;
  opponentTeamId: number;
  isHome: boolean;
  teamLat: number;
  teamLon: number;
  opponentLat: number;
  opponentLon: number;
  opponentAltitudeFlag: boolean;
  /** Count of overtime periods in this game (0 = regulation). */
  overtimePeriods: number;
}

export interface FatigueResult {
  score: number;
  decayLoadScore: number;
  travelLoadScore: number;
  backToBackMultiplier: number;
  altitudeMultiplier: number;
  densityMultiplier: number;
  freshnessBonus: number;
  /** Additive load from the prior game going to overtime (not multiplied). */
  overtimeFatigueBonus: number;
  gamesInLast7Days: number;
  travelDistanceMiles: number;
  isBackToBack: boolean;
  daysSinceLastGame: number | null;
  /** True when `overtimeFatigueBonus` > 0 (prior game had OT). */
  isOvertimePenalty: boolean;
}

/** Arenas closer than this (miles) are treated as the same venue. */
const SAME_ARENA_MILES = 1;

function calendarDaysBetween(earlierYmd: string, laterYmd: string): number {
  return differenceInCalendarDays(parseISO(laterYmd), parseISO(earlierYmd));
}

function isSameArena(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
  return haversineDistance(lat1, lon1, lat2, lon2) < SAME_ARENA_MILES;
}

/**
 * Miles traveled from the end of the previous game to the start of the current game.
 *
 * When `previousGame` is null, the team is assumed to start at home before the first
 * game in the lookback window (no prior game in data).
 *
 * Rules:
 * - Home → home: 0
 * - Home → away: home city → away arena
 * - Away → home: previous away arena → home city
 * - Away → away: if gap is 2+ calendar days, assume fly home: (away → home) + (home → new away);
 *   if back-to-back or 1 day off, direct away → away.
 * - Same arena twice in a row: 0
 */
function travelMilesBetweenGames(
  previousGame: RecentGame | null,
  currentGameIsHome: boolean,
  currentArenaLat: number,
  currentArenaLon: number,
  teamHomeLat: number,
  teamHomeLon: number,
  daysBetween: number
): number {
  if (previousGame === null) {
    if (currentGameIsHome) {
      return 0;
    }
    return haversineDistance(teamHomeLat, teamHomeLon, currentArenaLat, currentArenaLon);
  }

  const prevWasHome = previousGame.isHome;
  const prevArenaLat = prevWasHome ? previousGame.teamLat : previousGame.opponentLat;
  const prevArenaLon = prevWasHome ? previousGame.teamLon : previousGame.opponentLon;

  if (isSameArena(prevArenaLat, prevArenaLon, currentArenaLat, currentArenaLon)) {
    return 0;
  }

  if (prevWasHome && currentGameIsHome) {
    return 0;
  }

  if (prevWasHome && !currentGameIsHome) {
    return haversineDistance(teamHomeLat, teamHomeLon, currentArenaLat, currentArenaLon);
  }

  if (!prevWasHome && currentGameIsHome) {
    return haversineDistance(prevArenaLat, prevArenaLon, teamHomeLat, teamHomeLon);
  }

  if (daysBetween >= 2) {
    return (
      haversineDistance(prevArenaLat, prevArenaLon, teamHomeLat, teamHomeLon) +
      haversineDistance(teamHomeLat, teamHomeLon, currentArenaLat, currentArenaLon)
    );
  }

  return haversineDistance(prevArenaLat, prevArenaLon, currentArenaLat, currentArenaLon);
}

// ─── Core Algorithm ─────────────────────────────────────────────

/**
 * Calculate the fatigue score for a team heading into a specific game.
 *
 * @param gameDate - The date of the game we're calculating fatigue for
 * @param recentGames - The team's games within the lookback window,
 *                      sorted by date ascending (oldest first)
 * @param isVisitingAltitude - Is the current game at an altitude arena (for this team)?
 * @param teamHomeLat - This team's home arena latitude
 * @param teamHomeLon - This team's home arena longitude
 * @param currentVenueLat - Latitude where the upcoming game is played
 * @param currentVenueLon - Longitude where the upcoming game is played
 * @param currentGameIsHome - True if this team is the home team in the upcoming game
 */
export function calculateFatigue(
  gameDate: string,
  recentGames: RecentGame[],
  isVisitingAltitude: boolean,
  teamHomeLat: number,
  teamHomeLon: number,
  currentVenueLat: number,
  currentVenueLon: number,
  currentGameIsHome: boolean
): FatigueResult {
  const targetDate = new Date(gameDate);

  // ── No recent games → fully rested ──
  if (recentGames.length === 0) {
    return {
      score: 0,
      decayLoadScore: 0,
      travelLoadScore: 0,
      backToBackMultiplier: 1.0,
      altitudeMultiplier: 1.0,
      densityMultiplier: 1.0,
      freshnessBonus: 0,
      overtimeFatigueBonus: 0,
      gamesInLast7Days: 0,
      travelDistanceMiles: 0,
      isBackToBack: false,
      daysSinceLastGame: null,
      isOvertimePenalty: false,
    };
  }

  // ── 1. DECAY LOAD ──
  // Each game contributes: BASE_COST × e^(-λ × daysAgo)
  // Yesterday's game (daysAgo=1): 3.0 × e^(-0.5×1) = 1.82
  // 3 days ago:                    3.0 × e^(-0.5×3) = 0.67
  // 6 days ago:                    3.0 × e^(-0.5×6) = 0.15
  let decayLoadScore = 0;

  for (const game of recentGames) {
    const gameDay = new Date(game.date);
    const daysAgo = Math.max(
      1,
      Math.round(
        (targetDate.getTime() - gameDay.getTime()) / (1000 * 60 * 60 * 24)
      )
    );

    if (daysAgo <= LOOKBACK_DAYS) {
      decayLoadScore += GAME_BASE_COST * Math.exp(-DECAY_RATE * daysAgo);
    }
  }

  const lastGame = recentGames[recentGames.length - 1];

  // ── 2. TRAVEL LOAD ──
  // Sum travel for each leg in the window (from assumed-at-home before the first game,
  // then between consecutive games), then the leg into the upcoming game. See
  // `travelMilesBetweenGames` for home/away and multi-day away-trip rules.
  let totalTravelMiles = 0;

  const first = recentGames[0];
  const firstArenaLat = first.isHome ? first.teamLat : first.opponentLat;
  const firstArenaLon = first.isHome ? first.teamLon : first.opponentLon;
  totalTravelMiles += travelMilesBetweenGames(
    null,
    first.isHome,
    firstArenaLat,
    firstArenaLon,
    teamHomeLat,
    teamHomeLon,
    0
  );

  for (let i = 1; i < recentGames.length; i++) {
    const prev = recentGames[i - 1];
    const cur = recentGames[i];
    const gap = calendarDaysBetween(prev.date, cur.date);
    const curArenaLat = cur.isHome ? cur.teamLat : cur.opponentLat;
    const curArenaLon = cur.isHome ? cur.teamLon : cur.opponentLon;
    totalTravelMiles += travelMilesBetweenGames(
      prev,
      cur.isHome,
      curArenaLat,
      curArenaLon,
      teamHomeLat,
      teamHomeLon,
      gap
    );
  }

  const gapToCurrent = calendarDaysBetween(lastGame.date, gameDate);
  totalTravelMiles += travelMilesBetweenGames(
    lastGame,
    currentGameIsHome,
    currentVenueLat,
    currentVenueLon,
    teamHomeLat,
    teamHomeLon,
    gapToCurrent
  );

  // Logarithmic scaling: log(1 + miles/reference)
  const travelLoadScore =
    totalTravelMiles > 0
      ? TRAVEL_SCALE * Math.log(1 + totalTravelMiles / TRAVEL_REFERENCE_MILES)
      : 0;

  // ── 3. BACK-TO-BACK CHECK ──
  const lastGameDate = new Date(lastGame.date);
  const daysSinceLastGame = Math.round(
    (targetDate.getTime() - lastGameDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const isBackToBack = daysSinceLastGame === 1;
  const b2bMultiplier = isBackToBack ? B2B_MULTIPLIER : 1.0;

  // ── 4. ALTITUDE CHECK ──
  // Only applies to visiting teams at altitude arenas
  const altMultiplier = isVisitingAltitude ? ALTITUDE_MULTIPLIER : 1.0;

  // ── 5. SCHEDULE DENSITY ──
  // Ratio of games played to days in the window.
  // 4 games in 7 days = 0.57 → above threshold → multiplier kicks in
  const gamesInWindow = recentGames.length;
  const density = gamesInWindow / LOOKBACK_DAYS;
  let densityMultiplier = 1.0;

  if (density > DENSITY_THRESHOLD) {
    // Linear interpolation from 1.0 to DENSITY_MAX_MULTIPLIER
    const overageRatio =
      (density - DENSITY_THRESHOLD) / (1.0 - DENSITY_THRESHOLD);
    densityMultiplier =
      1.0 + overageRatio * (DENSITY_MAX_MULTIPLIER - 1.0);
    densityMultiplier = Math.min(densityMultiplier, DENSITY_MAX_MULTIPLIER);
  }

  // ── 6. FRESHNESS BONUS ──
  // If the team hasn't played in 3+ days, they get a recovery bonus.
  // Uses inverse exponential: bonus = MAX × (1 - e^(-days/plateau))
  // 3 days rest → about 63% of max bonus
  // 5 days rest → about 81% of max bonus (diminishing returns)
  let freshnessBonus = 0;

  if (daysSinceLastGame >= FRESHNESS_PLATEAU_DAYS) {
    freshnessBonus =
      FRESHNESS_MAX_BONUS *
      (1 - Math.exp(-daysSinceLastGame / FRESHNESS_PLATEAU_DAYS));
  }

  // ── 7. OVERTIME (prior game only) ──
  const priorOtPeriods = Math.max(0, Math.floor(lastGame.overtimePeriods));
  let overtimeFatigueBonus = 0;
  if (priorOtPeriods >= 2) {
    overtimeFatigueBonus = OVERTIME_MULTI_BONUS;
  } else if (priorOtPeriods === 1) {
    overtimeFatigueBonus = OVERTIME_SINGLE_BONUS;
  }

  // ── FINAL SCORE ──
  const baseLoad = decayLoadScore + travelLoadScore;
  const multipliedLoad =
    baseLoad * b2bMultiplier * altMultiplier * densityMultiplier;
  const finalScore = Math.max(
    0,
    multipliedLoad + freshnessBonus + overtimeFatigueBonus
  );

  return {
    score: Math.round(finalScore * 100) / 100,
    decayLoadScore: Math.round(decayLoadScore * 100) / 100,
    travelLoadScore: Math.round(travelLoadScore * 100) / 100,
    backToBackMultiplier: b2bMultiplier,
    altitudeMultiplier: altMultiplier,
    densityMultiplier: Math.round(densityMultiplier * 100) / 100,
    freshnessBonus: Math.round(freshnessBonus * 100) / 100,
    overtimeFatigueBonus: Math.round(overtimeFatigueBonus * 100) / 100,
    gamesInLast7Days: gamesInWindow,
    travelDistanceMiles: Math.round(totalTravelMiles),
    isBackToBack,
    daysSinceLastGame,
    isOvertimePenalty: overtimeFatigueBonus > 0,
  };
}

/**
 * Calculate the Rest Advantage for a matchup.
 * Positive = home team is more rested (advantage).
 * Negative = away team is more rested.
 */
export function calculateRestAdvantage(
  homeFatigue: FatigueResult,
  awayFatigue: FatigueResult
): number {
  // Away fatigue minus home fatigue
  // If away team has score 8 and home has 3, RA = +5 (home advantage)
  return Math.round((awayFatigue.score - homeFatigue.score) * 100) / 100;
}
