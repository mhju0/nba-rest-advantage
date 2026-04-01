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
  /**
   * Sum of modeled flight legs in the travel window (7 calendar days before this game,
   * not counting game day), per `calculateFatigue` — not “days traveling.”
   */
  travelDistanceMiles: number;
  altitudePenalty: boolean;
  /** When altitude applies (away at DEN/UTA), human-readable arena context. */
  altitudeArenaLabel: string | null;
  /** Days since this team's previous game; null = season opener / no prior game. */
  daysRest: number | null;
  /** Games in the 7 calendar days before this game (not counting this game). */
  gamesInLast7Days: number;
  /** Games in the 30 calendar days before this game (not counting this game). */
  gamesInLast30Days: number;
  /** Fourth game within a rolling 6-calendar-day span in that window. */
  is4In6: boolean;
  /** Prior game went to overtime (extra fatigue in the model). */
  isOvertimePenalty: boolean;
  /**
   * Consecutive away games including tonight when this team is away; 0 when playing at home
   * or with no road streak into this game.
   */
  roadTripConsecutiveAway: number;
  /** Large east–west spread between home and road venues on the current / recent trip. */
  hasCoastToCoastRoadSwing: boolean;
}

export interface RestAdvantage {
  differential: number;
  advantageTeam: "home" | "away" | "neutral";
}

/** One calendar day in a season with regular-season game count (API: GET /api/games/dates). */
export interface GameDateCount {
  date: string;
  gameCount: number;
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

/** Per-season accuracy of stored predictions (|RA| ≥ 0.5 rule), sorted by season label. */
export interface SeasonAccuracyPoint {
  season: string;
  games: number;
  correct: number;
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

export interface UpcomingPick {
  gameId: number;
  date: string;
  homeTeam: Pick<TeamInfo, "abbreviation">;
  awayTeam: Pick<TeamInfo, "abbreviation">;
  predictedAdvantageTeam: Pick<TeamInfo, "abbreviation">;
  differential: number;
}

export interface AccuracyResponse {
  totalPredictions: number;
  correctPredictions: number;
  /** Overall accuracy percentage (0–100, 1 decimal). */
  accuracyPct: number;
  tiers: AccuracyTier[];
  /** Prediction accuracy by NBA season (chronological). */
  seasonAccuracyTrend: SeasonAccuracyPoint[];
  /** Most recent 20 resolved predictions, newest first. */
  recentPredictions: PredictionDetail[];
  /** Label of the season used for the upcoming slate (e.g. latest season in app config). */
  trackerSeason: string;
  /** Scheduled regular-season games with an open prediction row, from today onward. */
  upcomingPicks: UpcomingPick[];
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

/** Historical backtest stats (final games with fatigue data, |RA| >= 0.5). */
export interface AnalysisResponse {
  /** Total games counted (|RA| >= 0.5). */
  totalGames: number;
  overallWins: number;
  /** Win percentage (0–100, 1 decimal). */
  overallWinRate: number;
  thresholds: ThresholdBucket[];
  homeAwayBreakdown: HomeAwayBreakdown;
  /** Sorted chronologically (ascending). */
  monthlyTrends: MonthlyTrend[];
  /**
   * More-rested team win rate aggregated per NBA season (regular-season calendar only).
   */
  seasonWinRates: {
    season: string;
    games: number;
    restedTeamWins: number;
    winPct: number;
  }[];
  atsOverall: { covered: number; total: number; coverRate: number } | null;
}

// ─── Game search ─────────────────────────────────────────────────

export interface GameSearchResult {
  gameId: number;
  date: string;
  season: string;
  homeTeamAbbreviation: string;
  awayTeamAbbreviation: string;
  homeScore: number;
  awayScore: number;
  homeFatigueScore: number;
  awayFatigueScore: number;
  /** Absolute rest advantage differential (always >= 0). */
  restAdvantageDifferential: number;
  advantageTeam: "home" | "away";
  restedTeamWon: boolean;
}

/** One prior final game in the week before a focal game (for detail modals). */
export interface TeamRecentResultGame {
  date: string;
  opponentAbbreviation: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
  won: boolean;
}

/** Full game card payload plus recent results for both teams. */
export interface GameDetailResponse {
  game: GameResponse;
  homeRecentWeek: TeamRecentResultGame[];
  awayRecentWeek: TeamRecentResultGame[];
}

export interface GameSearchResponse {
  games: GameSearchResult[];
  total: number;
  page: number;
  limit: number;
}
