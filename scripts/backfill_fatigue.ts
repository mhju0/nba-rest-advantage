/**
 * Fatigue backfill script — recomputes fatigue_scores for all (or a range of) games.
 *
 * Applies the playoff/finals fatigue multiplier introduced in Part 5.
 * Safe to run multiple times — deletes and recreates fatigue_scores for each processed date.
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill_fatigue.ts                      # all dates
 *   pnpm exec tsx scripts/backfill_fatigue.ts 2022-10-01 2023-06-30 # date range
 *
 * Typical runtime: ~5–10 minutes for 4 seasons (~6 000 games).
 */

import { and, asc, between, eq, inArray } from "drizzle-orm";
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

  // ── Fetch games in range (or all) ────────────────────────────────
  const gameQuery = appDb
    .select({
      id: games.id,
      externalId: games.externalId,
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
    })
    .from(games)
    .$dynamic();

  const allGames =
    startArg && endArg
      ? await gameQuery
          .where(between(games.date, startArg, endArg))
          .orderBy(asc(games.date))
      : await gameQuery.orderBy(asc(games.date));

  if (allGames.length === 0) {
    console.log("No games found for the given range.");
    return;
  }

  console.log(`Processing fatigue for ${allGames.length} games...`);

  // ── Group by date so we can delete fatigue per-date batch ────────
  const byDate = new Map<string, typeof allGames>();
  for (const g of allGames) {
    const dateStr = String(g.date);
    const list = byDate.get(dateStr) ?? [];
    list.push(g);
    byDate.set(dateStr, list);
  }

  const sortedDates = Array.from(byDate.keys()).sort();
  let totalRows = 0;
  let datesProcessed = 0;

  for (const dateStr of sortedDates) {
    const dayGames = byDate.get(dateStr)!;
    const gameIds = dayGames.map((g) => g.id);

    // Delete existing fatigue scores for this date's games
    await appDb
      .delete(fatigueScores)
      .where(inArray(fatigueScores.gameId, gameIds));

    for (const game of dayGames) {
      const home = teamById.get(game.homeTeamId);
      const away = teamById.get(game.awayTeamId);
      if (!home || !away) {
        console.warn(`skip game ${game.id}: missing team`);
        continue;
      }

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

      const rows: Array<{ teamId: number; result: typeof homeResult }> = [
        { teamId: game.homeTeamId, result: homeResult },
        { teamId: game.awayTeamId, result: awayResult },
      ];

      for (const { teamId, result: r } of rows) {
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
    }

    datesProcessed++;
    if (datesProcessed % 20 === 0) {
      console.log(
        `  ${datesProcessed}/${sortedDates.length} dates done (${totalRows} fatigue rows written)`
      );
    }
  }

  console.log(
    `\nBackfill complete: ${datesProcessed} dates, ${totalRows} fatigue rows written.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
