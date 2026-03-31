import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";

/**
 * GET /api/cron/update
 *
 * Vercel Cron-compatible endpoint that updates live NBA game scores.
 * Checks for games currently in "live" status or scheduled for today,
 * fetches current scores from the NBA CDN, and updates the database.
 *
 * The Supabase Realtime subscription will automatically push changes
 * to all connected clients when the `games` table is updated.
 *
 * Secured with CRON_SECRET — set this in your environment variables.
 */
export async function GET(request: Request) {
  // Authenticate the request
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = format(new Date(), "yyyy-MM-dd");

    // Find all games that are live or scheduled for today
    const gamesToCheck = await db
      .select({
        id: games.id,
        externalId: games.externalId,
        status: games.status,
      })
      .from(games)
      .where(
        and(
          eq(games.date, today),
          inArray(games.status, ["scheduled", "live"])
        )
      );

    if (gamesToCheck.length === 0) {
      return NextResponse.json({
        data: { gamesUpdated: 0 },
        error: null,
        meta: { message: "No live or scheduled games to update" },
      });
    }

    // Fetch today's scoreboard from the NBA CDN
    const scoreboardUrl =
      "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";

    const response = await fetch(scoreboardUrl, {
      headers: { "User-Agent": "nba-rest-advantage/1.0" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      console.error("[cron/update] NBA scoreboard HTTP", response.status);
      return NextResponse.json(
        {
          data: { gamesUpdated: 0 },
          error:
            process.env.NODE_ENV === "production"
              ? "Live score feed unavailable"
              : `NBA CDN returned ${response.status}`,
        },
        { status: 502 }
      );
    }

    const scoreboard = (await response.json()) as NbaScoreboard;
    const nbaGames = scoreboard.scoreboard.games;

    let gamesUpdated = 0;

    for (const dbGame of gamesToCheck) {
      const nbaGame = nbaGames.find(
        (g) => g.gameId === dbGame.externalId
      );

      if (!nbaGame) continue;

      const newStatus = mapGameStatus(nbaGame.gameStatus);
      const homeScore = nbaGame.homeTeam.score;
      const awayScore = nbaGame.awayTeam.score;

      // Only update if something changed
      if (
        newStatus !== dbGame.status ||
        (newStatus !== "scheduled" && (homeScore > 0 || awayScore > 0))
      ) {
        await db
          .update(games)
          .set({
            status: newStatus,
            homeScore: homeScore > 0 ? homeScore : null,
            awayScore: awayScore > 0 ? awayScore : null,
          })
          .where(eq(games.id, dbGame.id));

        gamesUpdated++;
      }
    }

    return NextResponse.json({
      data: { gamesUpdated },
      error: null,
      meta: {
        checkedGames: gamesToCheck.length,
        nbaGamesAvailable: nbaGames.length,
      },
    });
  } catch (err) {
    console.error("[cron/update] Error:", err);
    return NextResponse.json(
      {
        data: { gamesUpdated: 0 },
        error: getPublicApiErrorMessage(err),
      },
      { status: 500 }
    );
  }
}

// ─── NBA API types ──────────────────────────────────────────────

interface NbaScoreboard {
  scoreboard: {
    games: NbaGame[];
  };
}

interface NbaGame {
  gameId: string;
  /** 1 = scheduled, 2 = live, 3 = final */
  gameStatus: number;
  homeTeam: { score: number };
  awayTeam: { score: number };
}

/** Maps NBA API gameStatus code to our internal status string. */
function mapGameStatus(nbaStatus: number): string {
  switch (nbaStatus) {
    case 2:
      return "live";
    case 3:
      return "final";
    default:
      return "scheduled";
  }
}
