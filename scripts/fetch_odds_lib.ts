/**
 * Fetch NBA h2h moneylines from the-odds-api.com and update `games.home_moneyline` / `away_moneyline`.
 * Used by `fetch_odds.ts` and `run-daily.ts`.
 */

import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "@/lib/db/schema";
import { games, teams } from "@/lib/db/schema";
import { ODDS_API_TEAM_MAP } from "@/lib/odds-team-map";

type AppDb = PostgresJsDatabase<typeof Schema>;

const ODDS_API_URL =
  "https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?regions=us&markets=h2h&oddsFormat=american";

interface OddsOutcome {
  name: string;
  price: number;
}

interface OddsMarket {
  key: string;
  outcomes: OddsOutcome[];
}

interface OddsBookmaker {
  markets: OddsMarket[];
}

interface OddsApiEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

export type FetchAndStoreOddsResult = {
  updated: number;
  skipped: number;
  eventsTotal: number;
  requestsRemaining: string | null;
};

function commenceTimeToEtYmd(isoUtc: string): string {
  const d = new Date(isoUtc);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function extractH2hPrices(event: OddsApiEvent): { home: number; away: number } | null {
  for (const bm of event.bookmakers ?? []) {
    for (const market of bm.markets ?? []) {
      if (market.key !== "h2h") continue;
      const homeOutcome = market.outcomes?.find((o) => o.name === event.home_team);
      const awayOutcome = market.outcomes?.find((o) => o.name === event.away_team);
      if (
        homeOutcome !== undefined &&
        awayOutcome !== undefined &&
        Number.isFinite(homeOutcome.price) &&
        Number.isFinite(awayOutcome.price)
      ) {
        return {
          home: Math.round(homeOutcome.price),
          away: Math.round(awayOutcome.price),
        };
      }
    }
  }
  return null;
}

async function fetchOddsEvents(
  apiKey: string
): Promise<{ events: OddsApiEvent[]; requestsRemaining: string | null }> {
  const url = `${ODDS_API_URL}&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Odds API ${res.status}: ${text.slice(0, 200)}`);
  }
  const events = (await res.json()) as OddsApiEvent[];
  const requestsRemaining = res.headers.get("x-requests-remaining");
  return { events: Array.isArray(events) ? events : [], requestsRemaining };
}

/**
 * Reads `THE_ODDS_API_KEY` from the environment, fetches NBA h2h American odds, and updates
 * scheduled rows in `games` when date + home/away abbreviations match. Returns `{ updated: 0, … }`
 * if the key is missing.
 */
export async function fetchAndStoreOdds(db: AppDb): Promise<FetchAndStoreOddsResult> {
  const apiKey = process.env.THE_ODDS_API_KEY?.trim();
  if (!apiKey) {
    return {
      updated: 0,
      skipped: 0,
      eventsTotal: 0,
      requestsRemaining: null,
    };
  }

  const { events, requestsRemaining } = await fetchOddsEvents(apiKey);
  const eventsTotal = events.length;

  const homeTeam = alias(teams, "odds_home");
  const awayTeam = alias(teams, "odds_away");

  let updated = 0;
  let skipped = 0;

  for (const event of events) {
    const homeAbbr = ODDS_API_TEAM_MAP[event.home_team];
    const awayAbbr = ODDS_API_TEAM_MAP[event.away_team];
    if (!homeAbbr || !awayAbbr) {
      skipped++;
      continue;
    }

    const dateYmd = commenceTimeToEtYmd(event.commence_time);
    const prices = extractH2hPrices(event);
    if (!prices) {
      skipped++;
      continue;
    }

    const matched = await db
      .select({ id: games.id })
      .from(games)
      .innerJoin(homeTeam, eq(games.homeTeamId, homeTeam.id))
      .innerJoin(awayTeam, eq(games.awayTeamId, awayTeam.id))
      .where(
        and(
          eq(games.date, dateYmd),
          eq(homeTeam.abbreviation, homeAbbr),
          eq(awayTeam.abbreviation, awayAbbr),
          eq(games.status, "scheduled")
        )
      )
      .limit(1);

    const gameId = matched[0]?.id;
    if (gameId === undefined) {
      skipped++;
      continue;
    }

    await db
      .update(games)
      .set({
        homeMoneyline: prices.home,
        awayMoneyline: prices.away,
      })
      .where(eq(games.id, gameId));
    updated++;
  }

  return { updated, skipped, eventsTotal, requestsRemaining };
}
