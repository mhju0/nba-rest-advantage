import { NextRequest, NextResponse } from "next/server";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { searchRegularSeasonGames } from "@/lib/db/queries";
import type { ApiResponse, GameSearchResponse, GameSearchResult } from "@/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const NEUTRAL_THRESHOLD = 0.5;

export async function GET(
  req: NextRequest
): Promise<NextResponse<ApiResponse<GameSearchResponse>>> {
  const { searchParams } = req.nextUrl;

  const minRA = parseFloat(searchParams.get("minRA") ?? "0") || 0;
  const team = searchParams.get("team") ?? "";
  const season = searchParams.get("season") ?? "";
  const result = searchParams.get("result") ?? "all"; // "all" | "correct" | "incorrect"
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10))
  );

  try {
    const rows = await searchRegularSeasonGames({
      minRA: minRA > 0 ? minRA : undefined,
      team: team || undefined,
      season: season || undefined,
    });

    // Compute rest advantage and outcome for each row
    const allResults: GameSearchResult[] = rows
      .filter((row) => row.homeScore !== null && row.awayScore !== null)
      .flatMap((row) => {
        const homeFatigue = parseFloat(row.homeFatigueScore);
        const awayFatigue = parseFloat(row.awayFatigueScore);
        const diff = awayFatigue - homeFatigue; // positive → home is more rested

        // Exclude neutral games
        if (Math.abs(diff) < NEUTRAL_THRESHOLD) return [];

        const advantageTeam: "home" | "away" = diff >= 0 ? "home" : "away";
        const homeWon = (row.homeScore as number) > (row.awayScore as number);
        const restedTeamWon = advantageTeam === "home" ? homeWon : !homeWon;

        return [
          {
            gameId: row.id,
            date: row.date,
            season: row.season,
            homeTeamAbbreviation: row.homeTeamAbbr,
            awayTeamAbbreviation: row.awayTeamAbbr,
            homeScore: row.homeScore as number,
            awayScore: row.awayScore as number,
            homeFatigueScore: homeFatigue,
            awayFatigueScore: awayFatigue,
            restAdvantageDifferential: Math.round(Math.abs(diff) * 100) / 100,
            advantageTeam,
            restedTeamWon,
          } satisfies GameSearchResult,
        ];
      });

    // Filter by outcome
    const filtered =
      result === "correct"
        ? allResults.filter((r) => r.restedTeamWon)
        : result === "incorrect"
          ? allResults.filter((r) => !r.restedTeamWon)
          : allResults;

    // Paginate
    const total = filtered.length;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      data: { games: paginated, total, page, limit },
      error: null,
    });
  } catch (err) {
    console.error("[api/games/search]", err);
    return NextResponse.json(
      {
        data: { games: [], total: 0, page, limit },
        error: getPublicApiErrorMessage(err),
      },
      { status: 500 }
    );
  }
}
