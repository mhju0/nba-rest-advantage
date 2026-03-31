/**
 * Backfill fatigue_scores for all games in chronological order.
 * Run: npx tsx src/lib/backfill-fatigue.ts
 *
 * Skips rows that already exist. After algorithm changes (e.g. overtime load),
 * truncate `fatigue_scores` or delete affected rows, ensure `games.overtime_periods`
 * is populated, then re-run.
 */

import { asc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as Schema from "./db/schema";
import { fatigueScores, games, teams } from "./db/schema";
import { calculateFatigue, type FatigueResult } from "./fatigue";
import { fetchRecentGamesForTeam } from "./fatigue-recent-games";
import { loadEnvLocal } from "./load-env-local";

type AppDb = PostgresJsDatabase<typeof Schema>;

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

        const awayLat = parseFloat(away.latitude);
        const awayLon = parseFloat(away.longitude);

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
              homeLon,
              homeLat,
              homeLon,
              true
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
              awayLat,
              awayLon,
              homeLat,
              homeLon,
              false
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
