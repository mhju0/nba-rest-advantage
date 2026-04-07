#!/usr/bin/env python3
"""
Daily NBA pipeline for GitHub Actions (and local runs):

1. Pull a **rolling window** from nba_api (LeagueGameFinder): last 7 ET calendar days
   through **60 days ahead**, upsert into `games` (scores, status, schedule). This fixes
   stale/wrong scores (not only “yesterday”), inserts missing games, and loads upcoming
   slates (e.g. April) without re-running the full season fetch.

2. Refresh **overtime_periods** for **final** regular-season games in the LeagueGameFinder
   window whose dates fall in **[today − LOOKBACK_DAYS, today)** (bounded BoxScoreSummary calls).

3. Run `pnpm exec tsx scripts/run-daily.ts <today ET>` to refresh fatigue for today’s
   slate and regenerate open predictions.

Requires DATABASE_URL in the environment (e.g. GitHub Actions secret).
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg2
from dotenv import load_dotenv

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from fetch_nba_schedule_cdn import (
    build_cdn_records,
    fetch_cdn_schedule,
    upsert_game_records as upsert_cdn_records,
)
from fetch_schedule import (
    fetch_league_df_date_range,
    load_team_id_map,
    pair_games_from_date_range_df,
    upsert_game_records as upsert_stats_window_records,
)
from nba_ot_periods import fetch_overtime_periods

REPO_ROOT = Path(__file__).resolve().parent.parent

# Inclusive calendar span: scores for recent days + full upcoming regular-season window.
LOOKBACK_DAYS = 7
LOOKAHEAD_DAYS = 60


def resolve_database_url() -> str:
    """
    Prefer DATABASE_URL from the process environment (GitHub Actions, shell export).
    If unset or blank, load repo-root .env.local then scripts/.env and read again.
    """
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url:
        return url
    load_dotenv(REPO_ROOT / ".env.local")
    load_dotenv(REPO_ROOT / "scripts" / ".env")
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        print(
            "ERROR: DATABASE_URL is not set. "
            "Set it in the environment (e.g. GitHub Actions secret DATABASE_URL) "
            "or add it to .env.local or scripts/.env for local development.",
            file=sys.stderr,
        )
        sys.exit(1)
    return url


def refresh_ot_lookback_finals(conn, today: date, records: list[tuple]) -> int:
    """
    Refresh overtime_periods for finals in [today - LOOKBACK_DAYS, today) so downstream
    fatigue (prior-game OT flag) stays accurate — not only “yesterday.”

    Tuple layout matches pair_games_from_date_range_df:
    (external_id, game_date, season, ... home_score, away_score, status, ot, game_type)
    """
    oldest = today - timedelta(days=LOOKBACK_DAYS)
    n = 0
    seen: set[str] = set()
    with conn.cursor() as cur:
        for rec in records:
            gid_str = rec[0]
            gdate = rec[1]
            status = rec[7]
            if status != "final" or gdate < oldest or gdate >= today:
                continue
            if gid_str in seen:
                continue
            seen.add(gid_str)
            ot_periods = fetch_overtime_periods(str(gid_str))
            cur.execute(
                """
                UPDATE games
                SET overtime_periods = %s
                WHERE external_id = %s
                """,
                (ot_periods, str(gid_str)),
            )
            n += cur.rowcount
    conn.commit()
    return n


def main() -> None:
    database_url = resolve_database_url()

    et = ZoneInfo("America/New_York")
    now_et = datetime.now(et)
    today = now_et.date()
    window_start = today - timedelta(days=LOOKBACK_DAYS)
    window_end = today + timedelta(days=LOOKAHEAD_DAYS)

    start_str = window_start.isoformat()
    end_str = window_end.isoformat()
    today_str = today.isoformat()

    print(
        f"[daily_update] ET now={now_et.isoformat(timespec='seconds')} "
        f"window={start_str}..{end_str} (today={today_str})"
    )

    # Seed future games from CDN before fetching box scores
    print("[daily_update] fetching CDN schedule to seed future games …")
    cdn_data = fetch_cdn_schedule()

    df = fetch_league_df_date_range(start_str, end_str)

    conn = psycopg2.connect(database_url)
    try:
        team_map = load_team_id_map(conn)
        cdn_records, cdn_season = build_cdn_records(
            cdn_data, team_map, utc_month_filter=None
        )
        cdn_count = upsert_cdn_records(conn, cdn_records)
        print(f"[daily_update] CDN upserted {cdn_count} games for season {cdn_season}.")

        if df.empty:
            print("[daily_update] LeagueGameFinder returned no rows for window.")
            records: list[tuple] = []
        else:
            # Skip per-game OT during bulk pairing (hundreds of games); refresh yesterday below.
            records = pair_games_from_date_range_df(df, team_map, force_skip_ot=True)
            n = upsert_stats_window_records(conn, records)
            conn.commit()
            print(f"[daily_update] upserted {n} regular-season game row(s) in window.")

        if records:
            ot_updated = refresh_ot_lookback_finals(conn, today, records)
            print(
                f"[daily_update] overtime_periods refreshed for finals in {LOOKBACK_DAYS}d lookback: {ot_updated} row(s)"
            )
    finally:
        conn.close()

    print(f"[daily_update] running Node pipeline for {today_str} …")
    result = subprocess.run(
        ["pnpm", "exec", "tsx", "scripts/run-daily.ts", today_str],
        cwd=str(REPO_ROOT),
        env={**os.environ, "DATABASE_URL": database_url},
        check=False,
    )
    if result.returncode != 0:
        sys.exit(result.returncode)

    print("[daily_update] completed successfully.")


if __name__ == "__main__":
    main()
