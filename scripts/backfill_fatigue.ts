/**
 * Fatigue backfill script — computes fatigue_scores for games that are missing them.
 *
 * Only processes games that do NOT already have a fatigue_scores entry for the home team,
 * so it is safe to run multiple times without reprocessing already-scored games.
 *
 * Applies the playoff/finals fatigue multiplier based on the game_type column.
 * Processes games in chronological order (oldest first) since fatigue depends on prior games.
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill_fatigue.ts                      # all unscored games
 *   pnpm exec tsx scripts/backfill_fatigue.ts 2022-10-01 2023-06-30 # optional date range
 *
 * Typical runtime: ~15–25 minutes for 9 seasons (~10 000+ games).
 */

import { and, asc, between, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { fatigueScores, games, teams } from "@/lib/db/schema";
import { calculateFatigue, getSeasonTypeMultiplier } from "@/lib/fatigue";
import { fetchRecentGamesForTeam } from "@/lib/fatigue-recent-games";
import { loadEnvLocal } from "@/lib/load-env-local";

type AppDb = PostgresJsDatabase<typeof Schema>;

async function main(): Promise<void> {
  loadEnvLocal();

  const startArg = process.argv[2];
  const endArg = process.argv[3];

  if (startArg && !/^\d{4}-\d{2}-\d{2}$/.test(startArg)) {
    console.error("Usage: backfill_fatigue.ts [YYYY-MM-DD start] [YYYY-MM-DD end]");
    process.exit(1);
  }

  const { db } = await import("@/lib/db");
  const appDb = db as AppDb;

  // ── Load all teams ───────────────────────────────────────────────
  const teamRows = await appDb.select().from(teams);
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  // ── Fetch only games missing fatigue scores ──────────────────────
  // Left-join on the home team's fatigue entry; NULL means not yet computed.
  const homeFatigue = alias(fatigueScores, "home_fatigue");

  const whereClause =
    startArg && endArg
      ? and(isNull(homeFatigue.id), between(games.date, startArg, endArg))
      : isNull(homeFatigue.id);

  const ungradedGames = await appDb
    .select({
      id: games.id,
      externalId: games.externalId,
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
    })
    .from(games)
    .leftJoin(
      homeFatigue,
      and(eq(homeFatigue.gameId, games.id), eq(homeFatigue.teamId, games.homeTeamId))
    )
    .where(whereClause)
    .orderBy(asc(games.date));

  if (ungradedGames.length === 0) {
    console.log("No games are missing fatigue scores. Nothing to do.");
    return;
  }

  console.log(`Found ${ungradedGames.length} games without fatigue scores. Starting backfill...`);

  let gamesProcessed = 0;
  let totalRows = 0;
  let errorCount = 0;

  for (const game of ungradedGames) {
    try {
      const home = teamById.get(game.homeTeamId);
      const away = teamById.get(game.awayTeamId);
      if (!home || !away) {
        console.warn(`  [SKIP] game ${game.id} (${game.date}): missing team record`);
        errorCount++;
        gamesProcessed++;
        continue;
      }

      const dateStr = String(game.date);
      const homeLat = parseFloat(home.latitude);
      const homeLon = parseFloat(home.longitude);
      const visitingAltitudeAway = home.altitudeFlag === true;

      const recentHome = await fetchRecentGamesForTeam(appDb, game.homeTeamId, dateStr);
      const homeResult = calculateFatigue(dateStr, recentHome, false, homeLat, homeLon);

      const recentAway = await fetchRecentGamesForTeam(appDb, game.awayTeamId, dateStr);
      const awayResult = calculateFatigue(
        dateStr,
        recentAway,
        visitingAltitudeAway,
        homeLat,
        homeLon
      );

      // Apply playoff/finals multiplier to the stored score
      const multiplier = getSeasonTypeMultiplier(String(game.externalId), dateStr);

      const entries: Array<{ teamId: number; result: typeof homeResult }> = [
        { teamId: game.homeTeamId, result: homeResult },
        { teamId: game.awayTeamId, result: awayResult },
      ];

      for (const { teamId, result: r } of entries) {
        const adjustedScore = Math.round(r.score * multiplier * 100) / 100;
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
          travelDistanceMiles: String(r.travelDistanceMiles),
          isBackToBack: r.isBackToBack,
          daysSinceLastGame: r.daysSinceLastGame,
          isOvertimePenalty: r.isOvertimePenalty,
        });
        totalRows++;
      }
    } catch (err) {
      console.error(`  [ERROR] game ${game.id} (${game.date}):`, err);
      errorCount++;
    }

    gamesProcessed++;
    if (gamesProcessed % 100 === 0) {
      console.log(
        `  ${gamesProcessed}/${ungradedGames.length} games processed (${totalRows} fatigue rows written, ${errorCount} errors)`
      );
    }
  }

  console.log(
    `\nBackfill complete: ${gamesProcessed} games processed, ${totalRows} fatigue rows written, ${errorCount} errors.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
