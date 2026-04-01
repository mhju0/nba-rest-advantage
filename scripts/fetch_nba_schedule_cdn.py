"""Fetch the full current-season schedule from the NBA CDN and upsert into games table.

Uses the static JSON endpoint (no auth required):
  https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json

Only regular-season games (gameId prefix '002') are processed.
Safe to run multiple times — uses ON CONFLICT DO UPDATE.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from fetch_schedule import load_team_id_map, normalize_abbr, normalize_stats_game_id

CDN_URL = "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json"

# ON CONFLICT DO UPDATE: never overwrite a 'final' status with 'scheduled', and
# never overwrite existing scores with NULL (CDN may lack scores for in-progress games).
UPSERT_SQL = """
INSERT INTO games (
    external_id, date, season,
    home_team_id, away_team_id,
    home_score, away_score, status,
    overtime_periods, game_type
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (external_id) DO UPDATE SET
    home_score = COALESCE(EXCLUDED.home_score, games.home_score),
    away_score = COALESCE(EXCLUDED.away_score, games.away_score),
    status     = CASE WHEN games.status = 'final' THEN games.status ELSE EXCLUDED.status END;
"""


def fetch_cdn_schedule() -> dict:
    """GET the NBA CDN schedule JSON."""
    req = urllib.request.Request(CDN_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _derive_season_label(season_year: str) -> str:
    """Convert CDN seasonYear (e.g. '2025') to our label format (e.g. '2025-26')."""
    # Already formatted (e.g. '2025-26') — return as-is
    if "-" in season_year:
        return season_year
    try:
        year = int(season_year)
        return f"{year}-{str(year + 1)[-2:]}"
    except ValueError:
        return season_year


def build_cdn_records(
    data: dict,
    team_map: dict[str, int],
) -> tuple[list[tuple], str]:
    """Parse CDN JSON into upsert-ready tuples.

    Returns (records, season_label).
    Each tuple matches the games table columns:
      (external_id, date, season, home_team_id, away_team_id,
       home_score, away_score, status, overtime_periods, game_type)
    """
    league = data["leagueSchedule"]
    season_year = league.get("seasonYear", "")
    season_label = _derive_season_label(season_year)

    records: list[tuple] = []
    skipped = 0

    for game_date_entry in league.get("gameDates", []):
        for game in game_date_entry.get("games", []):
            game_id = str(game.get("gameId", "")).strip()

            # Only regular-season games (prefix 002)
            if len(game_id) < 3 or not game_id.startswith("002"):
                continue

            game_id = normalize_stats_game_id(game_id)

            # CDN provides gameDateUTC like "2025-10-22T00:00:00Z"
            game_date_utc = game.get("gameDateUTC", "")
            date_str = game_date_utc[:10] if game_date_utc else ""
            if not date_str:
                skipped += 1
                continue

            home_tricode = normalize_abbr(game["homeTeam"]["teamTricode"])
            away_tricode = normalize_abbr(game["awayTeam"]["teamTricode"])

            if home_tricode not in team_map:
                print(f"  WARNING: unknown home team '{home_tricode}', skipping {game_id}")
                skipped += 1
                continue
            if away_tricode not in team_map:
                print(f"  WARNING: unknown away team '{away_tricode}', skipping {game_id}")
                skipped += 1
                continue

            # gameStatus: 1=scheduled, 2=in-progress, 3=final
            game_status = game.get("gameStatus", 1)
            home_score_raw = game["homeTeam"].get("score", 0)
            away_score_raw = game["awayTeam"].get("score", 0)

            if game_status == 3:
                home_score = int(home_score_raw) if home_score_raw else None
                away_score = int(away_score_raw) if away_score_raw else None
                status = "final"
            else:
                home_score = None
                away_score = None
                status = "scheduled"

            records.append((
                game_id,
                date_str,
                season_label,
                team_map[home_tricode],
                team_map[away_tricode],
                home_score,
                away_score,
                status,
                0,          # overtime_periods (CDN doesn't provide this)
                "regular",  # game_type
            ))

    if skipped:
        print(f"  Skipped {skipped} games (missing date or unknown team).")

    return records, season_label


def upsert_game_records(conn: psycopg2.extensions.connection, records: list[tuple]) -> int:
    """Upsert game records. Returns count of records processed."""
    if not records:
        return 0
    with conn:
        with conn.cursor() as cur:
            cur.executemany(UPSERT_SQL, records)
    return len(records)


def main() -> None:
    load_dotenv(Path(__file__).parent / ".env")
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        sys.exit("ERROR: DATABASE_URL not set in scripts/.env")

    print(f"Fetching NBA CDN schedule from:\n  {CDN_URL}\n")
    data = fetch_cdn_schedule()

    conn = psycopg2.connect(database_url)
    try:
        team_map = load_team_id_map(conn)
        print(f"Loaded {len(team_map)} teams from DB.")

        records, season_label = build_cdn_records(data, team_map)
        print(f"Parsed {len(records)} regular-season games for season {season_label}.")

        count = upsert_game_records(conn, records)
        print(f"Upserted {count} games into DB (new rows inserted or existing rows updated).")
    finally:
        conn.close()

    print("\nDone.")


if __name__ == "__main__":
    main()
