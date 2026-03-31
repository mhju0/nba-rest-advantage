import { NextResponse } from "next/server";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { getCompletedGamesWithFatigue } from "@/lib/db/queries";
import type {
  AnalysisResponse,
  ApiResponse,
  HomeAwayBreakdown,
  MonthlyTrend,
  SeasonTypeStats,
  ThresholdBucket,
} from "@/types";

/** Cache this response for 24 hours — it only changes when new final scores arrive. */
export const revalidate = 86400;

const NEUTRAL_THRESHOLD = 0.5;
const THRESHOLDS = [2, 3, 5, 7] as const;

/** Returns a win percentage (0–100, 1 decimal). */
function winPct(wins: number, total: number): number {
  return total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;
}

// ─── Per-game processed row ─────────────────────────────────────

type ProcessedRow = {
  date: string;
  /** "regular" | "playoffs" | "finals" */
  gameType: string;
  /** awayFatigue − homeFatigue. Positive → home team is more rested. */
  differential: number;
  restedTeamSide: "home" | "away";
  restedTeamWon: boolean;
  restedTeamCoveredSpread: boolean | null;
};

// ─── Aggregate a set of processed rows into SeasonTypeStats ─────

function buildStats(rows: ProcessedRow[]): SeasonTypeStats {
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
    const spreadGames = bucket.filter((r) => r.restedTeamCoveredSpread !== null);
    const spreadCovers = spreadGames.filter(
      (r) => r.restedTeamCoveredSpread === true
    ).length;

    return {
      threshold,
      games: bucket.length,
      restedTeamWins: wins,
      winPct: winPct(wins, bucket.length),
      spreadCoverRate:
        spreadGames.length > 0
          ? winPct(spreadCovers, spreadGames.length)
          : null,
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

  // ATS overall
  const spreadGames = decidable.filter((r) => r.restedTeamCoveredSpread !== null);
  const spreadCovers = spreadGames.filter(
    (r) => r.restedTeamCoveredSpread === true
  ).length;
  const atsOverall =
    spreadGames.length > 0
      ? {
          covered: spreadCovers,
          total: spreadGames.length,
          coverRate: winPct(spreadCovers, spreadGames.length),
        }
      : null;

  return {
    totalGames: decidable.length,
    overallWins,
    overallWinRate: winPct(overallWins, decidable.length),
    thresholds,
    homeAwayBreakdown,
    monthlyTrends,
    atsOverall,
  };
}

export async function GET(): Promise<NextResponse<ApiResponse<AnalysisResponse>>> {
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

      let restedTeamCoveredSpread: boolean | null = null;
      if (row.spread !== null) {
        const spreadVal = parseFloat(row.spread);
        if (!isNaN(spreadVal) && spreadVal !== 0) {
          const coverValue = row.homeScore - row.awayScore + spreadVal;
          if (coverValue !== 0) {
            restedTeamCoveredSpread =
              restedTeamSide === "home" ? coverValue > 0 : coverValue < 0;
          }
        }
      }

      processed.push({
        date: row.date,
        gameType: row.gameType,
        differential,
        restedTeamSide,
        restedTeamWon,
        restedTeamCoveredSpread,
      });
    }

    // ── Build stats for each segment ──────────────────────────────
    const allStats = buildStats(processed);
    const regularStats = buildStats(
      processed.filter((r) => r.gameType === "regular")
    );
    const playoffStats = buildStats(
      processed.filter(
        (r) => r.gameType === "playoffs" || r.gameType === "finals"
      )
    );

    const response: AnalysisResponse = {
      totalGames: allStats.totalGames,
      overallWins: allStats.overallWins,
      overallWinRate: allStats.overallWinRate,
      thresholds: allStats.thresholds,
      homeAwayBreakdown: allStats.homeAwayBreakdown,
      monthlyTrends: allStats.monthlyTrends,
      atsOverall: allStats.atsOverall,
      seasonTypeBreakdown: {
        regular: regularStats,
        playoffs: playoffStats,
      },
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
