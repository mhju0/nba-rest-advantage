import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { getGameDetailById } from "@/lib/db/queries";
import type { ApiResponse, GameDetailResponse } from "@/types";

const IdParams = z.object({
  id: z.coerce.number().int().positive(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<GameDetailResponse | null>>> {
  const { id: raw } = await params;
  const parsed = IdParams.safeParse({ id: raw });
  if (!parsed.success) {
    return NextResponse.json(
      { data: null, error: "Invalid game id" },
      { status: 400 }
    );
  }

  try {
    const detail = await getGameDetailById(parsed.data.id);
    if (!detail) {
      return NextResponse.json({ data: null, error: "Game not found" }, { status: 404 });
    }
    return NextResponse.json({ data: detail, error: null });
  } catch (err) {
    console.error("[api/game/[id]]", err);
    return NextResponse.json(
      { data: null, error: getPublicApiErrorMessage(err) },
      { status: 500 }
    );
  }
}
