export interface TeamInfo {
  id: number;
  name: string;
  abbreviation: string;
  city: string;
}

export interface FatigueInfo {
  score: number;
  isBackToBack: boolean;
  is3In4: boolean;
  travelDistanceMiles: number;
  altitudePenalty: boolean;
  /** When altitude applies (away at DEN/UTA), human-readable arena context. */
  altitudeArenaLabel: string | null;
  /** Days since this team's previous game; null = season opener / no prior game. */
  daysRest: number | null;
  /** Games this team played in the 7-day lookback (same window as the fatigue model). */
  gamesInLast7Days: number;
  /** Fourth game within a rolling 6-day window ending on this game date. */
  is4In6: boolean;
  /** Prior game went to overtime (extra fatigue in the model). */
  isOvertimePenalty: boolean;
}

export interface RestAdvantage {
  differential: number;
  advantageTeam: "home" | "away" | "neutral";
}

export interface GameResponse {
  id: number;
  externalId: string;
  date: string;
  season: string;
  status: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  homeScore: number | null;
  awayScore: number | null;
  homeFatigue: FatigueInfo | null;
  awayFatigue: FatigueInfo | null;
  restAdvantage: RestAdvantage | null;
}

export interface ApiResponse<T> {
  data: T;
  error: string | null;
  meta?: Record<string, unknown>;
}

// ─── Accuracy tracker ────────────────────────────────────────────

export interface AccuracyTier {
  label: "low" | "medium" | "high";
  /** Human-readable differential range, e.g. "0–2". */
  range: string;
  games: number;
  correct: number;
  /** Accuracy percentage (0–100, 1 decimal). */
  accuracyPct: number;
}

export interface RollingAccuracyPoint {
  /** "YYYY-MM-DD" */
  date: string;
  cumulativeGames: number;
  cumulativeCorrect: number;
  /** Accuracy percentage (0–100, 1 decimal). */
  accuracyPct: number;
}

export interface PredictionDetail {
  date: string;
  homeTeam: Pick<TeamInfo, "id" | "name" | "abbreviation">;
  awayTeam: Pick<TeamInfo, "id" | "name" | "abbreviation">;
  predictedAdvantageTeam: Pick<TeamInfo, "id" | "name" | "abbreviation">;
  actualWinner: Pick<TeamInfo, "id" | "name" | "abbreviation">;
  /** Absolute rest-advantage differential at prediction time. */
  differential: number;
  correct: boolean;
}

export interface AccuracyResponse {
  totalPredictions: number;
  correctPredictions: number;
  /** Overall accuracy percentage (0–100, 1 decimal). */
  accuracyPct: number;
  tiers: AccuracyTier[];
  /** Last 30 distinct game dates with cumulative accuracy up to each date. Sorted oldest→newest. */
  rolling30Days: RollingAccuracyPoint[];
  /** Most recent 10 resolved predictions, newest first. */
  recentPredictions: PredictionDetail[];
}

// ─── Analysis ────────────────────────────────────────────────────

export interface ThresholdBucket {
  /** Minimum absolute rest-advantage differential required to be counted. */
  threshold: number;
  games: number;
  restedTeamWins: number;
  /** Win percentage (0–100, 1 decimal). */
  winPct: number;
  /**
   * Percentage of games where the more-rested team also covered the spread.
   * null when no games in this bucket have spread data.
   */
  spreadCoverRate: number | null;
}

export interface HomeAwayBreakdown {
  homeTeamMoreRested: {
    games: number;
    restedTeamWins: number;
    winPct: number;
  };
  awayTeamMoreRested: {
    games: number;
    restedTeamWins: number;
    winPct: number;
  };
}

export interface MonthlyTrend {
  /** "YYYY-MM" */
  month: string;
  games: number;
  restedTeamWins: number;
  winPct: number;
}

/** Stats for a specific season segment (or all games combined). */
export interface SeasonTypeStats {
  totalGames: number;
  overallWins: number;
  overallWinRate: number;
  thresholds: ThresholdBucket[];
  homeAwayBreakdown: HomeAwayBreakdown;
  monthlyTrends: MonthlyTrend[];
  /**
   * Overall ATS record for the more-rested team.
   * null when no games in this segment have spread data.
   */
  atsOverall: { covered: number; total: number; coverRate: number } | null;
}

export interface AnalysisResponse {
  /** Total final games with fatigue data for both teams (|RA| >= 0.5). */
  totalGames: number;
  overallWins: number;
  /** Win percentage (0–100, 1 decimal). */
  overallWinRate: number;
  thresholds: ThresholdBucket[];
  homeAwayBreakdown: HomeAwayBreakdown;
  /** Sorted chronologically (ascending). */
  monthlyTrends: MonthlyTrend[];
  atsOverall: { covered: number; total: number; coverRate: number } | null;
  /** Pre-computed stats for each season segment (for the tab toggle). */
  seasonTypeBreakdown: {
    regular: SeasonTypeStats;
    /** Includes both conference finals and NBA Finals. */
    playoffs: SeasonTypeStats;
  };
}
