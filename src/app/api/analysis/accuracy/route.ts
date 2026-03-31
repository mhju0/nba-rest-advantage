import { NextResponse } from "next/server";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import { getResolvedPredictions } from "@/lib/db/queries";
import type {
  AccuracyResponse,
  AccuracyTier,
  ApiResponse,
  MonthlyAccuracyPoint,
  PredictionDetail,
} from "@/types";

export const revalidate = 86400; // 24 hours

/** Returns an accuracy percentage (0–100, 1 decimal). */
function accuracyPct(correct: number, total: number): number {
  return total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;
}

const EMPTY_TIERS: AccuracyTier[] = [
  { label: "low", range: "0–2", games: 0, correct: 0, accuracyPct: 0 },
  { label: "medium", range: "2–5", games: 0, correct: 0, accuracyPct: 0 },
  { label: "high", range: "5+", games: 0, correct: 0, accuracyPct: 0 },
];

const EMPTY_RESPONSE: AccuracyResponse = {
  totalPredictions: 0,
  correctPredictions: 0,
  accuracyPct: 0,
  tiers: EMPTY_TIERS,
  monthlyTrend: [],
  recentPredictions: [],
};

export async function GET(): Promise<NextResponse<ApiResponse<AccuracyResponse>>> {
  try {
    const rows = await getResolvedPredictions();

    if (rows.length === 0) {
      return NextResponse.json({ data: EMPTY_RESPONSE, error: null });
    }

    // ── Single-pass aggregation ───────────────────────────────────
    const tierCounters = {
      low: { games: 0, correct: 0 },
      medium: { games: 0, correct: 0 },
      high: { games: 0, correct: 0 },
    };

    // Map of "YYYY-MM" → { total, correct } for monthly accuracy trend
    const monthMap = new Map<string, { total: number; correct: number }>();

    let totalCorrect = 0;

    for (const row of rows) {
      const isCorrect = row.predictedAdvantageTeamId === row.actualWinnerId;
      if (isCorrect) totalCorrect++;

      // Tier bucketing by absolute differential
      const absDiff = Math.abs(parseFloat(row.differential));
      if (absDiff >= 5) {
        tierCounters.high.games++;
        if (isCorrect) tierCounters.high.correct++;
      } else if (absDiff >= 2) {
        tierCounters.medium.games++;
        if (isCorrect) tierCounters.medium.correct++;
      } else {
        tierCounters.low.games++;
        if (isCorrect) tierCounters.low.correct++;
      }

      // Monthly grouping (YYYY-MM) for trend chart
      const month = row.date.slice(0, 7);
      const entry = monthMap.get(month) ?? { total: 0, correct: 0 };
      entry.total++;
      if (isCorrect) entry.correct++;
      monthMap.set(month, entry);
    }

    // ── Tiers ─────────────────────────────────────────────────────
    const tiers: AccuracyTier[] = [
      {
        label: "low",
        range: "0–2",
        games: tierCounters.low.games,
        correct: tierCounters.low.correct,
        accuracyPct: accuracyPct(tierCounters.low.correct, tierCounters.low.games),
      },
      {
        label: "medium",
        range: "2–5",
        games: tierCounters.medium.games,
        correct: tierCounters.medium.correct,
        accuracyPct: accuracyPct(tierCounters.medium.correct, tierCounters.medium.games),
      },
      {
        label: "high",
        range: "5+",
        games: tierCounters.high.games,
        correct: tierCounters.high.correct,
        accuracyPct: accuracyPct(tierCounters.high.correct, tierCounters.high.games),
      },
    ];

    // ── Monthly cumulative accuracy trend ─────────────────────────
    const sortedMonths = Array.from(monthMap.keys()).sort();
    let cumTotal = 0;
    let cumCorrect = 0;
    const monthlyTrend: MonthlyAccuracyPoint[] = [];

    for (const month of sortedMonths) {
      const { total, correct } = monthMap.get(month)!;
      cumTotal += total;
      cumCorrect += correct;
      monthlyTrend.push({
        month,
        cumulativeGames: cumTotal,
        cumulativeCorrect: cumCorrect,
        accuracyPct: accuracyPct(cumCorrect, cumTotal),
      });
    }

    // ── Last 20 predictions (newest first) ────────────────────────
    const recentPredictions: PredictionDetail[] = rows
      .slice(-20)
      .reverse()
      .map((row) => ({
        date: row.date,
        homeTeam: {
          id: row.homeTeamId,
          name: row.homeTeamName,
          abbreviation: row.homeTeamAbbreviation,
        },
        awayTeam: {
          id: row.awayTeamId,
          name: row.awayTeamName,
          abbreviation: row.awayTeamAbbreviation,
        },
        predictedAdvantageTeam: {
          id: row.predictedAdvantageTeamId,
          name: row.predictedTeamName,
          abbreviation: row.predictedTeamAbbreviation,
        },
        actualWinner: {
          id: row.actualWinnerId,
          name: row.actualWinnerName,
          abbreviation: row.actualWinnerAbbreviation,
        },
        differential: Math.abs(parseFloat(row.differential)),
        correct: row.predictedAdvantageTeamId === row.actualWinnerId,
      }));

    const response: AccuracyResponse = {
      totalPredictions: rows.length,
      correctPredictions: totalCorrect,
      accuracyPct: accuracyPct(totalCorrect, rows.length),
      tiers,
      monthlyTrend,
      recentPredictions,
    };

    return NextResponse.json({ data: response, error: null });
  } catch (err) {
    console.error("[api/analysis/accuracy]", err);
    return NextResponse.json(
      {
        data: null as unknown as AccuracyResponse,
        error: getPublicApiErrorMessage(err),
      },
      { status: 500 }
    );
  }
}
