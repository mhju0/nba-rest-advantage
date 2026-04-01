/**
 * Reports data gaps: games missing fatigue scores, optional scheduled-slate gaps.
 *
 * Usage (repo root, DATABASE_URL in .env.local):
 *   npx tsx scripts/audit_data.ts
 *
 * "Old formula" note: fatigue model changes are not version-stored in the DB.
 * If you shipped new fatigue logic, recompute with:
 *   pnpm exec tsx scripts/backfill_fatigue.ts --force
 */

import { and, count, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { loadEnvLocal } from "@/lib/load-env-local";
import { db } from "@/lib/db";
import { fatigueScores, games } from "@/lib/db/schema";

async function main(): Promise<void> {
  loadEnvLocal();

  const homeF = alias(fatigueScores, "hf");
  const awayF = alias(fatigueScores, "af");

  const finalRegular = and(
    eq(games.status, "final"),
    eq(games.gameType, "regular"),
    isNotNull(games.homeScore),
    isNotNull(games.awayScore)
  );

  const missingHomeFatigue = await db
    .select({ c: count() })
    .from(games)
    .leftJoin(
      homeF,
      and(eq(homeF.gameId, games.id), eq(homeF.teamId, games.homeTeamId))
    )
    .where(and(finalRegular, isNull(homeF.id)));

  const missingAwayFatigue = await db
    .select({ c: count() })
    .from(games)
    .leftJoin(
      awayF,
      and(eq(awayF.gameId, games.id), eq(awayF.teamId, games.awayTeamId))
    )
    .where(and(finalRegular, isNull(awayF.id)));

  const missingEither = await db
    .select({ c: count() })
    .from(games)
    .leftJoin(
      homeF,
      and(eq(homeF.gameId, games.id), eq(homeF.teamId, games.homeTeamId))
    )
    .leftJoin(
      awayF,
      and(eq(awayF.gameId, games.id), eq(awayF.teamId, games.awayTeamId))
    )
    .where(
      and(finalRegular, or(isNull(homeF.id), isNull(awayF.id)))
    );

  const scheduledNoFatigue = await db
    .select({ c: count() })
    .from(games)
    .leftJoin(
      homeF,
      and(eq(homeF.gameId, games.id), eq(homeF.teamId, games.homeTeamId))
    )
    .where(
      and(
        eq(games.status, "scheduled"),
        eq(games.gameType, "regular"),
        isNull(homeF.id)
      )
    );

  const totalGames = await db.select({ c: count() }).from(games);
  const totalFatigueRows = await db.select({ c: count() }).from(fatigueScores);

  const staleComputed = await db
    .select({
      oldest: sql<string>`min(${fatigueScores.computedAt})::text`,
      newest: sql<string>`max(${fatigueScores.computedAt})::text`,
    })
    .from(fatigueScores);

  console.log("── NBA Rest Advantage — data audit ──\n");
  console.log(`Total games rows:           ${totalGames[0]?.c ?? 0}`);
  console.log(`Total fatigue_scores rows: ${totalFatigueRows[0]?.c ?? 0}`);
  console.log(
    `Fatigue computedAt range:   ${staleComputed[0]?.oldest ?? "—"} … ${staleComputed[0]?.newest ?? "—"}`
  );
  console.log("");
  console.log(
    `Final regular games missing HOME fatigue row:  ${missingHomeFatigue[0]?.c ?? 0}`
  );
  console.log(
    `Final regular games missing AWAY fatigue row: ${missingAwayFatigue[0]?.c ?? 0}`
  );
  console.log(
    `Final regular games missing either side:      ${missingEither[0]?.c ?? 0}`
  );
  console.log(
    `Scheduled regular games missing home fatigue: ${scheduledNoFatigue[0]?.c ?? 0} (run run-daily / backfill_fatigue)`
  );
  console.log("");
  console.log(
    "To refresh all fatigue with the current TypeScript model: pnpm exec tsx scripts/backfill_fatigue.ts --force"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
