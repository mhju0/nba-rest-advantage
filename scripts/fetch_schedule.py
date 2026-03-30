"""Fetch NBA game schedules for 2023-24 and 2024-25 seasons and insert into games table.

Each game appears twice in LeagueGameFinder (one row per team). We pair rows by
GAME_ID, using MATCHUP ("vs." = home, "@ " = away) to identify home/away teams.

Safe to run multiple times — uses INSERT ON CONFLICT DO NOTHING.
Reads DATABASE_URL from scripts/.env.
"""

import os
import sys
import time
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from nba_api.stats.endpoints import leaguegamefinder

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    sys.exit("ERROR: DATABASE_URL not set in scripts/.env")

SEASONS = ["2023-24", "2024-25"]
SEASON_TYPES = ["Regular Season", "Playoffs"]

# Delay between NBA API calls to respect rate limits
API_DELAY_SECONDS = 1


def load_team_id_map(conn: psycopg2.extensions.connection) -> dict[str, int]:
    """Return {abbreviation: id} for all teams in the DB."""
    with conn.cursor() as cur:
        cur.execute("SELECT abbreviation, id FROM teams;")
        return {row[0]: row[1] for row in cur.fetchall()}


def fetch_games_df(season: str, season_type: str) -> pd.DataFrame:
    """Call LeagueGameFinder and return the raw DataFrame."""
    print(f"  Fetching {season} {season_type}...", end=" ", flush=True)
    finder = leaguegamefinder.LeagueGameFinder(
        season_nullable=season,
        season_type_nullable=season_type,
        league_id_nullable="00",  # NBA
        timeout=60,
    )
    df = finder.get_data_frames()[0]
    print(f"{len(df)} rows")
    return df


def pair_games(df: pd.DataFrame, season: str, team_map: dict[str, int]) -> list[tuple]:
    """
    Pair home/away rows by GAME_ID and return insert-ready tuples.

    MATCHUP format:
      "ABC vs. XYZ"  → ABC is the home team
      "ABC @ XYZ"    → ABC is the away team
    """
    if df.empty:
        return []

    # Normalize types
    df = df.copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.date
    df["PTS"] = pd.to_numeric(df["PTS"], errors="coerce")

    # Split into home-perspective and away-perspective rows
    home_rows = df[df["MATCHUP"].str.contains(r"\bvs\.", regex=True)].copy()
    away_rows = df[df["MATCHUP"].str.contains(r"\s@\s", regex=True)].copy()

    # Index by GAME_ID for fast lookup
    home_idx = home_rows.set_index("GAME_ID")
    away_idx = away_rows.set_index("GAME_ID")

    skipped = 0
    records: list[tuple] = []

    # Use home_rows as the driver — every game has exactly one home row
    for game_id, home in home_idx.iterrows():
        if game_id not in away_idx.index:
            print(f"    WARNING: no away row for game {game_id}, skipping")
            skipped += 1
            continue

        away = away_idx.loc[game_id]
        # When a GAME_ID has multiple away rows (rare duplicates), take the first
        if isinstance(away, pd.DataFrame):
            away = away.iloc[0]

        home_abbr = home["TEAM_ABBREVIATION"]
        away_abbr = away["TEAM_ABBREVIATION"]

        if home_abbr not in team_map:
            print(f"    WARNING: unknown home team abbreviation '{home_abbr}', skipping {game_id}")
            skipped += 1
            continue
        if away_abbr not in team_map:
            print(f"    WARNING: unknown away team abbreviation '{away_abbr}', skipping {game_id}")
            skipped += 1
            continue

        home_score = int(home["PTS"]) if pd.notna(home["PTS"]) else None
        away_score = int(away["PTS"]) if pd.notna(away["PTS"]) else None

        records.append((
            str(game_id),                   # external_id
            home["GAME_DATE"],              # date
            season,                         # season
            team_map[home_abbr],            # home_team_id
            team_map[away_abbr],            # away_team_id
            home_score,                     # home_score
            away_score,                     # away_score
            "final",                        # status (historical seasons only)
        ))

    if skipped:
        print(f"    Skipped {skipped} games due to missing data.")

    return records


INSERT_SQL = """
INSERT INTO games (
    external_id, date, season,
    home_team_id, away_team_id,
    home_score, away_score, status
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (external_id) DO NOTHING;
"""


def main() -> None:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        team_map = load_team_id_map(conn)
        print(f"Loaded {len(team_map)} teams from DB.\n")

        total_inserted = 0

        for season in SEASONS:
            print(f"── Season {season} ──────────────────────────────")
            season_records: list[tuple] = []

            for i, season_type in enumerate(SEASON_TYPES):
                if i > 0:
                    time.sleep(API_DELAY_SECONDS)

                df = fetch_games_df(season, season_type)
                records = pair_games(df, season, team_map)
                print(f"  Paired {len(records)} games for {season_type}.")
                season_records.extend(records)

                time.sleep(API_DELAY_SECONDS)

            # Deduplicate within season (same game_id shouldn't appear in both
            # Regular Season and Playoffs, but guard anyway)
            seen: set[str] = set()
            unique_records = []
            for rec in season_records:
                if rec[0] not in seen:
                    seen.add(rec[0])
                    unique_records.append(rec)

            with conn:
                with conn.cursor() as cur:
                    cur.executemany(INSERT_SQL, unique_records)
                    inserted = cur.rowcount
                    total_inserted += inserted
                    print(f"  Inserted {inserted} new games ({len(unique_records) - inserted} already existed).\n")

        print(f"Done. Total new rows inserted: {total_inserted}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
