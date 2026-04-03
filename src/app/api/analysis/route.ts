import { NextRequest, NextResponse } from "next/server";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { getCompletedGamesWithFatigue } from "@/lib/db/queries";
import type {
  AnalysisResponse,
  ApiResponse,
  HomeAwayBreakdown,
  MonthlyTrend,
  ThresholdBucket,
} from "@/types";

export const runtime = "nodejs";

/** DB-backed; do not prerender at build (avoids requiring `DATABASE_URL` during `next build`). */
export const dynamic = "force-dynamic";

const NEUTRAL_THRESHOLD = 0.5;
const THRESHOLDS = [2, 3, 5, 7] as const;

/** Returns a win percentage (0–100, 1 decimal). */
function winPct(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
}

// ─── Per-game processed row ─────────────────────────────────────

type ProcessedRow = {
  date: string;
  season: string;
  /** awayFatigue − homeFatigue. Positive → home team is more rested. */
  differential: number;
  restedTeamSide: "home" | "away";
  restedTeamWon: boolean;
};

// ─── Aggregate processed rows into AnalysisResponse stats ───────

function buildStats(rows: ProcessedRow[], seasonMinRA = 0): Omit<AnalysisResponse, never> {
  const decidable = rows.filter(
    (r) => Math.abs(r.differential) >= NEUTRAL_THRESHOLD
  );

  const overallWins = decidable.filter((r) => r.restedTeamWon).length;

  // Threshold buckets
  const thresholds: ThresholdBucket[] = THRESHOLDS.map((threshold) => {
    const bucket = decidable.filter(
      (r) => Math.abs(r.differential) >= threshold
    );
    const wins = bucket.filter((r) => r.restedTeamWon).length;

    return {
      threshold,
      games: bucket.length,
      restedTeamWins: wins,
      winPct: winPct(wins, bucket.length),
    };
  });

  // Home / away breakdown
  const homeRested = decidable.filter((r) => r.restedTeamSide === "home");
  const awayRested = decidable.filter((r) => r.restedTeamSide === "away");
  const homeRestedWins = homeRested.filter((r) => r.restedTeamWon).length;
  const awayRestedWins = awayRested.filter((r) => r.restedTeamWon).length;

  const homeAwayBreakdown: HomeAwayBreakdown = {
    homeTeamMoreRested: {
      games: homeRested.length,
      restedTeamWins: homeRestedWins,
      winPct: winPct(homeRestedWins, homeRested.length),
    },
    awayTeamMoreRested: {
      games: awayRested.length,
      restedTeamWins: awayRestedWins,
      winPct: winPct(awayRestedWins, awayRested.length),
    },
  };

  // Monthly trends
  const monthlyMap = new Map<string, { games: number; wins: number }>();
  for (const row of decidable) {
    const month = row.date.slice(0, 7);
    const entry = monthlyMap.get(month) ?? { games: 0, wins: 0 };
    entry.games++;
    if (row.restedTeamWon) entry.wins++;
    monthlyMap.set(month, entry);
  }

  const monthlyTrends: MonthlyTrend[] = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { games, wins }]) => ({
      month,
      games,
      restedTeamWins: wins,
      winPct: winPct(wins, games),
    }));

  // Season win rates — filtered by seasonMinRA if provided
  const seasonSource =
    seasonMinRA > NEUTRAL_THRESHOLD
      ? rows.filter((r) => Math.abs(r.differential) >= seasonMinRA)
      : decidable;

  const bySeason = new Map<string, { wins: number; games: number }>();
  for (const row of seasonSource) {
    const agg = bySeason.get(row.season) ?? { wins: 0, games: 0 };
    agg.games++;
    if (row.restedTeamWon) agg.wins++;
    bySeason.set(row.season, agg);
  }

  const seasonWinRates = Array.from(bySeason.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([season, { wins, games }]) => ({
      season,
      games,
      restedTeamWins: wins,
      winPct: winPct(wins, games),
    }));

  return {
    totalGames: decidable.length,
    overallWins,
    overallWinRate: winPct(overallWins, decidable.length),
    thresholds,
    homeAwayBreakdown,
    monthlyTrends,
    seasonWinRates,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<AnalysisResponse>>> {
  const { searchParams } = new URL(req.url);
  const seasonMinRA = Math.max(0, parseFloat(searchParams.get("seasonMinRA") ?? "0") || 0);

  try {
    const rows = await getCompletedGamesWithFatigue();

    // ── Single-pass: derive all per-game signals ──────────────────
    const processed: ProcessedRow[] = [];

    for (const row of rows) {
      if (row.homeScore === null || row.awayScore === null) continue;

      const homeFatigue = parseFloat(row.homeFatigueScore);
      const awayFatigue = parseFloat(row.awayFatigueScore);
      const differential = awayFatigue - homeFatigue;

      const restedTeamSide = differential >= 0 ? "home" : "away";
      const homeWon = row.homeScore > row.awayScore;
      const restedTeamWon = restedTeamSide === "home" ? homeWon : !homeWon;

      processed.push({
        date: row.date,
        season: row.season,
        differential,
        restedTeamSide,
        restedTeamWon,
      });
    }

    const stats = buildStats(processed, seasonMinRA);

    const response: AnalysisResponse = {
      totalGames: stats.totalGames,
      overallWins: stats.overallWins,
      overallWinRate: stats.overallWinRate,
      thresholds: stats.thresholds,
      homeAwayBreakdown: stats.homeAwayBreakdown,
      monthlyTrends: stats.monthlyTrends,
      seasonWinRates: stats.seasonWinRates,
    };

    return NextResponse.json({ data: response, error: null });
  } catch (err) {
    console.error("[api/analysis]", err);
    return NextResponse.json(
      {
        data: null as unknown as AnalysisResponse,
        error: getPublicApiErrorMessage(err),
      },
      { status: 500 }
    );
  }
}
