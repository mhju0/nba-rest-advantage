#!/usr/bin/env python3
"""
Daily NBA pipeline for GitHub Actions:

1. Pull yesterday's box scores from nba_api (LeagueGameFinder) and mark games final.
2. Run `pnpm exec tsx scripts/run-daily.ts <today ET>` to refresh fatigue for today's
   slate and regenerate open predictions.

Requires DATABASE_URL in the environment (set via GitHub Actions secret).
"""

from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from nba_api.stats.endpoints import leaguegamefinder

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from nba_ot_periods import fetch_overtime_periods

REPO_ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    load_dotenv(REPO_ROOT / ".env.local")
    load_dotenv(REPO_ROOT / "scripts" / ".env")

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set", file=sys.stderr)
        sys.exit(1)

    et = ZoneInfo("America/New_York")
    now_et = datetime.now(et)
    yesterday = (now_et - timedelta(days=1)).date()
    today = now_et.date()

    yesterday_str = yesterday.isoformat()
    today_str = today.isoformat()

    print(
        f"[daily_update] ET now={now_et.isoformat(timespec='seconds')} "
        f"yesterday={yesterday_str} today={today_str}"
    )

    finder = leaguegamefinder.LeagueGameFinder(
        date_from_nullable=yesterday_str,
        date_to_nullable=yesterday_str,
        league_id_nullable="00",
        timeout=90,
    )
    df = finder.get_data_frames()[0]

    conn = psycopg2.connect(database_url)
    updated = 0
    try:
        if df.empty:
            print("[daily_update] No NBA rows returned for yesterday (off day or API empty).")
        else:
            updated = apply_score_updates(conn, df)
        print(f"[daily_update] games rows touched by score update: {updated}")
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


def apply_score_updates(conn, df: pd.DataFrame) -> int:
    """Pair home/away rows by GAME_ID and UPDATE games by external_id."""
    df = df.copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.date
    df["PTS"] = pd.to_numeric(df["PTS"], errors="coerce")

    home_rows = df[df["MATCHUP"].str.contains(r"\bvs\.", regex=True, na=False)]
    away_rows = df[df["MATCHUP"].str.contains(r"\s@\s", regex=True, na=False)]
    home_idx = home_rows.set_index("GAME_ID")
    away_idx = away_rows.set_index("GAME_ID")

    touched = 0
    with conn.cursor() as cur:
        for game_id, home in home_idx.iterrows():
            if game_id not in away_idx.index:
                continue
            away = away_idx.loc[game_id]
            if isinstance(away, pd.DataFrame):
                away = away.iloc[0]

            gid = str(game_id)
            if pd.isna(home["PTS"]) or pd.isna(away["PTS"]):
                continue

            h_pts = int(home["PTS"])
            a_pts = int(away["PTS"])

            cur.execute(
                """
                UPDATE games
                SET home_score = %s,
                    away_score = %s,
                    status = 'final'
                WHERE external_id = %s
                """,
                (h_pts, a_pts, gid),
            )
            touched += cur.rowcount

            if cur.rowcount > 0:
                ot_periods = fetch_overtime_periods(gid)
                cur.execute(
                    """
                    UPDATE games
                    SET overtime_periods = %s
                    WHERE external_id = %s
                    """,
                    (ot_periods, gid),
                )

        conn.commit()

    return touched


if __name__ == "__main__":
    main()
