-- Migration: add game_type column to games table
-- Values: 'regular' (default), 'playoffs', 'finals'
-- Safe to run multiple times (IF NOT EXISTS / UPDATE ... WHERE is idempotent).

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS game_type varchar NOT NULL DEFAULT 'regular';

-- Backfill existing rows based on external_id prefix and game month.
-- external_id like '002%'  → regular season
-- external_id like '004%' + month >= 6 → finals
-- external_id like '004%' + month < 6  → playoffs
UPDATE games
SET game_type = CASE
  WHEN external_id LIKE '004%' AND EXTRACT(MONTH FROM date::date) >= 6 THEN 'finals'
  WHEN external_id LIKE '004%' THEN 'playoffs'
  ELSE 'regular'
END
WHERE game_type = 'regular';   -- only touch rows still at the default
