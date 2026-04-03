import { NextRequest, NextResponse } from "next/server";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { getUpcomingGamesWithRA } from "@/lib/db/queries";
import type { ApiResponse, UpcomingGameWithRA } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest
): Promise<NextResponse<ApiResponse<UpcomingGameWithRA[]>>> {
  const { searchParams } = new URL(req.url);
  const minRA = Math.max(0, parseFloat(searchParams.get("minRA") ?? "0") || 0);
  const season = searchParams.get("season") ?? "2025-26";

  try {
    const games = await getUpcomingGamesWithRA(season, minRA);
    return NextResponse.json({ data: games, error: null });
  } catch (err) {
    console.error("[api/games/upcoming]", err);
    return NextResponse.json(
      { data: [], error: getPublicApiErrorMessage(err) },
      { status: 500 }
    );
  }
}
