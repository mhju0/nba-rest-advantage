import { format } from "date-fns";
import { NextResponse } from "next/server";
import { getPublicApiErrorMessage } from "@/lib/api-errors";
import {
  getResolvedPredictions,
  getUpcomingPredictionsForSeason,
} from "@/lib/db/queries";
import { defaultNbaSeason } from "@/lib/nba-season";
import type {
  AccuracyResponse,
  AccuracyTier,
  ApiResponse,
  PredictionDetail,
  SeasonAccuracyPoint,
  UpcomingPick,
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
  seasonAccuracyTrend: [],
  recentPredictions: [],
  trackerSeason: defaultNbaSeason(),
  upcomingPicks: [],
};

export async function GET(): Promise<NextResponse<ApiResponse<AccuracyResponse>>> {
  try {
    const trackerSeason = defaultNbaSeason();
    const todayYmd = format(new Date(), "yyyy-MM-dd");

    const [rows, upcomingRows] = await Promise.all([
      getResolvedPredictions(),
      getUpcomingPredictionsForSeason(trackerSeason, todayYmd),
    ]);

    const upcomingPicks: UpcomingPick[] = upcomingRows.map((r) => ({
      gameId: r.gameId,
      date: r.date,
      homeTeam: { abbreviation: r.homeTeamAbbreviation },
      awayTeam: { abbreviation: r.awayTeamAbbreviation },
      predictedAdvantageTeam: { abbreviation: r.predictedTeamAbbreviation },
      differential: Math.abs(parseFloat(r.differential)),
    }));

    if (rows.length === 0) {
      return NextResponse.json({
        data: { ...EMPTY_RESPONSE, trackerSeason, upcomingPicks },
        error: null,
      });
    }

    // ── Single-pass aggregation ───────────────────────────────────
    const tierCounters = {
      low: { games: 0, correct: 0 },
      medium: { games: 0, correct: 0 },
      high: { games: 0, correct: 0 },
    };

    const seasonMap = new Map<string, { total: number; correct: number }>();

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

      const sEntry = seasonMap.get(row.season) ?? { total: 0, correct: 0 };
      sEntry.total++;
      if (isCorrect) sEntry.correct++;
      seasonMap.set(row.season, sEntry);
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

    const seasonAccuracyTrend: SeasonAccuracyPoint[] = Array.from(seasonMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([season, { total, correct }]) => ({
        season,
        games: total,
        correct,
        accuracyPct: accuracyPct(correct, total),
      }));

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
      seasonAccuracyTrend,
      recentPredictions,
      trackerSeason,
      upcomingPicks,
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
