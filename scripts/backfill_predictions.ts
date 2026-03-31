/**
 * Prediction backfill script — retroactively generates predictions for all
 * completed regular-season games that have fatigue scores.
 *
 * Prediction rule: the team with the LOWER fatigue score (more rested) is
 * predicted to win. Games with |differential| < 0.5 are skipped (neutral).
 *
 * Safe to run multiple times — games that already have a prediction entry
 * are skipped.
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill_predictions.ts
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { fatigueScores, games, predictions, teams } from "@/lib/db/schema";
import { loadEnvLocal } from "@/lib/load-env-local";

type AppDb = PostgresJsDatabase<typeof Schema>;

const NEUTRAL_THRESHOLD = 0.5;

async function main(): Promise<void> {
  loadEnvLocal();

  const { db } = await import("@/lib/db");
  const appDb = db as AppDb;

  // ── Find game IDs that already have predictions ──────────────────
  const existingRows = await appDb
    .select({ gameId: predictions.gameId })
    .from(predictions);
  const existingGameIds = new Set(existingRows.map((r) => r.gameId));
  console.log(`Found ${existingGameIds.size} games with existing predictions (will skip).`);

  // ── Query all final regular-season games with both fatigue scores ──
  const homeFatigue = alias(fatigueScores, "home_fatigue");
  const awayFatigue = alias(fatigueScores, "away_fatigue");

  const allGames = await appDb
    .select({
      id: games.id,
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
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
        isNotNull(games.awayScore)
      )
    )
    .orderBy(games.date);

  const toProcess = allGames.filter((g) => !existingGameIds.has(g.id));
  console.log(`\nFound ${allGames.length} total regular-season games with fatigue scores.`);
  console.log(`Processing ${toProcess.length} new games...\n`);

  if (toProcess.length === 0) {
    console.log("Nothing to do — all games already have predictions.");
    return;
  }

  let inserted = 0;
  let skippedNeutral = 0;
  let errors = 0;
  let correctPredictions = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const game = toProcess[i];

    try {
      const homeFat = parseFloat(game.homeFatigueScore);
      const awayFat = parseFloat(game.awayFatigueScore);

      // differential = awayFatigue - homeFatigue
      // positive → home team is more rested (lower fatigue)
      const differential = awayFat - homeFat;

      if (Math.abs(differential) < NEUTRAL_THRESHOLD) {
        skippedNeutral++;
        continue;
      }

      // Predicted winner = the team with LOWER fatigue (more rested)
      const predictedTeamId =
        differential >= 0 ? game.homeTeamId : game.awayTeamId;

      // Actual winner
      const homeScore = game.homeScore as number;
      const awayScore = game.awayScore as number;
      const actualWinnerId = homeScore > awayScore ? game.homeTeamId : game.awayTeamId;

      if (predictedTeamId === actualWinnerId) correctPredictions++;

      await appDb.insert(predictions).values({
        gameId: game.id,
        predictedAdvantageTeamId: predictedTeamId,
        restAdvantageDifferential: String(Math.round(differential * 100) / 100),
        actualWinnerId,
        spreadCovered: null,
        createdAt: new Date(game.date),
      });

      inserted++;
    } catch (err) {
      console.error(`  [ERROR] game ${game.id} (${game.date}):`, err);
      errors++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(
        `  ${i + 1}/${toProcess.length} games processed (${inserted} inserted, ${skippedNeutral} neutral, ${errors} errors)`
      );
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  const total = inserted;
  const accuracy =
    total > 0 ? Math.round((correctPredictions / total) * 1000) / 10 : 0;

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Backfill complete.`);
  console.log(`  Total predictions inserted : ${inserted.toLocaleString()}`);
  console.log(`  Skipped (neutral, |RA|<0.5): ${skippedNeutral.toLocaleString()}`);
  console.log(`  Errors                     : ${errors}`);
  console.log(`  Correct predictions        : ${correctPredictions.toLocaleString()}`);
  console.log(`  Overall accuracy           : ${accuracy}%`);
  console.log(`${"─".repeat(50)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
