/**
 * Daily pipeline (invoked from `scripts/daily_update.py` in GitHub Actions):
 * 1. Recompute fatigue_scores for all games on the target date (usually "today" ET).
 * 2. Replace unresolved predictions for scheduled games on that date.
 *
 * Usage: pnpm exec tsx scripts/run-daily.ts YYYY-MM-DD
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { fatigueScores, games, predictions, teams } from "@/lib/db/schema";
import { calculateFatigue } from "@/lib/fatigue";
import { fetchRecentGamesForTeam } from "@/lib/fatigue-recent-games";
import { loadEnvLocal } from "@/lib/load-env-local";

const NEUTRAL_THRESHOLD = 0.5;

type AppDb = PostgresJsDatabase<typeof Schema>;

async function main(): Promise<void> {
  loadEnvLocal();

  const dateArg = process.argv[2];
  if (!dateArg || !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    console.error("Usage: pnpm exec tsx scripts/run-daily.ts YYYY-MM-DD");
    process.exit(1);
  }

  const { db } = await import("@/lib/db");
  const appDb = db as AppDb;

  const teamRows = await appDb.select().from(teams);
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  const todaysGames = await appDb
    .select({
      id: games.id,
      externalId: games.externalId,
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      status: games.status,
    })
    .from(games)
    .where(eq(games.date, dateArg))
    .orderBy(asc(games.id));

  const gameIds = todaysGames.map((g) => g.id);

  if (gameIds.length === 0) {
    console.log(`[run-daily] No games in DB for ${dateArg}; skipping fatigue & predictions.`);
    return;
  }

  await appDb.delete(fatigueScores).where(inArray(fatigueScores.gameId, gameIds));

  let fatigueRows = 0;

  for (const game of todaysGames) {
    const home = teamById.get(game.homeTeamId);
    const away = teamById.get(game.awayTeamId);
    if (!home || !away) {
      console.warn(`[run-daily] skip game ${game.id}: missing team`);
      continue;
    }

    const gameDateStr = String(game.date);
    const homeLat = parseFloat(home.latitude);
    const homeLon = parseFloat(home.longitude);
    const awayLat = parseFloat(away.latitude);
    const awayLon = parseFloat(away.longitude);
    const visitingAltitudeAway = home.altitudeFlag === true;

    const recentHome = await fetchRecentGamesForTeam(appDb, game.homeTeamId, gameDateStr);
    const homeResult = calculateFatigue(
      gameDateStr,
      recentHome,
      false,
      homeLat,
      homeLon,
      homeLat,
      homeLon,
      true
    );

    const recentAway = await fetchRecentGamesForTeam(appDb, game.awayTeamId, gameDateStr);
    const awayResult = calculateFatigue(
      gameDateStr,
      recentAway,
      visitingAltitudeAway,
      awayLat,
      awayLon,
      homeLat,
      homeLon,
      false
    );

    const rows: Array<{ teamId: number; result: typeof homeResult }> = [
      { teamId: game.homeTeamId, result: homeResult },
      { teamId: game.awayTeamId, result: awayResult },
    ];

    for (const { teamId, result: r } of rows) {
      const adjustedScore = Math.round(r.score * 100) / 100;
      await appDb.insert(fatigueScores).values({
        gameId: game.id,
        teamId,
        score: String(adjustedScore),
        decayLoadScore: String(r.decayLoadScore),
        travelLoadScore: String(r.travelLoadScore),
        backToBackMultiplier: String(r.backToBackMultiplier),
        altitudeMultiplier: String(r.altitudeMultiplier),
        densityMultiplier: String(r.densityMultiplier),
        freshnessBonus: String(r.freshnessBonus),
        gamesInLast7Days: r.gamesInLast7Days,
        gamesInLast30Days: r.gamesInLast30Days,
        travelDistanceMiles: String(r.travelDistanceMiles),
        isBackToBack: r.isBackToBack,
        daysSinceLastGame: r.daysSinceLastGame,
        isOvertimePenalty: r.isOvertimePenalty,
        roadTripConsecutiveAway: r.roadTripConsecutiveAway,
        isThreeInFour: r.isThreeInFour,
        isFourInSix: r.isFourInSix,
        hasCoastToCoastRoadSwing: r.hasCoastToCoastRoadSwing,
      });
      fatigueRows++;
    }
  }

  const scheduledIds = todaysGames.filter((g) => g.status === "scheduled").map((g) => g.id);

  let predictionRows = 0;

  if (scheduledIds.length > 0) {
    await appDb
      .delete(predictions)
      .where(
        and(inArray(predictions.gameId, scheduledIds), isNull(predictions.actualWinnerId))
      );

    const fatigueForDay = await appDb
      .select({
        gameId: fatigueScores.gameId,
        teamId: fatigueScores.teamId,
        score: fatigueScores.score,
      })
      .from(fatigueScores)
      .where(inArray(fatigueScores.gameId, scheduledIds));

    const scoreByGameTeam = new Map<string, number>();
    for (const row of fatigueForDay) {
      scoreByGameTeam.set(`${row.gameId}:${row.teamId}`, parseFloat(row.score));
    }

    for (const game of todaysGames) {
      if (game.status !== "scheduled") continue;

      const h = scoreByGameTeam.get(`${game.id}:${game.homeTeamId}`);
      const a = scoreByGameTeam.get(`${game.id}:${game.awayTeamId}`);
      if (h === undefined || a === undefined || Number.isNaN(h) || Number.isNaN(a)) {
        console.warn(`[run-daily] skip prediction for game ${game.id}: missing fatigue`);
        continue;
      }

      const differential = a - h;
      let predictedAdvantageTeamId: number;
      if (differential > NEUTRAL_THRESHOLD) {
        predictedAdvantageTeamId = game.homeTeamId;
      } else if (differential < -NEUTRAL_THRESHOLD) {
        predictedAdvantageTeamId = game.awayTeamId;
      } else {
        predictedAdvantageTeamId = h <= a ? game.homeTeamId : game.awayTeamId;
      }

      await appDb.insert(predictions).values({
        gameId: game.id,
        predictedAdvantageTeamId,
        restAdvantageDifferential: String(
          Math.round(differential * 100) / 100
        ),
        actualWinnerId: null,
        spreadCovered: null,
      });
      predictionRows++;
    }
  }

  console.log(
    `[run-daily] ${dateArg}: fatigue rows written=${fatigueRows}, predictions written=${predictionRows}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
