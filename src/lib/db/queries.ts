import { and, asc, count, desc, eq, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./index";
import { fatigueScores, games, predictions, teams } from "./schema";
import {
  intersectDateBounds,
  monthCalendarBounds,
  regularSeasonDateBounds,
} from "@/lib/nba-season";
import type { FatigueInfo, GameDateCount, GameResponse, RestAdvantage } from "@/types";

const NEUTRAL_THRESHOLD = 0.5;

/** One fatigue row per (game, team), preferring the most recently computed. */
function latestFatigueSubquery(alias: string) {
  return db
    .selectDistinctOn(
      [fatigueScores.gameId, fatigueScores.teamId],
      {
        gameId: fatigueScores.gameId,
        teamId: fatigueScores.teamId,
        score: fatigueScores.score,
        isBackToBack: fatigueScores.isBackToBack,
        gamesInLast7Days: fatigueScores.gamesInLast7Days,
        gamesInLast30Days: fatigueScores.gamesInLast30Days,
        travelDistanceMiles: fatigueScores.travelDistanceMiles,
        altitudeMultiplier: fatigueScores.altitudeMultiplier,
        daysSinceLastGame: fatigueScores.daysSinceLastGame,
        isOvertimePenalty: fatigueScores.isOvertimePenalty,
        roadTripConsecutiveAway: fatigueScores.roadTripConsecutiveAway,
        isThreeInFour: fatigueScores.isThreeInFour,
        isFourInSix: fatigueScores.isFourInSix,
        hasCoastToCoastRoadSwing: fatigueScores.hasCoastToCoastRoadSwing,
      }
    )
    .from(fatigueScores)
    .orderBy(fatigueScores.gameId, fatigueScores.teamId, desc(fatigueScores.computedAt))
    .as(alias);
}

/**
 * NBA regular-season calendar window (Oct 1 → Apr 30) for the season label on each row.
 * Excludes May/June playoff dates that may be mis-tagged as regular in source data.
 */
const gameDateWithinRegularSeasonCalendar = sql`
  ${games.date} >= to_date(left(${games.season}, 4) || '-10-01', 'YYYY-MM-DD')
  AND ${games.date} <= to_date((left(${games.season}, 4)::integer + 1)::text || '-04-30', 'YYYY-MM-DD')
`;

/**
 * Returns all games scheduled for a given date (YYYY-MM-DD), with full team
 * info and pre-computed fatigue scores for both sides.
 */
export async function getGamesByDate(date: string): Promise<GameResponse[]> {
  const homeTeam = alias(teams, "home_team");
  const awayTeam = alias(teams, "away_team");
  const homeFatigue = latestFatigueSubquery("home_fatigue_latest");
  const awayFatigue = latestFatigueSubquery("away_fatigue_latest");

  const rows = await db
    .select({
      // Game
      id: games.id,
      externalId: games.externalId,
      date: games.date,
      season: games.season,
      status: games.status,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      // Home team
      homeTeamName: homeTeam.name,
      homeTeamAbbreviation: homeTeam.abbreviation,
      homeTeamCity: homeTeam.city,
      homeTeamAltitude: homeTeam.altitudeFlag,
      // Away team
      awayTeamName: awayTeam.name,
      awayTeamAbbreviation: awayTeam.abbreviation,
      awayTeamCity: awayTeam.city,
      // Home fatigue
      homeFatigueScore: homeFatigue.score,
      homeIsBackToBack: homeFatigue.isBackToBack,
      homeGamesInLast7Days: homeFatigue.gamesInLast7Days,
      homeGamesInLast30Days: homeFatigue.gamesInLast30Days,
      homeTravelDistanceMiles: homeFatigue.travelDistanceMiles,
      homeAltitudeMultiplier: homeFatigue.altitudeMultiplier,
      homeDaysSinceLastGame: homeFatigue.daysSinceLastGame,
      homeIsOvertimePenalty: homeFatigue.isOvertimePenalty,
      homeRoadTripConsecutiveAway: homeFatigue.roadTripConsecutiveAway,
      homeIsThreeInFour: homeFatigue.isThreeInFour,
      homeIsFourInSix: homeFatigue.isFourInSix,
      homeHasCoastToCoastRoadSwing: homeFatigue.hasCoastToCoastRoadSwing,
      // Away fatigue
      awayFatigueScore: awayFatigue.score,
      awayIsBackToBack: awayFatigue.isBackToBack,
      awayGamesInLast7Days: awayFatigue.gamesInLast7Days,
      awayGamesInLast30Days: awayFatigue.gamesInLast30Days,
      awayTravelDistanceMiles: awayFatigue.travelDistanceMiles,
      awayAltitudeMultiplier: awayFatigue.altitudeMultiplier,
      awayDaysSinceLastGame: awayFatigue.daysSinceLastGame,
      awayIsOvertimePenalty: awayFatigue.isOvertimePenalty,
      awayRoadTripConsecutiveAway: awayFatigue.roadTripConsecutiveAway,
      awayIsThreeInFour: awayFatigue.isThreeInFour,
      awayIsFourInSix: awayFatigue.isFourInSix,
      awayHasCoastToCoastRoadSwing: awayFatigue.hasCoastToCoastRoadSwing,
    })
    .from(games)
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .leftJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .leftJoin(
      awayFatigue,
      and(eq(awayFatigue.gameId, games.id), eq(awayFatigue.teamId, games.awayTeamId))
    )
    .where(and(eq(games.date, date), eq(games.gameType, "regular")));

  return rows.map((row) => {
    const homeFatigueData = buildFatigueInfo(
      row.homeFatigueScore,
      row.homeIsBackToBack,
      row.homeGamesInLast7Days,
      row.homeGamesInLast30Days,
      row.homeDaysSinceLastGame,
      row.homeTravelDistanceMiles,
      row.homeAltitudeMultiplier,
      row.homeIsOvertimePenalty,
      row.homeIsThreeInFour,
      row.homeIsFourInSix,
      row.homeRoadTripConsecutiveAway,
      row.homeHasCoastToCoastRoadSwing,
      {
        side: "home",
        homeTeamCity: row.homeTeamCity,
        homeAltitudeFlag: row.homeTeamAltitude,
      }
    );

    const awayFatigueData = buildFatigueInfo(
      row.awayFatigueScore,
      row.awayIsBackToBack,
      row.awayGamesInLast7Days,
      row.awayGamesInLast30Days,
      row.awayDaysSinceLastGame,
      row.awayTravelDistanceMiles,
      row.awayAltitudeMultiplier,
      row.awayIsOvertimePenalty,
      row.awayIsThreeInFour,
      row.awayIsFourInSix,
      row.awayRoadTripConsecutiveAway,
      row.awayHasCoastToCoastRoadSwing,
      {
        side: "away",
        homeTeamCity: row.homeTeamCity,
        homeAltitudeFlag: row.homeTeamAltitude,
      }
    );

    const restAdvantage = buildRestAdvantage(homeFatigueData, awayFatigueData);

    return {
      id: row.id,
      externalId: row.externalId,
      date: row.date,
      season: row.season,
      status: row.status,
      homeTeam: {
        id: row.homeTeamId,
        name: row.homeTeamName,
        abbreviation: row.homeTeamAbbreviation,
        city: row.homeTeamCity,
      },
      awayTeam: {
        id: row.awayTeamId,
        name: row.awayTeamName,
        abbreviation: row.awayTeamAbbreviation,
        city: row.awayTeamCity,
      },
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      homeFatigue: homeFatigueData,
      awayFatigue: awayFatigueData,
      restAdvantage,
    };
  });
}

/**
 * Returns each calendar date in the season (optionally filtered to one month)
 * with a count of regular-season games on that date.
 */
export async function getRegularSeasonGameDatesWithCounts(
  season: string,
  month?: number
): Promise<GameDateCount[]> {
  const seasonBounds = regularSeasonDateBounds(season);
  const window =
    month === undefined
      ? seasonBounds
      : intersectDateBounds(seasonBounds, monthCalendarBounds(season, month));
  if (!window) {
    return [];
  }

  const rows = await db
    .select({
      date: games.date,
      gameCount: sql<number>`cast(count(*) as integer)`,
    })
    .from(games)
    .where(
      and(
        eq(games.season, season),
        eq(games.gameType, "regular"),
        gte(games.date, window.from),
        lte(games.date, window.to)
      )
    )
    .groupBy(games.date)
    .orderBy(asc(games.date));

  return rows.map((r) => ({
    date: String(r.date),
    gameCount: Number(r.gameCount),
  }));
}

// ─── Analysis query ─────────────────────────────────────────────

type CompletedGameRow = {
  date: string;
  season: string;
  homeScore: number | null;
  awayScore: number | null;
  spread: string | null;
  homeFatigueScore: string;
  awayFatigueScore: string;
};

/**
 * Returns all final games that have fatigue scores computed for both teams.
 * Only the fields needed for analysis are selected to keep the payload lean.
 */
export async function getCompletedGamesWithFatigue(): Promise<CompletedGameRow[]> {
  const homeFatigue = latestFatigueSubquery("home_fatigue_latest");
  const awayFatigue = latestFatigueSubquery("away_fatigue_latest");

  return db
    .select({
      date: games.date,
      season: games.season,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      spread: games.spread,
      homeFatigueScore: homeFatigue.score,
      awayFatigueScore: awayFatigue.score,
    })
    .from(games)
    .innerJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .innerJoin(
      awayFatigue,
      and(eq(awayFatigue.gameId, games.id), eq(awayFatigue.teamId, games.awayTeamId))
    )
    .where(
      and(
        eq(games.status, "final"),
        eq(games.gameType, "regular"),
        isNotNull(games.homeScore),
        isNotNull(games.awayScore),
        gameDateWithinRegularSeasonCalendar
      )
    );
}

// ─── Accuracy tracker query ──────────────────────────────────────

type ResolvedPredictionRow = {
  date: string;
  season: string;
  predictedAdvantageTeamId: number;
  actualWinnerId: number;
  differential: string;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamAbbreviation: string;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamAbbreviation: string;
  predictedTeamName: string;
  predictedTeamAbbreviation: string;
  actualWinnerName: string;
  actualWinnerAbbreviation: string;
};

/**
 * Returns all resolved regular-season predictions (actualWinnerId is set) joined
 * with full team details for both sides, sorted by game date then prediction creation time.
 */
export async function getResolvedPredictions(): Promise<ResolvedPredictionRow[]> {
  const homeTeam = alias(teams, "ht");
  const awayTeam = alias(teams, "at");
  const predictedTeam = alias(teams, "pt");
  const actualWinnerTeam = alias(teams, "awt");

  const latestResolved = db
    .selectDistinctOn([predictions.gameId], {
      gameId: predictions.gameId,
      predictedAdvantageTeamId: predictions.predictedAdvantageTeamId,
      actualWinnerId: predictions.actualWinnerId,
      differential: predictions.restAdvantageDifferential,
    })
    .from(predictions)
    .where(isNotNull(predictions.actualWinnerId))
    .orderBy(predictions.gameId, desc(predictions.createdAt))
    .as("latest_resolved_pred");

  const rows = await db
    .select({
      date: games.date,
      season: games.season,
      predictedAdvantageTeamId: latestResolved.predictedAdvantageTeamId,
      actualWinnerId: latestResolved.actualWinnerId,
      differential: latestResolved.differential,
      homeTeamId: games.homeTeamId,
      homeTeamName: homeTeam.name,
      homeTeamAbbreviation: homeTeam.abbreviation,
      awayTeamId: games.awayTeamId,
      awayTeamName: awayTeam.name,
      awayTeamAbbreviation: awayTeam.abbreviation,
      predictedTeamName: predictedTeam.name,
      predictedTeamAbbreviation: predictedTeam.abbreviation,
      actualWinnerName: actualWinnerTeam.name,
      actualWinnerAbbreviation: actualWinnerTeam.abbreviation,
    })
    .from(latestResolved)
    .innerJoin(games, eq(games.id, latestResolved.gameId))
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .innerJoin(
      predictedTeam,
      eq(latestResolved.predictedAdvantageTeamId, predictedTeam.id)
    )
    .innerJoin(
      actualWinnerTeam,
      eq(latestResolved.actualWinnerId, actualWinnerTeam.id)
    )
    .where(
      and(
        eq(games.gameType, "regular"),
        gameDateWithinRegularSeasonCalendar
      )
    )
    .orderBy(games.date);

  // The INNER JOIN on actualWinnerTeam ensures actualWinnerId is non-null,
  // but Drizzle can't narrow the type from a JOIN condition alone.
  return rows as ResolvedPredictionRow[];
}

export type UpcomingPredictionRow = {
  gameId: number;
  date: string;
  homeTeamAbbreviation: string;
  awayTeamAbbreviation: string;
  predictedTeamAbbreviation: string;
  differential: string;
};

/**
 * Open predictions for a season (not yet graded), scheduled games on/after `fromDateYmd`.
 * One row per game (latest prediction row if duplicates exist).
 */
export async function getUpcomingPredictionsForSeason(
  season: string,
  fromDateYmd: string
): Promise<UpcomingPredictionRow[]> {
  const homeTeam = alias(teams, "ht");
  const awayTeam = alias(teams, "at");
  const predictedTeam = alias(teams, "pt");

  const latestOpen = db
    .selectDistinctOn([predictions.gameId], {
      gameId: predictions.gameId,
      predictedAdvantageTeamId: predictions.predictedAdvantageTeamId,
      differential: predictions.restAdvantageDifferential,
    })
    .from(predictions)
    .where(isNull(predictions.actualWinnerId))
    .orderBy(predictions.gameId, desc(predictions.createdAt))
    .as("latest_open_pred");

  const rows = await db
    .select({
      gameId: games.id,
      date: games.date,
      homeTeamAbbreviation: homeTeam.abbreviation,
      awayTeamAbbreviation: awayTeam.abbreviation,
      predictedTeamAbbreviation: predictedTeam.abbreviation,
      differential: latestOpen.differential,
    })
    .from(latestOpen)
    .innerJoin(games, eq(games.id, latestOpen.gameId))
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .innerJoin(
      predictedTeam,
      eq(latestOpen.predictedAdvantageTeamId, predictedTeam.id)
    )
    .where(
      and(
        eq(games.season, season),
        eq(games.gameType, "regular"),
        eq(games.status, "scheduled"),
        gte(games.date, fromDateYmd),
        gameDateWithinRegularSeasonCalendar
      )
    )
    .orderBy(asc(games.date), asc(games.id));

  return rows.map((r) => ({
    gameId: r.gameId,
    date: String(r.date),
    homeTeamAbbreviation: r.homeTeamAbbreviation,
    awayTeamAbbreviation: r.awayTeamAbbreviation,
    predictedTeamAbbreviation: r.predictedTeamAbbreviation,
    differential: String(r.differential),
  }));
}

// ─── Game search query ────────────────────────────────────────────

type SearchFilters = {
  minRA?: number;
  team?: string;   // team abbreviation — either home or away
  season?: string; // "YYYY-YY"
};

type SearchRow = {
  date: string;
  season: string;
  homeTeamAbbr: string;
  awayTeamAbbr: string;
  homeScore: number | null;
  awayScore: number | null;
  homeFatigueScore: string;
  awayFatigueScore: string;
};

/**
 * Returns final regular-season games matching the given filters, newest first.
 * Result filtering (correct/incorrect) and pagination are done by the caller
 * after computing restedTeamWon in JavaScript.
 */
export async function searchRegularSeasonGames(filters: SearchFilters): Promise<SearchRow[]> {
  const homeTeam = alias(teams, "home_team");
  const awayTeam = alias(teams, "away_team");
  const homeFatigue = latestFatigueSubquery("home_fatigue_latest");
  const awayFatigue = latestFatigueSubquery("away_fatigue_latest");

  // Build conditions array — always filter to regular season final games
  const conditions = [
    eq(games.status, "final"),
    eq(games.gameType, "regular"),
    isNotNull(games.homeScore),
    isNotNull(games.awayScore),
    gameDateWithinRegularSeasonCalendar,
  ];

  if (filters.season) {
    conditions.push(eq(games.season, filters.season));
  }

  if (filters.team) {
    // TypeScript requires a non-nullable assertion; `or` can return undefined when given no args
    const teamCond = or(
      eq(homeTeam.abbreviation, filters.team),
      eq(awayTeam.abbreviation, filters.team)
    );
    if (teamCond) conditions.push(teamCond);
  }

  if (filters.minRA && filters.minRA > 0) {
    conditions.push(
      sql`abs(cast(${awayFatigue.score} as numeric) - cast(${homeFatigue.score} as numeric)) >= ${filters.minRA}`
    );
  }

  return db
    .select({
      date: games.date,
      season: games.season,
      homeTeamAbbr: homeTeam.abbreviation,
      awayTeamAbbr: awayTeam.abbreviation,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeFatigueScore: homeFatigue.score,
      awayFatigueScore: awayFatigue.score,
    })
    .from(games)
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .innerJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .innerJoin(
      awayFatigue,
      and(eq(awayFatigue.gameId, games.id), eq(awayFatigue.teamId, games.awayTeamId))
    )
    .where(and(...conditions))
    .orderBy(desc(games.date));
}

// ─── Private helpers ─────────────────────────────────────────────

type FatigueInfoContext = {
  side: "home" | "away";
  homeTeamCity: string;
  homeAltitudeFlag: boolean;
};

/** Builds a FatigueInfo object from raw DB columns, or returns null if no fatigue data exists. */
function buildFatigueInfo(
  score: string | null,
  isBackToBack: boolean | null,
  gamesInLast7Days: number | null,
  gamesInLast30Days: number | null,
  daysSinceLastGame: number | null,
  travelDistanceMiles: string | null,
  altitudeMultiplier: string | null,
  isOvertimePenalty: boolean | null,
  isThreeInFour: boolean | null,
  isFourInSix: boolean | null,
  roadTripConsecutiveAway: number | null,
  hasCoastToCoastRoadSwing: boolean | null,
  ctx: FatigueInfoContext
): FatigueInfo | null {
  if (score === null) return null;

  const altitudePenalty = parseFloat(altitudeMultiplier ?? "1") > 1.0;
  const altitudeArenaLabel =
    ctx.side === "away" && altitudePenalty && ctx.homeAltitudeFlag
      ? `${ctx.homeTeamCity} (altitude)`
      : null;

  return {
    score: parseFloat(score),
    isBackToBack: isBackToBack ?? false,
    is3In4: isThreeInFour ?? false,
    travelDistanceMiles: parseFloat(travelDistanceMiles ?? "0"),
    altitudePenalty,
    altitudeArenaLabel,
    daysRest: daysSinceLastGame,
    gamesInLast7Days: gamesInLast7Days ?? 0,
    gamesInLast30Days: gamesInLast30Days ?? 0,
    is4In6: isFourInSix ?? false,
    isOvertimePenalty: isOvertimePenalty ?? false,
    roadTripConsecutiveAway: roadTripConsecutiveAway ?? 0,
    hasCoastToCoastRoadSwing: hasCoastToCoastRoadSwing ?? false,
  };
}

/** Calculates rest advantage from the two teams' fatigue data. */
function buildRestAdvantage(
  home: FatigueInfo | null,
  away: FatigueInfo | null
): RestAdvantage | null {
  if (home === null || away === null) return null;

  const differential = away.score - home.score;
  let advantageTeam: RestAdvantage["advantageTeam"];

  if (differential > NEUTRAL_THRESHOLD) {
    advantageTeam = "home";
  } else if (differential < -NEUTRAL_THRESHOLD) {
    advantageTeam = "away";
  } else {
    advantageTeam = "neutral";
  }

  return { differential, advantageTeam };
}
