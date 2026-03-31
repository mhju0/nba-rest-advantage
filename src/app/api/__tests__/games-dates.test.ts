import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../games/dates/route";
import { getRegularSeasonGameDatesWithCounts } from "@/lib/db/queries";
import type { GameDateCount } from "@/types";

vi.mock("@/lib/db/queries", () => ({
  getRegularSeasonGameDatesWithCounts: vi.fn(),
}));

const mockGetDates = vi.mocked(getRegularSeasonGameDatesWithCounts);

function req(url: string): NextRequest {
  return { nextUrl: new URL(url, "http://localhost") } as NextRequest;
}

describe("GET /api/games/dates", () => {
  beforeEach(() => {
    mockGetDates.mockReset();
  });

  it("returns 400 when season is missing", async () => {
    const res = await GET(req("http://localhost/api/games/dates?month=3"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { data: GameDateCount[]; error: string };
    expect(body.data).toEqual([]);
    expect(body.error.length).toBeGreaterThan(0);
    expect(mockGetDates).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid season label", async () => {
    const res = await GET(req("http://localhost/api/games/dates?season=2099-00"));
    expect(res.status).toBe(400);
    expect(mockGetDates).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid month", async () => {
    const res = await GET(req("http://localhost/api/games/dates?season=2024-25&month=13"));
    expect(res.status).toBe(400);
    expect(mockGetDates).not.toHaveBeenCalled();
  });

  it("calls query with season only when month omitted", async () => {
    const sample: GameDateCount[] = [{ date: "2024-10-22", gameCount: 2 }];
    mockGetDates.mockResolvedValueOnce(sample);

    const res = await GET(req("http://localhost/api/games/dates?season=2024-25"));
    expect(res.status).toBe(200);
    expect(mockGetDates).toHaveBeenCalledWith("2024-25", undefined);
    const body = (await res.json()) as { data: GameDateCount[]; error: null };
    expect(body.error).toBeNull();
    expect(body.data).toEqual(sample);
  });

  it("passes numeric month to the query", async () => {
    mockGetDates.mockResolvedValueOnce([]);

    const res = await GET(req("http://localhost/api/games/dates?season=2024-25&month=3"));
    expect(res.status).toBe(200);
    expect(mockGetDates).toHaveBeenCalledWith("2024-25", 3);
  });
});
