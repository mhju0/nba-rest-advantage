import { NextResponse } from "next/server";
import { eq, and, inArray } from "drizzle-orm";
import { format } from "date-fns";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";

/** Drizzle + `postgres` need the Node.js runtime (not Edge). */
export const runtime = "nodejs";

/** Never prerender — uses DB and live NBA feed. */
export const dynamic = "force-dynamic";

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
 * On Vercel, set `CRON_SECRET` in project env; the platform sends
 * `Authorization: Bearer <CRON_SECRET>` when invoking cron jobs.
 * Unauthenticated access is rejected when `VERCEL=1` or when
 * `CRON_SECRET` is set (so local/staging can lock the route too).
 *
 * On Vercel Hobby, crons are limited to once per day (`vercel.json`: 10:00 UTC).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const mustAuthenticate = Boolean(process.env.VERCEL) || Boolean(cronSecret);

  if (mustAuthenticate) {
    if (!cronSecret) {
      return NextResponse.json(
        {
          error:
            "Server misconfiguration: set CRON_SECRET in the project environment for Vercel cron",
        },
        { status: 503 }
      );
    }
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
      const dbId = normalizeStatsGameId(dbGame.externalId);
      const nbaGame = nbaGames.find(
        (g) => normalizeStatsGameId(g.gameId) === dbId
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

/** Align scoreboard `gameId` with DB `external_id` (zero-padded 10-digit stats id). */
function normalizeStatsGameId(id: string): string {
  const s = String(id).trim();
  if (/^\d+$/.test(s) && s.length < 10) {
    return s.padStart(10, "0");
  }
  return s;
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
