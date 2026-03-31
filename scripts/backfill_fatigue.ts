/**
 * Fatigue backfill script — computes fatigue_scores for games that are missing them.
 *
 * Only processes games that do NOT already have a fatigue_scores entry for the home team,
 * so it is safe to run multiple times without reprocessing already-scored games.
 *
 * Fatigue scores use the same model for all games; `game_type` in the DB is for filtering only.
 * Processes games in chronological order (oldest first) since fatigue depends on prior games.
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill_fatigue.ts                         # all unscored games
 *   pnpm exec tsx scripts/backfill_fatigue.ts 2022-10-01 2023-06-30  # optional date range
 *   pnpm exec tsx scripts/backfill_fatigue.ts --force                 # wipe fatigue_scores, recompute all
 *
 * Typical runtime: scales with game count (~30–90+ minutes for 20 seasons / ~25k+ games).
 *
 * Prerequisite — `fatigue_scores` must include columns from `drizzle/0002_fatigue_schedule_road.sql`
 * (`games_in_last_30_days`, `road_trip_consecutive_away`, `is_three_in_four`, `is_four_in_six`,
 * `has_coast_to_coast_road_swing`). If inserts fail with "column does not exist", run:
 *   pnpm drizzle-kit push
 * or execute that SQL file in the Supabase SQL editor against the same DATABASE_URL.
 */

import { and, asc, between, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { fatigueScores, games, teams } from "@/lib/db/schema";
import { calculateFatigue } from "@/lib/fatigue";
import { fetchRecentGamesForTeam } from "@/lib/fatigue-recent-games";
import { loadEnvLocal } from "@/lib/load-env-local";

type AppDb = PostgresJsDatabase<typeof Schema>;

const REQUIRED_FATIGUE_COLUMNS = [
  "games_in_last_30_days",
  "road_trip_consecutive_away",
  "is_three_in_four",
  "is_four_in_six",
  "has_coast_to_coast_road_swing",
] as const;

/**
 * Fails fast with a clear message when Supabase/schema is behind `src/lib/db/schema.ts`
 * (avoids thousands of identical insert errors).
 */
async function assertFatigueScoresSchema(appDb: AppDb): Promise<void> {
  const result = await appDb.execute(
    sql.raw(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'fatigue_scores'
       AND column_name IN (${REQUIRED_FATIGUE_COLUMNS.map((c) => `'${c}'`).join(", ")})`
    )
  );
  const rows = result as unknown as { column_name: string }[];
  const found = new Set(rows.map((r) => r.column_name));
  const missing = REQUIRED_FATIGUE_COLUMNS.filter((c) => !found.has(c));
  if (missing.length > 0) {
    console.error(
      "[backfill] fatigue_scores is missing column(s): %s\n" +
        "Apply migration drizzle/0002_fatigue_schedule_road.sql or run: pnpm drizzle-kit push\n" +
        "(Uses DATABASE_URL from .env.local — same DB the backfill targets.)",
      missing.join(", ")
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  loadEnvLocal();

  const args = process.argv.slice(2).filter((a) => a !== "--force");
  const force = process.argv.includes("--force");
  const startArg = args[0];
  const endArg = args[1];

  if (startArg && !/^\d{4}-\d{2}-\d{2}$/.test(startArg)) {
    console.error(
      "Usage: backfill_fatigue.ts [--force] [YYYY-MM-DD start] [YYYY-MM-DD end]"
    );
    process.exit(1);
  }
  if (endArg && !/^\d{4}-\d{2}-\d{2}$/.test(endArg)) {
    console.error(
      "Usage: backfill_fatigue.ts [--force] [YYYY-MM-DD start] [YYYY-MM-DD end]"
    );
    process.exit(1);
  }

  if (force && (startArg || endArg)) {
    console.warn(
      "[backfill] --force: date range arguments are ignored; recomputing all games."
    );
  }

  const { db } = await import("@/lib/db");
  const appDb = db as AppDb;

  await assertFatigueScoresSchema(appDb);

  // ── Load all teams ───────────────────────────────────────────────
  const teamRows = await appDb.select().from(teams);
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  let gamesToProcess: Array<{
    id: number;
    externalId: string;
    date: string;
    homeTeamId: number;
    awayTeamId: number;
  }>;

  if (force) {
    console.log("[backfill] --force: deleting all fatigue_scores...");
    await appDb.delete(fatigueScores).where(sql`true`);
    gamesToProcess = await appDb
      .select({
        id: games.id,
        externalId: games.externalId,
        date: games.date,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
      })
      .from(games)
      .orderBy(asc(games.date));
  } else {
    const homeFatigue = alias(fatigueScores, "home_fatigue");

    const whereClause =
      startArg && endArg
        ? and(isNull(homeFatigue.id), between(games.date, startArg, endArg))
        : isNull(homeFatigue.id);

    gamesToProcess = await appDb
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
  }

  if (gamesToProcess.length === 0) {
    console.log(
      force
        ? "No games in database. Nothing to do."
        : "No games are missing fatigue scores. Nothing to do."
    );
    return;
  }

  console.log(
    `${force ? "Recomputing" : "Found"} ${gamesToProcess.length} games${force ? "" : " without fatigue scores"}. Starting backfill...`
  );

  let gamesProcessed = 0;
  let totalRows = 0;
  let errorCount = 0;

  for (const game of gamesToProcess) {
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
      const awayLat = parseFloat(away.latitude);
      const awayLon = parseFloat(away.longitude);
      const visitingAltitudeAway = home.altitudeFlag === true;

      const recentHome = await fetchRecentGamesForTeam(appDb, game.homeTeamId, dateStr);
      const homeResult = calculateFatigue(
        dateStr,
        recentHome,
        false,
        homeLat,
        homeLon,
        homeLat,
        homeLon,
        true
      );

      const recentAway = await fetchRecentGamesForTeam(appDb, game.awayTeamId, dateStr);
      const awayResult = calculateFatigue(
        dateStr,
        recentAway,
        visitingAltitudeAway,
        awayLat,
        awayLon,
        homeLat,
        homeLon,
        false
      );

      const entries: Array<{ teamId: number; result: typeof homeResult }> = [
        { teamId: game.homeTeamId, result: homeResult },
        { teamId: game.awayTeamId, result: awayResult },
      ];

      for (const { teamId, result: r } of entries) {
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
        totalRows++;
      }
    } catch (err) {
      console.error(`  [ERROR] game ${game.id} (${game.date}):`, err);
      errorCount++;
    }

    gamesProcessed++;
    if (gamesProcessed % 100 === 0) {
      console.log(
        `  ${gamesProcessed}/${gamesToProcess.length} games processed (${totalRows} fatigue rows written, ${errorCount} errors)`
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
