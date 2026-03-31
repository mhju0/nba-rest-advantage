ALTER TABLE "fatigue_scores" ADD COLUMN IF NOT EXISTS "games_in_last_30_days" integer DEFAULT 0 NOT NULL;
ALTER TABLE "fatigue_scores" ADD COLUMN IF NOT EXISTS "road_trip_consecutive_away" integer DEFAULT 0 NOT NULL;
ALTER TABLE "fatigue_scores" ADD COLUMN IF NOT EXISTS "is_three_in_four" boolean DEFAULT false NOT NULL;
ALTER TABLE "fatigue_scores" ADD COLUMN IF NOT EXISTS "is_four_in_six" boolean DEFAULT false NOT NULL;
ALTER TABLE "fatigue_scores" ADD COLUMN IF NOT EXISTS "has_coast_to_coast_road_swing" boolean DEFAULT false NOT NULL;
