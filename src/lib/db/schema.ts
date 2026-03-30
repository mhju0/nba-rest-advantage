import {
  boolean,
  date,
  decimal,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  abbreviation: varchar("abbreviation", { length: 3 }).notNull().unique(),
  name: varchar("name").notNull(),
  city: varchar("city").notNull(),
  conference: varchar("conference").notNull(),
  latitude: decimal("latitude").notNull(),
  longitude: decimal("longitude").notNull(),
  altitudeFlag: boolean("altitude_flag").notNull().default(false),
});

export const games = pgTable(
  "games",
  {
    id: serial("id").primaryKey(),
    externalId: varchar("external_id").notNull().unique(),
    date: date("date").notNull(),
    season: varchar("season").notNull(),
    homeTeamId: integer("home_team_id")
      .notNull()
      .references(() => teams.id),
    awayTeamId: integer("away_team_id")
      .notNull()
      .references(() => teams.id),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    status: varchar("status").notNull().default("scheduled"),
    spread: decimal("spread"),
  },
  (t) => [
    index("games_date_idx").on(t.date),
    index("games_status_idx").on(t.status),
    index("games_home_team_idx").on(t.homeTeamId),
    index("games_away_team_idx").on(t.awayTeamId),
  ]
);

export const fatigueScores = pgTable(
  "fatigue_scores",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    teamId: integer("team_id")
      .notNull()
      .references(() => teams.id),

    // Final composite score (0 = fully rested, 15+ = severely fatigued)
    score: decimal("score").notNull(),

    // Breakdown components (for frontend explainability)
    decayLoadScore: decimal("decay_load_score").notNull(),
    travelLoadScore: decimal("travel_load_score").notNull(),
    backToBackMultiplier: decimal("b2b_multiplier").notNull(),
    altitudeMultiplier: decimal("altitude_multiplier").notNull(),
    densityMultiplier: decimal("density_multiplier").notNull(),
    freshnessBonus: decimal("freshness_bonus").notNull(),

    // Raw context (useful for debugging & frontend display)
    gamesInLast7Days: integer("games_in_last_7_days").notNull(),
    travelDistanceMiles: decimal("travel_distance_miles").notNull(),
    isBackToBack: boolean("is_back_to_back").notNull(),
    daysSinceLastGame: integer("days_since_last_game"),

    computedAt: timestamp("computed_at").notNull().defaultNow(),
  },
  (t) => [
    index("fatigue_scores_game_id_idx").on(t.gameId),
    index("fatigue_scores_team_id_idx").on(t.teamId),
  ]
);

export const predictions = pgTable(
  "predictions",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    predictedAdvantageTeamId: integer("predicted_advantage_team_id")
      .notNull()
      .references(() => teams.id),
    restAdvantageDifferential: decimal("rest_advantage_differential").notNull(),
    actualWinnerId: integer("actual_winner_id").references(() => teams.id),
    spreadCovered: boolean("spread_covered"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("predictions_game_id_idx").on(t.gameId)]
);

// ─── Relations ──────────────────────────────────────────────────

export const teamsRelations = relations(teams, ({ many }) => ({
  homeGames: many(games, { relationName: "homeTeam" }),
  awayGames: many(games, { relationName: "awayTeam" }),
  fatigueScores: many(fatigueScores),
  predictedAdvantages: many(predictions, { relationName: "predictedAdvantageTeam" }),
  actualWins: many(predictions, { relationName: "actualWinner" }),
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
  homeTeam: one(teams, {
    fields: [games.homeTeamId],
    references: [teams.id],
    relationName: "homeTeam",
  }),
  awayTeam: one(teams, {
    fields: [games.awayTeamId],
    references: [teams.id],
    relationName: "awayTeam",
  }),
  fatigueScores: many(fatigueScores),
  predictions: many(predictions),
}));

export const fatigueScoresRelations = relations(fatigueScores, ({ one }) => ({
  game: one(games, {
    fields: [fatigueScores.gameId],
    references: [games.id],
  }),
  team: one(teams, {
    fields: [fatigueScores.teamId],
    references: [teams.id],
  }),
}));

export const predictionsRelations = relations(predictions, ({ one }) => ({
  game: one(games, {
    fields: [predictions.gameId],
    references: [games.id],
  }),
  predictedAdvantageTeam: one(teams, {
    fields: [predictions.predictedAdvantageTeamId],
    references: [teams.id],
    relationName: "predictedAdvantageTeam",
  }),
  actualWinner: one(teams, {
    fields: [predictions.actualWinnerId],
    references: [teams.id],
    relationName: "actualWinner",
  }),
}));
