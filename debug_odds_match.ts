/**
 * Debug script: run with `pnpm exec tsx scripts/debug_odds_match.ts`
 * 
 * Fetches odds from the API and prints what it's trying to match,
 * then queries the DB to show what's actually there.
 */

import { loadEnvLocal } from "@/lib/load-env-local";
loadEnvLocal();

import { db } from "@/lib/db";
import { games, teams } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ODDS_API_TEAM_MAP } from "@/lib/odds-team-map";

const API_KEY = process.env.THE_ODDS_API_KEY;
if (!API_KEY) {
  console.log("THE_ODDS_API_KEY not set");
  process.exit(0);
}

async function main() {
  // 1. Fetch odds events
  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${API_KEY}&regions=us&markets=h2h&oddsFormat=american`;
  const res = await fetch(url);
  const events = await res.json();

  console.log(`\n=== ODDS API returned ${events.length} events ===\n`);

  const homeTeam = alias(teams, "homeTeam");
  const awayTeam = alias(teams, "awayTeam");

  for (const ev of events.slice(0, 5)) {
    const homeAbbr = ODDS_API_TEAM_MAP[ev.home_team];
    const awayAbbr = ODDS_API_TEAM_MAP[ev.away_team];

    // Show what the API gives us
    const commenceUTC = new Date(ev.commence_time);
    const dateUTC = commenceUTC.toISOString().slice(0, 10);

    // ET conversion
    const dateET = commenceUTC.toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    console.log(`Event: ${ev.away_team} @ ${ev.home_team}`);
    console.log(`  commence_time: ${ev.commence_time}`);
    console.log(`  Date (UTC):    ${dateUTC}`);
    console.log(`  Date (ET):     ${dateET}`);
    console.log(`  Home abbr:     ${homeAbbr ?? "NOT FOUND in map"} (from "${ev.home_team}")`);
    console.log(`  Away abbr:     ${awayAbbr ?? "NOT FOUND in map"} (from "${ev.away_team}")`);

    if (!homeAbbr || !awayAbbr) {
      console.log(`  ❌ Team name not in ODDS_API_TEAM_MAP\n`);
      continue;
    }

    // Query DB with UTC date
    const matchUTC = await db
      .select({ id: games.id, date: games.date, status: games.status })
      .from(games)
      .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
      .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
      .where(
        and(
          eq(games.date, dateUTC),
          eq(homeTeam.abbreviation, homeAbbr),
          eq(awayTeam.abbreviation, awayAbbr)
        )
      );

    // Query DB with ET date
    const matchET = await db
      .select({ id: games.id, date: games.date, status: games.status })
      .from(games)
      .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
      .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
      .where(
        and(
          eq(games.date, dateET),
          eq(homeTeam.abbreviation, homeAbbr),
          eq(awayTeam.abbreviation, awayAbbr)
        )
      );

    console.log(`  DB match (UTC date ${dateUTC}): ${matchUTC.length > 0 ? `✅ game ID ${matchUTC[0].id}` : "❌ none"}`);
    console.log(`  DB match (ET date ${dateET}):  ${matchET.length > 0 ? `✅ game ID ${matchET[0].id}` : "❌ none"}`);

    // Also check: do any games exist for this home team around this date?
    const nearby = await db
      .select({ id: games.id, date: games.date, status: games.status })
      .from(games)
      .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
      .where(
        and(
          eq(homeTeam.abbreviation, homeAbbr),
          gte(games.date, dateUTC),
          sql`${games.date} <= ${dateET}::date + interval '2 days'`
        )
      );

    if (nearby.length > 0) {
      console.log(`  Nearby games for ${homeAbbr} (home): ${nearby.map(g => `${g.date} (ID ${g.id}, ${g.status})`).join(", ")}`);
    } else {
      console.log(`  ⚠️  No games at all for ${homeAbbr} as home team near this date`);
    }

    console.log();
  }

  // 3. Summary: how many scheduled games are in DB from today onward?
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const upcoming = await db
    .select({ count: sql<number>`count(*)` })
    .from(games)
    .where(and(eq(games.status, "scheduled"), gte(games.date, today)));

  console.log(`=== DB has ${upcoming[0].count} scheduled games from ${today} onward ===`);

  process.exit(0);
}

main().catch(console.error);
