import { format, parseISO, subDays } from "date-fns";
import { and, asc, eq, gte, lt, or } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { alias } from "drizzle-orm/pg-core";
import type * as Schema from "./db/schema";
import { games, teams } from "./db/schema";
import type { RecentGame } from "./fatigue";

type AppDb = PostgresJsDatabase<typeof Schema>;

export interface PriorGameRow {
  date: string;
  homeTeamId: number;
  awayTeamId: number;
  homeLat: string;
  homeLon: string;
  homeAltitude: boolean;
  awayLat: string;
  awayLon: string;
  awayAltitude: boolean;
  overtimePeriods: number;
}

import { FATIGUE_RECENT_LOOKBACK_DAYS } from "./fatigue";

/**
 * Loads a team's prior games in the fatigue lookback window (see `FATIGUE_RECENT_LOOKBACK_DAYS`)
 * before `gameDateStr`, ordered oldest → newest.
 */
export async function fetchRecentGamesForTeam(
  db: AppDb,
  teamId: number,
  gameDateStr: string
): Promise<RecentGame[]> {
  const windowStart = format(
    subDays(parseISO(gameDateStr), FATIGUE_RECENT_LOOKBACK_DAYS),
    "yyyy-MM-dd"
  );
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
      overtimePeriods: games.overtimePeriods,
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

export function rowToRecentGame(row: PriorGameRow, teamId: number): RecentGame {
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
      overtimePeriods: row.overtimePeriods,
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
    overtimePeriods: row.overtimePeriods,
  };
}
