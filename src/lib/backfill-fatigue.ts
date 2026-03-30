/**
 * Backfill fatigue_scores for all games in chronological order.
 * Run: npx tsx src/lib/backfill-fatigue.ts
 */

import { format, parseISO, subDays } from "date-fns";
import { and, asc, eq, gte, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { alias } from "drizzle-orm/pg-core";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type * as Schema from "./db/schema";
import { games, teams, fatigueScores } from "./db/schema";
import {
  calculateFatigue,
  type FatigueResult,
  type RecentGame,
} from "./fatigue";

type AppDb = PostgresJsDatabase<typeof Schema>;

/** Load `.env.local` when DATABASE_URL is unset (tsx does not load Next.js env). */
function loadEnvLocal(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

interface PriorGameRow {
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  homeLat: string;
  homeLon: string;
  homeAltitude: boolean;
  awayLat: string;
  awayLon: string;
  awayAltitude: boolean;
}

async function fetchRecentGamesForTeam(
  db: AppDb,
  teamId: number,
  gameDateStr: string
): Promise<RecentGame[]> {
  const windowStart = format(subDays(parseISO(gameDateStr), 7), "yyyy-MM-dd");
  const homeTeamAlias = alias(teams, "home_team");
  const awayTeamAlias = alias(teams, "away_team");

  const rows: PriorGameRow[] = await db
    .select({
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      homeLat: homeTeamAlias.latitude,
      homeLon: homeTeamAlias.longitude,
      homeAltitude: homeTeamAlias.altitudeFlag,
      awayLat: awayTeamAlias.latitude,
      awayLon: awayTeamAlias.longitude,
      awayAltitude: awayTeamAlias.altitudeFlag,
    })
    .from(games)
    .innerJoin(homeTeamAlias, eq(games.homeTeamId, homeTeamAlias.id))
    .innerJoin(awayTeamAlias, eq(games.awayTeamId, awayTeamAlias.id))
    .where(
      and(
        or(eq(games.homeTeamId, teamId), eq(games.awayTeamId, teamId)),
        gte(games.date, windowStart),
        lt(games.date, gameDateStr)
      )
    )
    .orderBy(asc(games.date));

  return rows.map((row) => rowToRecentGame(row, teamId));
}

function rowToRecentGame(row: PriorGameRow, teamId: number): RecentGame {
  const isHome = row.homeTeamId === teamId;
  if (isHome) {
    return {
      date: String(row.date),
      teamId,
      opponentTeamId: row.awayTeamId,
      isHome: true,
      teamLat: parseFloat(row.homeLat),
      teamLon: parseFloat(row.homeLon),
      opponentLat: parseFloat(row.awayLat),
      opponentLon: parseFloat(row.awayLon),
      opponentAltitudeFlag: row.awayAltitude,
    };
  }
  return {
    date: String(row.date),
    teamId,
    opponentTeamId: row.homeTeamId,
    isHome: false,
    teamLat: parseFloat(row.awayLat),
    teamLon: parseFloat(row.awayLon),
    opponentLat: parseFloat(row.homeLat),
    opponentLon: parseFloat(row.homeLon),
    opponentAltitudeFlag: row.homeAltitude,
  };
}

async function main(): Promise<void> {
  loadEnvLocal();

  // Dynamic import so `.env.local` is applied before `./db` reads DATABASE_URL.
  const { db } = await import("./db");
  const appDb = db as AppDb;

  const allGames = await appDb
    .select({
      id: games.id,
      date: games.date,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
    })
    .from(games)
    .orderBy(asc(games.date));

  const teamRows = await appDb.select().from(teams);
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  const existingKeys = new Set(
    (
      await appDb
        .select({
          gameId: fatigueScores.gameId,
          teamId: fatigueScores.teamId,
        })
        .from(fatigueScores)
    ).map((r) => `${r.gameId}:${r.teamId}`)
  );

  const total = allGames.length;

  for (let i = 0; i < allGames.length; i++) {
    const game = allGames[i];
    try {
      const gameDateStr = String(game.date);
      const home = teamById.get(game.homeTeamId);
      const away = teamById.get(game.awayTeamId);
      if (!home || !away) {
        console.warn(
          `[backfill] skip game ${game.id}: missing team row (home=${game.homeTeamId} away=${game.awayTeamId})`
        );
      } else {
        const homeLat = parseFloat(home.latitude);
        const homeLon = parseFloat(home.longitude);
        const visitingAltitudeAway = home.altitudeFlag === true;

        const toInsert: Array<{
          gameId: number;
          teamId: number;
          result: FatigueResult;
        }> = [];

        if (!existingKeys.has(`${game.id}:${game.homeTeamId}`)) {
          const recentHome = await fetchRecentGamesForTeam(
            appDb,
            game.homeTeamId,
            gameDateStr
          );
          toInsert.push({
            gameId: game.id,
            teamId: game.homeTeamId,
            result: calculateFatigue(
              gameDateStr,
              recentHome,
              false,
              homeLat,
              homeLon
            ),
          });
        }

        if (!existingKeys.has(`${game.id}:${game.awayTeamId}`)) {
          const recentAway = await fetchRecentGamesForTeam(
            appDb,
            game.awayTeamId,
            gameDateStr
          );
          toInsert.push({
            gameId: game.id,
            teamId: game.awayTeamId,
            result: calculateFatigue(
              gameDateStr,
              recentAway,
              visitingAltitudeAway,
              homeLat,
              homeLon
            ),
          });
        }

        for (const row of toInsert) {
          const r = row.result;
          await appDb.insert(fatigueScores).values({
            gameId: row.gameId,
            teamId: row.teamId,
            score: String(r.score),
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
          });
          existingKeys.add(`${row.gameId}:${row.teamId}`);
        }
      }
    } catch (err) {
      console.error(`[backfill] game ${game.id} failed:`, err);
    }

    if ((i + 1) % 100 === 0 || i + 1 === total) {
      console.log(`[backfill] progress ${i + 1}/${total} games (id ${game.id})`);
    }
  }

  console.log("[backfill] done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
