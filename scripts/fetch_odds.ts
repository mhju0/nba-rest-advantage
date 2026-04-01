/**
 * One-shot: pull NBA moneylines from the-odds-api.com and write to `games`.
 *
 * Usage: pnpm exec tsx scripts/fetch_odds.ts
 *
 * Requires `THE_ODDS_API_KEY` in `.env.local` (see README).
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { loadEnvLocal } from "@/lib/load-env-local";
import { fetchAndStoreOdds } from "./fetch_odds_lib";

async function main(): Promise<void> {
  loadEnvLocal();

  const key = process.env.THE_ODDS_API_KEY?.trim();
  if (!key) {
    console.log(
      "THE_ODDS_API_KEY is not set. Add it to .env.local to fetch odds (optional)."
    );
    process.exit(0);
  }

  const { db } = await import("@/lib/db");
  const result = await fetchAndStoreOdds(db as PostgresJsDatabase<typeof Schema>);

  console.log(
    `Updated odds for ${result.updated} of ${result.eventsTotal} events. Skipped ${result.skipped} (no DB match).`
  );
  if (result.requestsRemaining !== null) {
    console.log(`API requests remaining: ${result.requestsRemaining}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
