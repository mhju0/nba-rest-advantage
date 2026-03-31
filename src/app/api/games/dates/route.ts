import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { getRegularSeasonGameDatesWithCounts } from "@/lib/db/queries";
import { NBA_SEASONS } from "@/lib/nba-season";
import type { ApiResponse, GameDateCount } from "@/types";

const SeasonSchema = z.enum(NBA_SEASONS);

const QuerySchema = z.object({
  season: SeasonSchema,
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export async function GET(
  req: NextRequest
): Promise<NextResponse<ApiResponse<GameDateCount[]>>> {
  const rawSeason = req.nextUrl.searchParams.get("season");
  const rawMonth = req.nextUrl.searchParams.get("month");

  const parsed = QuerySchema.safeParse({
    season: rawSeason ?? undefined,
    month: rawMonth === null || rawMonth === "" ? undefined : rawMonth,
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid query parameters";
    return NextResponse.json({ data: [], error: msg }, { status: 400 });
  }

  const { season, month } = parsed.data;

  try {
    const dates = await getRegularSeasonGameDatesWithCounts(season, month);
    return NextResponse.json({ data: dates, error: null });
  } catch (err) {
    console.error("[api/games/dates]", err);
    return NextResponse.json(
      { data: [], error: getPublicApiErrorMessage(err) },
      { status: 500 }
    );
  }
}
