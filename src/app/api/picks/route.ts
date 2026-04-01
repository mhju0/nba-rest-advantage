import { format } from "date-fns";
import { NextResponse } from "next/server";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { getPicksForSeason } from "@/lib/db/queries";
import { defaultNbaSeason } from "@/lib/nba-season";
import type { ApiResponse, PicksResponse } from "@/types";

/** Revalidate hourly — slate and predictions update during the day. */
export const revalidate = 3600;

const emptyPicksData: PicksResponse = {
  season: "",
  picks: [],
  summary: {
    total: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    lowConfidence: 0,
  },
};

export async function GET(): Promise<NextResponse<ApiResponse<PicksResponse>>> {
  try {
    const season = defaultNbaSeason();
    const today = format(new Date(), "yyyy-MM-dd");
    const data = await getPicksForSeason(season, today);
    return NextResponse.json({ data, error: null });
  } catch (err) {
    console.error("[api/picks]", err);
    return NextResponse.json(
      { data: emptyPicksData, error: getPublicApiErrorMessage(err) },
      { status: 500 }
    );
  }
}
