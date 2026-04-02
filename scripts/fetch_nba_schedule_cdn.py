"""Fetch the NBA schedule from the official static CDN and upsert into `games`.

Endpoint (no auth):
  https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json

JSON path: ``leagueSchedule.gameDates[]`` → each entry has ``games[]``.

We walk ``gameDates``, keep regular-season rows (stats ``gameId`` prefix ``002``),
and map fields to the same shape as ``fetch_schedule.upsert_game_records`` /
Drizzle ``games`` table:

  external_id, date, season, home_team_id, away_team_id,
  home_score, away_score, status, overtime_periods, game_type

Tip-off time uses ``gameDateTimeUTC``; the ``date`` column is the UTC calendar
date of that instant (``YYYY-MM-DD``), consistent for indexing and queries.

Optional ``utc_month_filter=(year, month)`` (e.g. ``(2026, 4)`` for April 2026)
limits which games are emitted — use ``None`` for the full regular-season slate
(e.g. ``daily_update.py``).
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterator

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


@dataclass(frozen=True)
class CdnScheduleGame:
    """One row parsed from the CDN — aligns 1:1 with fields needed for ``games`` upsert."""

    game_id: str
    home_team_tricode: str
    away_team_tricode: str
    game_date_time_utc: str
    game_date_utc: date
    game_status: int
    home_score_raw: int | None
    away_score_raw: int | None


def fetch_cdn_schedule() -> dict[str, Any]:
    """GET the NBA CDN schedule JSON."""
    req = urllib.request.Request(CDN_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _derive_season_label(season_year: str) -> str:
    """Convert CDN seasonYear (e.g. '2025') to our label format (e.g. '2025-26')."""
    if "-" in season_year:
        return season_year
    try:
        year = int(season_year)
        return f"{year}-{str(year + 1)[-2:]}"
    except ValueError:
        return season_year


def _parse_game_datetime_utc(game: dict[str, Any]) -> datetime | None:
    """Parse tip-off from ``gameDateTimeUTC``, falling back to ``gameDateUTC``."""
    raw = (game.get("gameDateTimeUTC") or game.get("gameDateUTC") or "").strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt
    except ValueError:
        return None


def _iter_cdn_games_from_payload(data: dict[str, Any]) -> Iterator[dict[str, Any]]:
    """Yield each raw game object under ``leagueSchedule.gameDates[].games``."""
    league = data.get("leagueSchedule") or {}
    for game_date_entry in league.get("gameDates") or []:
        for game in game_date_entry.get("games") or []:
            yield game


def parse_cdn_schedule_games(data: dict[str, Any]) -> list[CdnScheduleGame]:
    """
    Flatten ``leagueSchedule.gameDates`` into structured rows (regular season only).

    Extracts:
      - gameId
      - homeTeam.teamTricode / awayTeam.teamTricode
      - gameDateTimeUTC (tip) and UTC calendar date for ``games.date``
      - gameStatus + scores for upsert status/score columns
    """
    out: list[CdnScheduleGame] = []
    for game in _iter_cdn_games_from_payload(data):
        game_id = str(game.get("gameId", "")).strip()
        if len(game_id) < 3 or not game_id.startswith("002"):
            continue

        game_id = normalize_stats_game_id(game_id)

        tip = _parse_game_datetime_utc(game)
        if tip is None:
            continue

        home = game.get("homeTeam") or {}
        away = game.get("awayTeam") or {}
        home_tri = str(home.get("teamTricode", "")).strip().upper()
        away_tri = str(away.get("teamTricode", "")).strip().upper()
        if not home_tri or not away_tri:
            continue

        game_status = int(game.get("gameStatus", 1) or 1)
        hs = home.get("score")
        aw = away.get("score")
        home_score_raw = int(hs) if hs is not None and str(hs).strip() != "" else None
        away_score_raw = int(aw) if aw is not None and str(aw).strip() != "" else None

        raw_iso = (game.get("gameDateTimeUTC") or game.get("gameDateUTC") or "").strip()
        if not raw_iso:
            raw_iso = tip.isoformat().replace("+00:00", "Z")

        out.append(
            CdnScheduleGame(
                game_id=game_id,
                home_team_tricode=home_tri,
                away_team_tricode=away_tri,
                game_date_time_utc=raw_iso,
                game_date_utc=tip.date(),
                game_status=game_status,
                home_score_raw=home_score_raw,
                away_score_raw=away_score_raw,
            )
        )
    return out


def filter_games_by_utc_month(
    games: list[CdnScheduleGame],
    year: int,
    month: int,
) -> list[CdnScheduleGame]:
    """Keep games whose tip-off (UTC calendar date) falls in ``year``-``month``."""
    return [g for g in games if g.game_date_utc.year == year and g.game_date_utc.month == month]


def build_cdn_records(
    data: dict[str, Any],
    team_map: dict[str, int],
    *,
    utc_month_filter: tuple[int, int] | None = None,
) -> tuple[list[tuple], str]:
    """Parse CDN JSON into upsert-ready tuples for the ``games`` table.

    Tuple order matches Drizzle / ``fetch_schedule`` inserts:
      (external_id, date, season, home_team_id, away_team_id,
       home_score, away_score, status, overtime_periods, game_type)

    ``utc_month_filter`` — if ``(2026, 4)``, only April 2026 (UTC game date).
    ``None`` = all regular-season games in the payload.
    """
    league = data.get("leagueSchedule") or {}
    season_year = league.get("seasonYear", "")
    season_label = _derive_season_label(str(season_year))

    parsed = parse_cdn_schedule_games(data)
    if utc_month_filter is not None:
        y, m = utc_month_filter
        parsed = filter_games_by_utc_month(parsed, y, m)

    records: list[tuple] = []
    skipped = 0

    for g in parsed:
        home_tricode = normalize_abbr(g.home_team_tricode)
        away_tricode = normalize_abbr(g.away_team_tricode)

        if home_tricode not in team_map:
            print(f"  WARNING: unknown home team '{home_tricode}', skipping {g.game_id}")
            skipped += 1
            continue
        if away_tricode not in team_map:
            print(f"  WARNING: unknown away team '{away_tricode}', skipping {g.game_id}")
            skipped += 1
            continue

        if g.game_status == 3:
            home_score = g.home_score_raw
            away_score = g.away_score_raw
            status = "final"
        else:
            home_score = None
            away_score = None
            status = "scheduled"

        date_str = g.game_date_utc.isoformat()

        records.append(
            (
                g.game_id,
                date_str,
                season_label,
                team_map[home_tricode],
                team_map[away_tricode],
                home_score,
                away_score,
                status,
                0,
                "regular",
            )
        )

    if skipped:
        print(f"  Skipped {skipped} games (unknown team tricode).")

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

    # Always seed full season by default. The upsert is idempotent.
    month_filter: tuple[int, int] | None = None

    print(f"Fetching NBA CDN schedule from:\n  {CDN_URL}\n")
    data = fetch_cdn_schedule()

    conn = psycopg2.connect(database_url)
    try:
        team_map = load_team_id_map(conn)
        print(f"Loaded {len(team_map)} teams from DB.")

        records, season_label = build_cdn_records(data, team_map, utc_month_filter=month_filter)
        print(f"Parsed {len(records)} regular-season games for season {season_label}.")

        count = upsert_game_records(conn, records)
        print(f"Upserted {count} games into DB (new rows inserted or existing rows updated).")
    finally:
        conn.close()

    print("\nDone.")


if __name__ == "__main__":
    main()
