import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getGamesByDate } from "@/lib/db/queries";
import type { ApiResponse, GameResponse } from "@/types";

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> }
): Promise<NextResponse<ApiResponse<GameResponse[]>>> {
  const { date } = await params;

  const parsed = DateSchema.safeParse(date);
  if (!parsed.success) {
    return NextResponse.json(
      { data: [], error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  try {
    const games = await getGamesByDate(parsed.data);
    return NextResponse.json({ data: games, error: null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ data: [], error: message }, { status: 500 });
  }
}
