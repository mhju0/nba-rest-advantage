import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../games/[date]/route";
import { getGamesByDate } from "@/lib/db/queries";
import type { GameResponse } from "@/types";

vi.mock("@/lib/db/queries", () => ({
  getGamesByDate: vi.fn(),
}));

const mockGetGamesByDate = vi.mocked(getGamesByDate);

const sampleGame: GameResponse = {
  id: 1,
  externalId: "0022400001",
  date: "2024-12-25",
  season: "2024-25",
  status: "scheduled",
  homeScore: null,
  awayScore: null,
  homeTeam: {
    id: 1,
    name: "Celtics",
    abbreviation: "BOS",
    city: "Boston",
  },
  awayTeam: {
    id: 2,
    name: "Lakers",
    abbreviation: "LAL",
    city: "Los Angeles",
  },
  homeFatigue: {
    score: 2.1,
    isBackToBack: false,
    is3In4: false,
    travelDistanceMiles: 400,
    altitudePenalty: false,
    altitudeArenaLabel: null,
    daysRest: 2,
    gamesInLast7Days: 2,
    gamesInLast30Days: 8,
    is4In6: false,
    isOvertimePenalty: false,
    roadTripConsecutiveAway: 0,
    hasCoastToCoastRoadSwing: false,
  },
  awayFatigue: {
    score: 5.3,
    isBackToBack: true,
    is3In4: true,
    travelDistanceMiles: 2100,
    altitudePenalty: true,
    altitudeArenaLabel: "Boston (altitude)",
    daysRest: 1,
    gamesInLast7Days: 4,
    gamesInLast30Days: 14,
    is4In6: true,
    isOvertimePenalty: true,
    roadTripConsecutiveAway: 3,
    hasCoastToCoastRoadSwing: true,
  },
  restAdvantage: {
    differential: 3.2,
    advantageTeam: "home",
  },
};

describe("GET /api/games/[date]", () => {
  beforeEach(() => {
    mockGetGamesByDate.mockReset();
  });

  it("returns 200 with an array for a valid YYYY-MM-DD date", async () => {
    mockGetGamesByDate.mockResolvedValueOnce([sampleGame]);

    const res = await GET({} as NextRequest, {
      params: Promise.resolve({ date: "2024-12-25" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: GameResponse[];
      error: string | null;
    };
    expect(body.error).toBeNull();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it("returns 400 with an error message for invalid date strings", async () => {
    for (const bad of ["banana", "13-25-2024", "2024/12/25", "24-12-25"]) {
      const res = await GET({} as NextRequest, {
        params: Promise.resolve({ date: bad }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        data: GameResponse[];
        error: string;
      };
      expect(body.data).toEqual([]);
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    }

    expect(mockGetGamesByDate).not.toHaveBeenCalled();
  });

  it("returns 200 with an empty array when no games exist for that date", async () => {
    mockGetGamesByDate.mockResolvedValueOnce([]);

    const res = await GET({} as NextRequest, {
      params: Promise.resolve({ date: "2026-07-15" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: GameResponse[];
      error: string | null;
    };
    expect(body.error).toBeNull();
    expect(body.data).toEqual([]);
  });

  it("response objects match GameResponse shape", async () => {
    mockGetGamesByDate.mockResolvedValueOnce([sampleGame]);

    const res = await GET({} as NextRequest, {
      params: Promise.resolve({ date: "2024-12-25" }),
    });

    const body = (await res.json()) as {
      data: GameResponse[];
      error: string | null;
    };
    const game = body.data[0];

    expect(game).toMatchObject({
      homeTeam: expect.objectContaining({
        abbreviation: expect.any(String),
        name: expect.any(String),
      }),
      awayTeam: expect.objectContaining({
        abbreviation: expect.any(String),
        name: expect.any(String),
      }),
    });

    expect(game.homeFatigue).toMatchObject({
      score: expect.any(Number),
    });
    expect(game.awayFatigue).toMatchObject({
      score: expect.any(Number),
    });
    expect(game.restAdvantage).toMatchObject({
      differential: expect.any(Number),
      advantageTeam: expect.any(String),
    });
  });
});
