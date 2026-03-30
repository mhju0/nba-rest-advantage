import { and, eq, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./index";
import { fatigueScores, games, predictions, teams } from "./schema";
import type { FatigueInfo, GameResponse, RestAdvantage } from "@/types";

const NEUTRAL_THRESHOLD = 0.5;

/**
 * Returns all games scheduled for a given date (YYYY-MM-DD), with full team
 * info and pre-computed fatigue scores for both sides.
 */
export async function getGamesByDate(date: string): Promise<GameResponse[]> {
  const homeTeam = alias(teams, "home_team");
  const awayTeam = alias(teams, "away_team");
  const homeFatigue = alias(fatigueScores, "home_fatigue");
  const awayFatigue = alias(fatigueScores, "away_fatigue");

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
      // Away fatigue
      awayFatigueScore: awayFatigue.score,
      awayIsBackToBack: awayFatigue.isBackToBack,
      awayGamesInLast7Days: awayFatigue.gamesInLast7Days,
      awayTravelDistanceMiles: awayFatigue.travelDistanceMiles,
      awayAltitudeMultiplier: awayFatigue.altitudeMultiplier,
      awayDaysSinceLastGame: awayFatigue.daysSinceLastGame,
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
    .where(eq(games.date, date));

  return rows.map((row) => {
    const homeFatigueData = buildFatigueInfo(
      row.homeFatigueScore,
      row.homeIsBackToBack,
      row.homeGamesInLast7Days,
      row.homeDaysSinceLastGame,
      row.homeTravelDistanceMiles,
      row.homeAltitudeMultiplier
    );

    const awayFatigueData = buildFatigueInfo(
      row.awayFatigueScore,
      row.awayIsBackToBack,
      row.awayGamesInLast7Days,
      row.awayDaysSinceLastGame,
      row.awayTravelDistanceMiles,
      row.awayAltitudeMultiplier
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

// ─── Analysis query ─────────────────────────────────────────────

type CompletedGameRow = {
  date: string;
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
  const homeFatigue = alias(fatigueScores, "home_fatigue");
  const awayFatigue = alias(fatigueScores, "away_fatigue");

  return db
    .select({
      date: games.date,
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
        isNotNull(games.homeScore),
        isNotNull(games.awayScore)
      )
    );
}

// ─── Accuracy tracker query ──────────────────────────────────────

type ResolvedPredictionRow = {
  date: string;
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
 * Returns all resolved predictions (actualWinnerId is set) joined with full
 * team details for both sides, sorted by game date then prediction creation time.
 */
export async function getResolvedPredictions(): Promise<ResolvedPredictionRow[]> {
  const homeTeam = alias(teams, "ht");
  const awayTeam = alias(teams, "at");
  const predictedTeam = alias(teams, "pt");
  const actualWinnerTeam = alias(teams, "awt");

  const rows = await db
    .select({
      date: games.date,
      predictedAdvantageTeamId: predictions.predictedAdvantageTeamId,
      actualWinnerId: predictions.actualWinnerId,
      differential: predictions.restAdvantageDifferential,
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
    .from(predictions)
    .innerJoin(games, eq(predictions.gameId, games.id))
    .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
    .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
    .innerJoin(predictedTeam, eq(predictions.predictedAdvantageTeamId, predictedTeam.id))
    .innerJoin(actualWinnerTeam, eq(predictions.actualWinnerId, actualWinnerTeam.id))
    .where(isNotNull(predictions.actualWinnerId))
    .orderBy(games.date, predictions.createdAt);

  // The INNER JOIN on actualWinnerTeam ensures actualWinnerId is non-null,
  // but Drizzle can't narrow the type from a JOIN condition alone.
  return rows as ResolvedPredictionRow[];
}

// ─── Private helpers ─────────────────────────────────────────────

/** Builds a FatigueInfo object from raw DB columns, or returns null if no fatigue data exists. */
function buildFatigueInfo(
  score: string | null,
  isBackToBack: boolean | null,
  gamesInLast7Days: number | null,
  daysSinceLastGame: number | null,
  travelDistanceMiles: string | null,
  altitudeMultiplier: string | null
): FatigueInfo | null {
  if (score === null) return null;

  // is3In4: approximate — 3+ games in last 7 days while still within 2 days of last game
  const is3In4 =
    (gamesInLast7Days ?? 0) >= 3 && daysSinceLastGame !== null && daysSinceLastGame <= 2;

  return {
    score: parseFloat(score),
    isBackToBack: isBackToBack ?? false,
    is3In4,
    travelDistanceMiles: parseFloat(travelDistanceMiles ?? "0"),
    altitudePenalty: parseFloat(altitudeMultiplier ?? "1") > 1.0,
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
