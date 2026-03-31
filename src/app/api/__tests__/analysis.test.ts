import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../analysis/route";
import { getCompletedGamesWithFatigue } from "@/lib/db/queries";
import type { AnalysisResponse } from "@/types";

vi.mock("@/lib/db/queries", () => ({
  getCompletedGamesWithFatigue: vi.fn(),
}));

const mockGetCompleted = vi.mocked(getCompletedGamesWithFatigue);

/**
 * Build final games with fatigue strings. `away - home` = rest-advantage differential
 * (positive → home team more rested in this codebase).
 */
function row(
  date: string,
  homeFatigue: number,
  awayFatigue: number,
  homeScore: number,
  awayScore: number,
  spread: string | null = "-1.5"
) {
  return {
    date,
    season: "2023-24",
    homeFatigueScore: String(homeFatigue),
    awayFatigueScore: String(awayFatigue),
    homeScore,
    awayScore,
    spread,
  };
}

describe("GET /api/analysis", () => {
  beforeEach(() => {
    mockGetCompleted.mockReset();
  });

  it("returns 200 with the expected analysis payload shape", async () => {
    mockGetCompleted.mockResolvedValueOnce([
      row("2024-01-02", 4, 9, 110, 100),
      row("2024-01-03", 6, 2, 98, 102),
      row("2024-01-04", 3, 8, 105, 99),
      row("2024-01-05", 5, 5.2, 101, 103),
      row("2024-01-06", 1, 9, 112, 104),
      row("2024-01-07", 2, 10, 106, 95),
      row("2024-01-08", 7, 1, 97, 108),
      row("2024-01-09", 4, 11, 120, 115),
      row("2024-01-10", 3, 12, 88, 92),
      row("2024-01-11", 8, 2, 99, 102),
    ]);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: AnalysisResponse;
      error: string | null;
    };

    expect(body.error).toBeNull();
    const d = body.data;

    expect(typeof d.totalGames).toBe("number");
    expect(typeof d.overallWins).toBe("number");
    expect(typeof d.overallWinRate).toBe("number");
    expect(Array.isArray(d.thresholds)).toBe(true);
    expect(d.homeAwayBreakdown).toMatchObject({
      homeTeamMoreRested: expect.objectContaining({
        games: expect.any(Number),
        winPct: expect.any(Number),
      }),
      awayTeamMoreRested: expect.objectContaining({
        games: expect.any(Number),
        winPct: expect.any(Number),
      }),
    });
    expect(Array.isArray(d.monthlyTrends)).toBe(true);
    expect(Array.isArray(d.seasonWinRates)).toBe(true);
  });

  it("surfaces percentages between 0 and 100 everywhere", async () => {
    mockGetCompleted.mockResolvedValueOnce([
      row("2024-02-01", 2, 8, 100, 90),
      row("2024-02-02", 7, 1, 95, 99),
      row("2024-02-03", 3, 9, 108, 102),
    ]);

    const res = await GET();
    const body = (await res.json()) as { data: AnalysisResponse; error: string | null };
    expect(body.error).toBeNull();
    const d = body.data;

    const pcts: number[] = [d.overallWinRate];
    for (const t of d.thresholds) {
      pcts.push(t.winPct);
      if (t.spreadCoverRate !== null) pcts.push(t.spreadCoverRate);
    }
    pcts.push(d.homeAwayBreakdown.homeTeamMoreRested.winPct);
    pcts.push(d.homeAwayBreakdown.awayTeamMoreRested.winPct);
    for (const m of d.monthlyTrends) pcts.push(m.winPct);

    for (const p of pcts) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });

  it("orders thresholds 2, 3, 5, 7 and keeps bucket game counts descending", async () => {
    mockGetCompleted.mockResolvedValueOnce([
      row("2024-03-01", 1, 8, 105, 98),
      row("2024-03-02", 2, 9, 110, 102),
      row("2024-03-03", 0, 10, 95, 88),
      row("2024-03-04", 3, 11, 118, 112),
      row("2024-03-05", 4, 12, 100, 99),
      row("2024-03-06", 1, 7, 102, 98),
      row("2024-03-07", 2, 8, 99, 97),
      row("2024-03-08", 5, 13, 121, 115),
    ]);

    const res = await GET();
    const body = (await res.json()) as { data: AnalysisResponse; error: string | null };
    expect(body.error).toBeNull();

    const thresholds = body.data.thresholds.map((t) => t.threshold);
    expect(thresholds).toEqual([2, 3, 5, 7]);

    const counts = body.data.thresholds.map((t) => t.games);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1]).toBeGreaterThanOrEqual(counts[i]);
    }
  });
});
