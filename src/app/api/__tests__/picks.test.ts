import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../picks/route";
import { getPicksForSeason } from "@/lib/db/queries";
import type { PicksResponse } from "@/types";

vi.mock("@/lib/db/queries", () => ({
  getPicksForSeason: vi.fn(),
}));

vi.mock("@/lib/nba-season", () => ({
  defaultNbaSeason: () => "2024-25",
}));

const mockGetPicksForSeason = vi.mocked(getPicksForSeason);

const samplePicks: PicksResponse = {
  season: "2024-25",
  picks: [
    {
      gameId: 101,
      date: "2025-03-15",
      homeTeam: { abbreviation: "BOS", name: "Celtics", city: "Boston" },
      awayTeam: { abbreviation: "LAL", name: "Lakers", city: "Los Angeles" },
      predictedAdvantageTeam: { abbreviation: "BOS", name: "Celtics" },
      differential: 3.5,
      tier: "medium",
      homeFatigueScore: 2.1,
      awayFatigueScore: 5.6,
      moneyline: { home: -180, away: 155 },
      season: "2024-25",
    },
    {
      gameId: 102,
      date: "2025-03-16",
      homeTeam: { abbreviation: "NYK", name: "Knicks", city: "New York" },
      awayTeam: { abbreviation: "MIA", name: "Heat", city: "Miami" },
      predictedAdvantageTeam: null,
      differential: null,
      tier: null,
      homeFatigueScore: null,
      awayFatigueScore: null,
      moneyline: null,
      season: "2024-25",
    },
  ],
  summary: {
    total: 2,
    highConfidence: 0,
    mediumConfidence: 1,
    lowConfidence: 0,
  },
};

describe("GET /api/picks", () => {
  beforeEach(() => {
    mockGetPicksForSeason.mockReset();
  });

  it("returns 200 with PicksResponse shape", async () => {
    mockGetPicksForSeason.mockResolvedValueOnce(samplePicks);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: PicksResponse;
      error: string | null;
    };
    expect(body.error).toBeNull();
    expect(body.data.season).toBe("2024-25");
    expect(body.data.summary).toEqual({
      total: 2,
      highConfidence: 0,
      mediumConfidence: 1,
      lowConfidence: 0,
    });
    expect(body.data.picks).toHaveLength(2);
    expect(body.data.picks[0]).toMatchObject({
      gameId: 101,
      tier: "medium",
      moneyline: { home: -180, away: 155 },
    });
    expect(body.data.picks[1]).toMatchObject({
      gameId: 102,
      tier: null,
      predictedAdvantageTeam: null,
      moneyline: null,
    });
  });

  it("calls getPicksForSeason with season from defaultNbaSeason and a YYYY-MM-DD date", async () => {
    mockGetPicksForSeason.mockResolvedValueOnce({
      season: "2024-25",
      picks: [],
      summary: {
        total: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0,
      },
    });

    await GET();

    expect(mockGetPicksForSeason).toHaveBeenCalledTimes(1);
    const [season, fromDate] = mockGetPicksForSeason.mock.calls[0];
    expect(season).toBe("2024-25");
    expect(fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns 500 with error message when the query throws", async () => {
    mockGetPicksForSeason.mockRejectedValueOnce(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      data: PicksResponse;
      error: string | null;
    };
    expect(body.error).toBeTruthy();
    expect(body.data.picks).toEqual([]);
    expect(body.data.summary.total).toBe(0);
  });
});
