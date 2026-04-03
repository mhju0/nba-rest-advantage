import { format, parseISO, subDays } from "date-fns";
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./index";
import { fatigueScores, games, predictions, teams } from "./schema";
import {
  intersectDateBounds,
  monthCalendarBounds,
  regularSeasonDateBounds,
} from "@/lib/nba-season";
import type {
  FatigueInfo,
  GameDateCount,
  GameDetailResponse,
  GameResponse,
  RestAdvantage,
  TeamRecentResultGame,
} from "@/types";

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
        travelDistanceMiles: fatigueScores.travelDistanceMiles,
        altitudeMultiplier: fatigueScores.altitudeMultiplier,
        daysSinceLastGame: fatigueScores.daysSinceLastGame,
        isOvertimePenalty: fatigueScores.isOvertimePenalty,
        roadTripConsecutiveAway: fatigueScores.roadTripConsecutiveAway,
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
 * Games a team played in the `days` calendar days before `gameDateYmd` (exclusive of game day).
 */
async function countTeamGamesInDaysBefore(
  teamId: number,
  gameDateYmd: string,
  days: number
): Promise<number> {
  const tip = parseISO(gameDateYmd);
  const start = format(subDays(tip, days), "yyyy-MM-dd");
  const agg = await db
    .select({ c: count() })
    .from(games)
    .where(
      and(
        or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId)),
        eq(games.status, "final"),
        gte(games.date, start),
        lt(games.date, gameDateYmd)
      )
    );
  return Number(agg[0]?.c ?? 0);
}

/** True when the team plays its 4th+ game in a rolling 6-day window ending on `gameDate`. */
async function computeIs4In6Map(
  gameDate: string,
  teamIds: number[]
): Promise<Map<number, boolean>> {
  const start = format(subDays(parseISO(gameDate), 5), "yyyy-MM-dd");
  const unique = [...new Set(teamIds)];
  const out = new Map<number, boolean>();
  for (const tid of unique) {
    const n = await db
      .select({ c: count() })
      .from(games)
      .where(
        and(
          or(eq(games.homeTeamId, tid), eq(games.awayTeamId, tid)),
          gte(games.date, start),
          lte(games.date, gameDate),
          or(
            eq(games.date, gameDate),
            and(lt(games.date, gameDate), eq(games.status, "final"))
          )
        )
      );
    out.set(tid, Number(n[0]?.c ?? 0) >= 4);
  }
  return out;
}

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
      homeMoneyline: games.homeMoneyline,
      awayMoneyline: games.awayMoneyline,
      spread: games.spread,
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
      homeTravelDistanceMiles: homeFatigue.travelDistanceMiles,
      homeAltitudeMultiplier: homeFatigue.altitudeMultiplier,
      homeDaysSinceLastGame: homeFatigue.daysSinceLastGame,
      homeIsOvertimePenalty: homeFatigue.isOvertimePenalty,
      homeRoadTripConsecutiveAway: homeFatigue.roadTripConsecutiveAway,
      homeHasCoastToCoastRoadSwing: homeFatigue.hasCoastToCoastRoadSwing,
      // Away fatigue
      awayFatigueScore: awayFatigue.score,
      awayIsBackToBack: awayFatigue.isBackToBack,
      awayGamesInLast7Days: awayFatigue.gamesInLast7Days,
      awayTravelDistanceMiles: awayFatigue.travelDistanceMiles,
      awayAltitudeMultiplier: awayFatigue.altitudeMultiplier,
      awayDaysSinceLastGame: awayFatigue.daysSinceLastGame,
      awayIsOvertimePenalty: awayFatigue.isOvertimePenalty,
      awayRoadTripConsecutiveAway: awayFatigue.roadTripConsecutiveAway,
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

  const teamIds = rows.flatMap((r) => [r.homeTeamId, r.awayTeamId]);
  const uniqueTeamIds = [...new Set(teamIds)];
  const [is4In6Map, games30Map] = await Promise.all([
    computeIs4In6Map(date, teamIds),
    (async () => {
      const m = new Map<number, number>();
      await Promise.all(
        uniqueTeamIds.map(async (tid) => {
          m.set(tid, await countTeamGamesInDaysBefore(tid, date, 30));
        })
      );
      return m;
    })(),
  ]);

  return rows.map((row) =>
    mapJoinedRowToGameResponse(row, is4In6Map, games30Map)
  );
}

/** Shared row shape from getGamesByDate / getGameById joins. */
type GameFatigueJoinRow = {
  id: number;
  externalId: string;
  date: string;
  season: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
  spread: string | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  homeTeamAbbreviation: string;
  homeTeamCity: string;
  homeTeamAltitude: boolean;
  awayTeamName: string;
  awayTeamAbbreviation: string;
  awayTeamCity: string;
  homeFatigueScore: string | null;
  homeIsBackToBack: boolean | null;
  homeGamesInLast7Days: number | null;
  homeTravelDistanceMiles: string | null;
  homeAltitudeMultiplier: string | null;
  homeDaysSinceLastGame: number | null;
  homeIsOvertimePenalty: boolean | null;
  homeRoadTripConsecutiveAway: number | null;
  homeHasCoastToCoastRoadSwing: boolean | null;
  awayFatigueScore: string | null;
  awayIsBackToBack: boolean | null;
  awayGamesInLast7Days: number | null;
  awayTravelDistanceMiles: string | null;
  awayAltitudeMultiplier: string | null;
  awayDaysSinceLastGame: number | null;
  awayIsOvertimePenalty: boolean | null;
  awayRoadTripConsecutiveAway: number | null;
  awayHasCoastToCoastRoadSwing: boolean | null;
};

function mapJoinedRowToGameResponse(
  row: GameFatigueJoinRow,
  is4In6Map: Map<number, boolean>,
  games30Map: Map<number, number>
): GameResponse {
  const homeFatigueData = buildFatigueInfo(
    row.homeFatigueScore,
    row.homeIsBackToBack,
    row.homeGamesInLast7Days,
    row.homeDaysSinceLastGame,
    row.homeTravelDistanceMiles,
    row.homeAltitudeMultiplier,
    row.homeIsOvertimePenalty,
    {
      gamesInLast30Days: games30Map.get(row.homeTeamId) ?? 0,
      is4In6: is4In6Map.get(row.homeTeamId) ?? false,
      roadTripConsecutiveAway: row.homeRoadTripConsecutiveAway ?? 0,
      hasCoastToCoastRoadSwing: row.homeHasCoastToCoastRoadSwing ?? false,
    },
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
    row.awayDaysSinceLastGame,
    row.awayTravelDistanceMiles,
    row.awayAltitudeMultiplier,
    row.awayIsOvertimePenalty,
    {
      gamesInLast30Days: games30Map.get(row.awayTeamId) ?? 0,
      is4In6: is4In6Map.get(row.awayTeamId) ?? false,
      roadTripConsecutiveAway: row.awayRoadTripConsecutiveAway ?? 0,
      hasCoastToCoastRoadSwing: row.awayHasCoastToCoastRoadSwing ?? false,
    },
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
    date: String(row.date),
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
    homeMoneyline: row.homeMoneyline ?? null,
    awayMoneyline: row.awayMoneyline ?? null,
    spread: row.spread !== null ? parseFloat(String(row.spread)) : null,
  };
}

/**
 * Single regular-season game by primary key (for detail modal / deep links).
 */
export async function getGameById(id: number): Promise<GameResponse | null> {
  const homeTeam = alias(teams, "home_team");
  const awayTeam = alias(teams, "away_team");
  const homeFatigue = latestFatigueSubquery("home_fatigue_latest");
  const awayFatigue = latestFatigueSubquery("away_fatigue_latest");

  const rows = await db
    .select({
      id: games.id,
      externalId: games.externalId,
      date: games.date,
      season: games.season,
      status: games.status,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeMoneyline: games.homeMoneyline,
      awayMoneyline: games.awayMoneyline,
      spread: games.spread,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeTeamName: homeTeam.name,
      homeTeamAbbreviation: homeTeam.abbreviation,
      homeTeamCity: homeTeam.city,
      homeTeamAltitude: homeTeam.altitudeFlag,
      awayTeamName: awayTeam.name,
      awayTeamAbbreviation: awayTeam.abbreviation,
      awayTeamCity: awayTeam.city,
      homeFatigueScore: homeFatigue.score,
      homeIsBackToBack: homeFatigue.isBackToBack,
      homeGamesInLast7Days: homeFatigue.gamesInLast7Days,
      homeTravelDistanceMiles: homeFatigue.travelDistanceMiles,
      homeAltitudeMultiplier: homeFatigue.altitudeMultiplier,
      homeDaysSinceLastGame: homeFatigue.daysSinceLastGame,
      homeIsOvertimePenalty: homeFatigue.isOvertimePenalty,
      homeRoadTripConsecutiveAway: homeFatigue.roadTripConsecutiveAway,
      homeHasCoastToCoastRoadSwing: homeFatigue.hasCoastToCoastRoadSwing,
      awayFatigueScore: awayFatigue.score,
      awayIsBackToBack: awayFatigue.isBackToBack,
      awayGamesInLast7Days: awayFatigue.gamesInLast7Days,
      awayTravelDistanceMiles: awayFatigue.travelDistanceMiles,
      awayAltitudeMultiplier: awayFatigue.altitudeMultiplier,
      awayDaysSinceLastGame: awayFatigue.daysSinceLastGame,
      awayIsOvertimePenalty: awayFatigue.isOvertimePenalty,
      awayRoadTripConsecutiveAway: awayFatigue.roadTripConsecutiveAway,
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
    .where(and(eq(games.id, id), eq(games.gameType, "regular")))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const dateStr = String(row.date);
  const teamIds = [row.homeTeamId, row.awayTeamId];
  const [is4In6Map, games30Map] = await Promise.all([
    computeIs4In6Map(dateStr, teamIds),
    (async () => {
      const m = new Map<number, number>();
      await Promise.all(
        teamIds.map(async (tid) => {
          m.set(tid, await countTeamGamesInDaysBefore(tid, dateStr, 30));
        })
      );
      return m;
    })(),
  ]);

  return mapJoinedRowToGameResponse(row, is4In6Map, games30Map);
}

const RECENT_RESULTS_LOOKBACK_DAYS = 7;

/**
 * Final games for `teamId` in the 7 calendar days before `beforeDateYmd` (exclusive).
 */
export async function getTeamRecentFinalResults(
  teamId: number,
  beforeDateYmd: string
): Promise<TeamRecentResultGame[]> {
  const tip = parseISO(beforeDateYmd);
  const windowStart = format(subDays(tip, RECENT_RESULTS_LOOKBACK_DAYS), "yyyy-MM-dd");
  const homeT = alias(teams, "rh");
  const awayT = alias(teams, "ra");

  const rows = await db
    .select({
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeAbbr: homeT.abbreviation,
      awayAbbr: awayT.abbreviation,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
    })
    .from(games)
    .innerJoin(homeT, eq(games.homeTeamId, homeT.id))
    .innerJoin(awayT, eq(games.awayTeamId, awayT.id))
    .where(
      and(
        eq(games.gameType, "regular"),
        eq(games.status, "final"),
        isNotNull(games.homeScore),
        isNotNull(games.awayScore),
        gte(games.date, windowStart),
        lt(games.date, beforeDateYmd),
        or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId))
      )
    )
    .orderBy(desc(games.date));

  return rows.map((r) => {
    const isHome = r.homeTeamId === teamId;
    const hs = r.homeScore as number;
    const as = r.awayScore as number;
    const teamScore = isHome ? hs : as;
    const opponentScore = isHome ? as : hs;
    const opponentAbbreviation = isHome ? r.awayAbbr : r.homeAbbr;
    const won = teamScore > opponentScore;
    return {
      date: String(r.date),
      opponentAbbreviation,
      isHome,
      teamScore,
      opponentScore,
      won,
    };
  });
}

export async function getGameDetailById(id: number): Promise<GameDetailResponse | null> {
  const game = await getGameById(id);
  if (!game) return null;

  const [homeRecentWeek, awayRecentWeek] = await Promise.all([
    getTeamRecentFinalResults(game.homeTeam.id, game.date),
    getTeamRecentFinalResults(game.awayTeam.id, game.date),
  ]);

  return { game, homeRecentWeek, awayRecentWeek };
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
  id: number;
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
      id: games.id,
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

type FatigueScheduleExtras = {
  gamesInLast30Days: number;
  is4In6: boolean;
  roadTripConsecutiveAway: number;
  hasCoastToCoastRoadSwing: boolean;
};

/** Builds a FatigueInfo object from raw DB columns, or returns null if no fatigue data exists. */
function buildFatigueInfo(
  score: string | null,
  isBackToBack: boolean | null,
  gamesInLast7Days: number | null,
  daysSinceLastGame: number | null,
  travelDistanceMiles: string | null,
  altitudeMultiplier: string | null,
  isOvertimePenalty: boolean | null,
  extras: FatigueScheduleExtras,
  ctx: FatigueInfoContext
): FatigueInfo | null {
  if (score === null) return null;

  const g7 = gamesInLast7Days ?? 0;
  const dRest = daysSinceLastGame;
  const is3In4Approx =
    g7 >= 3 && dRest !== null && dRest <= 2;

  const altitudePenalty = parseFloat(altitudeMultiplier ?? "1") > 1.0;
  const altitudeArenaLabel =
    ctx.side === "away" && altitudePenalty && ctx.homeAltitudeFlag
      ? `${ctx.homeTeamCity} (altitude)`
      : null;

  return {
    score: parseFloat(score),
    isBackToBack: isBackToBack ?? false,
    is3In4: is3In4Approx,
    travelDistanceMiles: parseFloat(travelDistanceMiles ?? "0"),
    altitudePenalty,
    altitudeArenaLabel,
    daysRest: daysSinceLastGame,
    gamesInLast7Days: g7,
    gamesInLast30Days: extras.gamesInLast30Days,
    is4In6: extras.is4In6,
    isOvertimePenalty: isOvertimePenalty ?? false,
    // Road-trip streak is only shown for the visiting team (type contract).
    roadTripConsecutiveAway:
      ctx.side === "home" ? 0 : extras.roadTripConsecutiveAway,
    hasCoastToCoastRoadSwing: extras.hasCoastToCoastRoadSwing,
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
