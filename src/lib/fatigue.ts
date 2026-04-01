/**
 * NBA Rest Advantage — Weighted Decay Fatigue Model
 *
 * 1. DECAY LOAD: Recent games (up to ~30 days) contribute fatigue with exponential decay.
 * 2. TRAVEL LOAD: Cumulative travel (7-day rolling window of legs) with log scaling.
 * 3. ROAD SEGMENT LOAD: Consecutive games away from home + coast-to-coast swings.
 * 4. SCHEDULE STRESS: Multi-window density (6/7/12/15/30-day) vs NBA “tough slate” anchors.
 * 5. MULTIPLIERS: Back-to-back, altitude, schedule stress (combined into densityMultiplier in DB).
 * 6. FRESHNESS BONUS: Extended rest reduces fatigue.
 * 7. OVERTIME: Prior-game OT adds flat fatigue.
 */

import { addDays, differenceInCalendarDays, parseISO, subDays } from "date-fns";
import { haversineDistance } from "./haversine";

// ─── Configuration ──────────────────────────────────────────────

/** Must match `fetchRecentGamesForTeam` window. */
export const FATIGUE_RECENT_LOOKBACK_DAYS = 30;

/** Calendar-day window for summing travel legs (still uses full `recentGames` for decay, stress, etc.). */
export const TRAVEL_LOOKBACK_DAYS = 7;

/** Decay includes games played on these calendar days before the target game. */
const DECAY_LOOKBACK_DAYS = 30;

const DECAY_RATE = 0.52;

const GAME_BASE_COST = 2.65;

const TRAVEL_SCALE = 1.75;

const TRAVEL_REFERENCE_MILES = 1000;

const B2B_MULTIPLIER = 1.38;

const ALTITUDE_MULTIPLIER = 1.15;

const FRESHNESS_MAX_BONUS = -2.0;

const FRESHNESS_PLATEAU_DAYS = 3;

const OVERTIME_SINGLE_BONUS = 0.5;

const OVERTIME_MULTI_BONUS = 1.0;

/**
 * Schedule stress anchors (games played in the last `days` calendar days before tip,
 * not counting the game itself). `baseline` ≈ normal pace; `tough` ≈ elite compressed slate.
 * Based on ~18-in-30, 8-in-12, 4-in-6 style NBA scheduling.
 */
const WINDOW_STRESS = [
  { days: 30, tough: 18, baseline: 11 },
  { days: 15, tough: 9, baseline: 6 },
  { days: 12, tough: 8, baseline: 5 },
  { days: 7, tough: 5, baseline: 3 },
  { days: 6, tough: 4, baseline: 3 },
] as const;

const SCHEDULE_STRESS_MAX_MULT = 1.42;

const SCHEDULE_STRESS_CURVE = 0.058;

/** Consecutive away games (incl. tonight if away) before this kicks in. */
const ROAD_STREAK_SOFT = 2;

const ROAD_STREAK_PER_GAME = 0.34;

const ROAD_COAST_TO_COAST_BONUS = 0.88;

/** Min longitude spread (deg) on home + road venues to flag a coast swing. */
const COAST_LON_SPREAD_DEG = 26;

const SAME_ARENA_MILES = 1;

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
  overtimePeriods: number;
}

export interface FatigueResult {
  score: number;
  decayLoadScore: number;
  travelLoadScore: number;
  roadSegmentLoadScore: number;
  backToBackMultiplier: number;
  altitudeMultiplier: number;
  /** Combined schedule-stress multiplier (stored as density_multiplier in DB). */
  densityMultiplier: number;
  freshnessBonus: number;
  overtimeFatigueBonus: number;
  gamesInLast7Days: number;
  gamesInLast30Days: number;
  /** Consecutive away games: includes tonight when `currentGameIsHome` is false. */
  roadTripConsecutiveAway: number;
  travelDistanceMiles: number;
  isBackToBack: boolean;
  daysSinceLastGame: number | null;
  isOvertimePenalty: boolean;
  /** ≥3 games in some rolling 4-calendar-day window (ending before tip). */
  isThreeInFour: boolean;
  /** ≥4 games in some rolling 6-calendar-day window. */
  isFourInSix: boolean;
  /** Large east–west spread across home + road venues on the active / just-finished trip. */
  hasCoastToCoastRoadSwing: boolean;
}

// ─── Schedule / road helpers ───────────────────────────────────

function countGamesInDaysBefore(
  recentGames: RecentGame[],
  gameDate: string,
  days: number
): number {
  const tip = parseISO(gameDate);
  const windowStart = subDays(tip, days);
  return recentGames.filter((g) => {
    const d = parseISO(g.date);
    return d >= windowStart && d < tip;
  }).length;
}

function sortedUniqueGameDates(recentGames: RecentGame[]): string[] {
  return [...new Set(recentGames.map((g) => g.date))].sort();
}

/** Max games that fall in any contiguous `spanDays`-day calendar window (inclusive). */
function maxGamesInRollingCalendarSpan(dates: string[], spanDays: number): number {
  if (dates.length === 0) return 0;
  const sorted = [...dates].sort();
  let max = 0;
  for (const firstStr of sorted) {
    const first = parseISO(firstStr);
    const lastInSpan = addDays(first, spanDays - 1);
    const c = sorted.filter((ds) => {
      const d = parseISO(ds);
      return d >= first && d <= lastInSpan;
    }).length;
    if (c > max) max = c;
  }
  return max;
}

function computeIsThreeInFour(recentGames: RecentGame[]): boolean {
  return maxGamesInRollingCalendarSpan(sortedUniqueGameDates(recentGames), 4) >= 3;
}

function computeIsFourInSix(recentGames: RecentGame[]): boolean {
  return maxGamesInRollingCalendarSpan(sortedUniqueGameDates(recentGames), 6) >= 4;
}

function scheduleStressMultiplier(recentGames: RecentGame[], gameDate: string): number {
  let stressPoints = 0;
  for (const w of WINDOW_STRESS) {
    const n = countGamesInDaysBefore(recentGames, gameDate, w.days);
    if (n <= w.baseline) continue;
    const denom = Math.max(1, w.tough - w.baseline);
    const excess = (n - w.baseline) / denom;
    stressPoints += Math.min(1.15, Math.max(0, excess));
  }
  const mult = 1 + Math.min(
    SCHEDULE_STRESS_MAX_MULT - 1,
    stressPoints * SCHEDULE_STRESS_CURVE
  );
  return Math.round(mult * 1000) / 1000;
}

/**
 * Consecutive away games: walk back from most recent game; if tonight is away, add 1.
 * Returns venue longitudes for those away games (not including tonight — caller adds current).
 */
function roadTripContext(
  recentGames: RecentGame[],
  currentGameIsHome: boolean,
  currentVenueLon: number
): { streak: number; awayVenueLons: number[] } {
  const sorted = [...recentGames].sort((a, b) => a.date.localeCompare(b.date));
  const awayVenueLons: number[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (!sorted[i].isHome) {
      awayVenueLons.push(sorted[i].opponentLon);
    } else {
      break;
    }
  }
  let streak = awayVenueLons.length;
  if (!currentGameIsHome) {
    streak += 1;
  }
  return { streak, awayVenueLons };
}

function hasCoastToCoastSwing(teamHomeLon: number, venueLons: number[]): boolean {
  if (venueLons.length === 0) return false;
  const all = [teamHomeLon, ...venueLons];
  const spread = Math.max(...all) - Math.min(...all);
  return spread >= COAST_LON_SPREAD_DEG;
}

function roadSegmentLoad(
  streak: number,
  coast: boolean
): { load: number; hasCoastToCoastRoadSwing: boolean } {
  const loadFromStreak =
    ROAD_STREAK_PER_GAME * Math.max(0, streak - ROAD_STREAK_SOFT);
  const coastAdd = coast ? ROAD_COAST_TO_COAST_BONUS : 0;
  const load = Math.round((loadFromStreak + coastAdd) * 100) / 100;
  return { load, hasCoastToCoastRoadSwing: coast };
}

function isSameArena(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
  return haversineDistance(lat1, lon1, lat2, lon2) < SAME_ARENA_MILES;
}

/**
 * One leg between consecutive games (great-circle / haversine, not road routing).
 *
 * - **Home → home:** 0 (no relocation).
 * - **Home → away:** home arena → opponent arena.
 * - **Away → home:** last opponent arena → home arena.
 * - **Away → away:** previous opponent arena → next opponent arena (direct road leg).
 *   We do **not** insert a round trip through the team’s home city on multi-day gaps;
 *   NBA clubs typically stay on the road for West/East swings, and the old “fly home
 *   between every pair of away games if gap ≥ 2 days” rule massively over-counted miles.
 * - **First game ever in chain (`previousGame === null`):** if tonight is away, count
 *   home → tonight’s arena (inbound to the trip or one-off road game).
 */
function travelMilesBetweenGames(
  previousGame: RecentGame | null,
  currentGameIsHome: boolean,
  currentArenaLat: number,
  currentArenaLon: number,
  teamHomeLat: number,
  teamHomeLon: number
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

  return haversineDistance(prevArenaLat, prevArenaLon, currentArenaLat, currentArenaLon);
}

/**
 * Sums travel legs for prior games dated in `[tip − lookbackDays, tip)` (game day excluded), plus
 * the inbound leg from the prior game immediately before that window (if any) into the first game
 * inside the window, and the leg from the most recent prior game to tonight.
 */
function computeTotalTravelMiles(
  gameDate: string,
  tip: Date,
  recentGames: RecentGame[],
  currentGameIsHome: boolean,
  currentVenueLat: number,
  currentVenueLon: number,
  teamHomeLat: number,
  teamHomeLon: number,
  lookbackDays: number
): number {
  if (recentGames.length === 0) {
    return travelMilesBetweenGames(
      null,
      currentGameIsHome,
      currentVenueLat,
      currentVenueLon,
      teamHomeLat,
      teamHomeLon
    );
  }

  const windowStart = subDays(tip, lookbackDays);
  const firstIdxInWindow = recentGames.findIndex((g) => {
    const d = parseISO(g.date);
    return d >= windowStart && d < tip;
  });

  let total = 0;

  if (firstIdxInWindow === -1) {
    const lastGame = recentGames[recentGames.length - 1];
    return travelMilesBetweenGames(
      lastGame,
      currentGameIsHome,
      currentVenueLat,
      currentVenueLon,
      teamHomeLat,
      teamHomeLon
    );
  }

  const prevBeforeChain =
    firstIdxInWindow > 0 ? recentGames[firstIdxInWindow - 1]! : null;
  const chainStart = recentGames[firstIdxInWindow]!;
  const chainStartLat = chainStart.isHome
    ? chainStart.teamLat
    : chainStart.opponentLat;
  const chainStartLon = chainStart.isHome
    ? chainStart.teamLon
    : chainStart.opponentLon;

  total += travelMilesBetweenGames(
    prevBeforeChain,
    chainStart.isHome,
    chainStartLat,
    chainStartLon,
    teamHomeLat,
    teamHomeLon
  );

  for (let i = firstIdxInWindow; i < recentGames.length - 1; i++) {
    const prev = recentGames[i]!;
    const cur = recentGames[i + 1]!;
    const curArenaLat = cur.isHome ? cur.teamLat : cur.opponentLat;
    const curArenaLon = cur.isHome ? cur.teamLon : cur.opponentLon;
    total += travelMilesBetweenGames(
      prev,
      cur.isHome,
      curArenaLat,
      curArenaLon,
      teamHomeLat,
      teamHomeLon
    );
  }

  const lastGame = recentGames[recentGames.length - 1]!;
  total += travelMilesBetweenGames(
    lastGame,
    currentGameIsHome,
    currentVenueLat,
    currentVenueLon,
    teamHomeLat,
    teamHomeLon
  );

  return total;
}

// ─── Core Algorithm ─────────────────────────────────────────────

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
  const tip = parseISO(gameDate);

  const games7 = countGamesInDaysBefore(recentGames, gameDate, 7);
  const games30 = countGamesInDaysBefore(recentGames, gameDate, 30);
  const isThreeInFour = computeIsThreeInFour(recentGames);
  const isFourInSix = computeIsFourInSix(recentGames);
  const stressMult = scheduleStressMultiplier(recentGames, gameDate);

  const { streak: roadStreak, awayVenueLons } = roadTripContext(
    recentGames,
    currentGameIsHome,
    currentVenueLon
  );
  const venueLonsForCoast = currentGameIsHome
    ? awayVenueLons
    : [...awayVenueLons, currentVenueLon];
  const coast = hasCoastToCoastSwing(teamHomeLon, venueLonsForCoast);
  const { load: roadLoad, hasCoastToCoastRoadSwing } = roadSegmentLoad(roadStreak, coast);

  if (recentGames.length === 0) {
    if (currentGameIsHome) {
      return {
        score: 0,
        decayLoadScore: 0,
        travelLoadScore: 0,
        roadSegmentLoadScore: 0,
        backToBackMultiplier: 1.0,
        altitudeMultiplier: 1.0,
        densityMultiplier: stressMult,
        freshnessBonus: 0,
        overtimeFatigueBonus: 0,
        gamesInLast7Days: 0,
        gamesInLast30Days: 0,
        roadTripConsecutiveAway: 0,
        travelDistanceMiles: 0,
        isBackToBack: false,
        daysSinceLastGame: null,
        isOvertimePenalty: false,
        isThreeInFour: false,
        isFourInSix: false,
        hasCoastToCoastRoadSwing: false,
      };
    }

    const openerCoast = hasCoastToCoastSwing(teamHomeLon, [currentVenueLon]);
    const openerRoad = roadSegmentLoad(1, openerCoast);

    return {
      score: Math.max(0, openerRoad.load),
      decayLoadScore: 0,
      travelLoadScore: 0,
      roadSegmentLoadScore: openerRoad.load,
      backToBackMultiplier: 1.0,
      altitudeMultiplier: isVisitingAltitude ? ALTITUDE_MULTIPLIER : 1.0,
      densityMultiplier: stressMult,
      freshnessBonus: 0,
      overtimeFatigueBonus: 0,
      gamesInLast7Days: 0,
      gamesInLast30Days: 0,
      roadTripConsecutiveAway: 1,
      travelDistanceMiles: 0,
      isBackToBack: false,
      daysSinceLastGame: null,
      isOvertimePenalty: false,
      isThreeInFour: false,
      isFourInSix: false,
      hasCoastToCoastRoadSwing: openerRoad.hasCoastToCoastRoadSwing,
    };
  }

  let decayLoadScore = 0;
  for (const game of recentGames) {
    const daysAgo = differenceInCalendarDays(tip, parseISO(game.date));
    if (daysAgo < 1 || daysAgo > DECAY_LOOKBACK_DAYS) continue;
    decayLoadScore += GAME_BASE_COST * Math.exp(-DECAY_RATE * daysAgo);
  }
  decayLoadScore = Math.round(decayLoadScore * 100) / 100;

  const totalTravelMiles = computeTotalTravelMiles(
    gameDate,
    tip,
    recentGames,
    currentGameIsHome,
    currentVenueLat,
    currentVenueLon,
    teamHomeLat,
    teamHomeLon,
    TRAVEL_LOOKBACK_DAYS
  );

  const lastGame = recentGames[recentGames.length - 1]!;
  const travelLoadScore =
    totalTravelMiles > 0
      ? Math.round(
          TRAVEL_SCALE * Math.log(1 + totalTravelMiles / TRAVEL_REFERENCE_MILES) * 100
        ) / 100
      : 0;

  const daysSinceLastGame = differenceInCalendarDays(tip, parseISO(lastGame.date));
  const isBackToBack = daysSinceLastGame === 1;
  const b2bMultiplier = isBackToBack ? B2B_MULTIPLIER : 1.0;

  const altMultiplier = isVisitingAltitude ? ALTITUDE_MULTIPLIER : 1.0;

  let freshnessBonus = 0;
  if (daysSinceLastGame >= FRESHNESS_PLATEAU_DAYS) {
    freshnessBonus =
      FRESHNESS_MAX_BONUS *
      (1 - Math.exp(-daysSinceLastGame / FRESHNESS_PLATEAU_DAYS));
    freshnessBonus = Math.round(freshnessBonus * 100) / 100;
  }

  const priorOtPeriods = Math.max(0, Math.floor(lastGame.overtimePeriods));
  let overtimeFatigueBonus = 0;
  if (priorOtPeriods >= 2) {
    overtimeFatigueBonus = OVERTIME_MULTI_BONUS;
  } else if (priorOtPeriods === 1) {
    overtimeFatigueBonus = OVERTIME_SINGLE_BONUS;
  }

  const baseLoad = decayLoadScore + travelLoadScore + roadLoad;
  const multipliedLoad =
    baseLoad * b2bMultiplier * altMultiplier * stressMult;
  const finalScore = Math.max(
    0,
    multipliedLoad + freshnessBonus + overtimeFatigueBonus
  );

  return {
    score: Math.round(finalScore * 100) / 100,
    decayLoadScore,
    travelLoadScore,
    roadSegmentLoadScore: roadLoad,
    backToBackMultiplier: b2bMultiplier,
    altitudeMultiplier: altMultiplier,
    densityMultiplier: stressMult,
    freshnessBonus,
    overtimeFatigueBonus: Math.round(overtimeFatigueBonus * 100) / 100,
    gamesInLast7Days: games7,
    gamesInLast30Days: games30,
    roadTripConsecutiveAway: roadStreak,
    travelDistanceMiles: Math.round(totalTravelMiles),
    isBackToBack,
    daysSinceLastGame,
    isOvertimePenalty: overtimeFatigueBonus > 0,
    isThreeInFour,
    isFourInSix,
    hasCoastToCoastRoadSwing,
  };
}

export function calculateRestAdvantage(
  homeFatigue: FatigueResult,
  awayFatigue: FatigueResult
): number {
  return Math.round((awayFatigue.score - homeFatigue.score) * 100) / 100;
}
