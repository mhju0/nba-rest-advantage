#!/usr/bin/env python3
"""
One-shot historical backfill: NBA seasons 2005-06 through 2014-15 (regular season only).

- Fetches schedules via nba_api (same pairing/insert logic as fetch_schedule.py; no playoffs).
  Season strings are "YYYY-YY" (e.g. "2005-06") — same as LeagueGameFinder usage in fetch_schedule.py.
- Rate limiting + retries on LeagueGameFinder calls.
- Inserts games with ON CONFLICT DO NOTHING (safe re-runs).
- Invokes the existing TypeScript fatigue pipeline (calculateFatigue in src/lib/fatigue.ts
  via scripts/backfill_fatigue.ts) — no duplicate fatigue math in Python.

Usage (from repo root):
  python scripts/backfill_historical.py
  python scripts/backfill_historical.py --dry-run
  python scripts/backfill_historical.py --skip-fatigue

Environment:
  DATABASE_URL in scripts/.env (or cwd .env)
  NBA_SEED_SKIP_OT=1 recommended — avoids thousands of BoxScore calls (OT stays 0).

Does not modify fetch_schedule.py; imports it as a library.
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import pandas as pd

_SCRIPTS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SCRIPTS_DIR.parent

if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

logger = logging.getLogger("backfill_historical")

# Ten additional historical seasons (labels match DB / fetch_schedule).
HISTORICAL_SEASONS: tuple[str, ...] = (
    "2005-06",
    "2006-07",
    "2007-08",
    "2008-09",
    "2009-10",
    "2010-11",
    "2011-12",
    "2012-13",
    "2013-14",
    "2014-15",
)

# Minimum delay before each LeagueGameFinder request (seconds).
API_DELAY_SECONDS = max(1.0, float(os.environ.get("NBA_API_DELAY_SECONDS", "1.0")))

RETRY_ATTEMPTS = 3
RETRY_BASE_SLEEP = 2.0

INSERT_BATCH_SIZE = 300

# Regular-season expectations (approximate); lockout year is lower.
EXPECTED_REGULAR_GAMES: dict[str, int] = {
    "2011-12": 990,
}
DEFAULT_EXPECTED_REGULAR = 1230

FATIGUE_BACKFILL_START = "2005-10-01"
FATIGUE_BACKFILL_END = "2015-06-30"


def _sleep_backoff(attempt: int) -> None:
    delay = RETRY_BASE_SLEEP * (2**attempt)
    logger.warning("Retry backoff: sleeping %.1fs", delay)
    time.sleep(delay)


def fetch_games_df_with_retry(season: str, season_type: str) -> "pd.DataFrame":
    """
    Call LeagueGameFinder with API_DELAY_SECONDS before each attempt and
    exponential backoff on failure (RETRY_ATTEMPTS tries).
    """
    from nba_api.stats.endpoints import leaguegamefinder

    last_exc: Exception | None = None
    for attempt in range(RETRY_ATTEMPTS):
        try:
            logger.info(
                "Fetching LeagueGameFinder %s %s (attempt %s/%s)",
                season,
                season_type,
                attempt + 1,
                RETRY_ATTEMPTS,
            )
            time.sleep(API_DELAY_SECONDS)
            finder = leaguegamefinder.LeagueGameFinder(
                season_nullable=season,
                season_type_nullable=season_type,
                league_id_nullable="00",
                timeout=90,
            )
            df = finder.get_data_frames()[0]
            logger.info("  → %s rows", len(df))
            return df
        except Exception as exc:  # noqa: BLE001 — nba_api / network
            last_exc = exc
            logger.warning("  → failed: %s", exc)
            if attempt < RETRY_ATTEMPTS - 1:
                _sleep_backoff(attempt)
    assert last_exc is not None
    raise last_exc


def count_rows(conn: Any, table: str) -> int:
    with conn.cursor() as cur:
        cur.execute(f"SELECT count(*) FROM {table};")
        return int(cur.fetchone()[0])


def season_summary_rows(conn: Any, seasons: tuple[str, ...]) -> list[dict[str, Any]]:
    """Per season: total games, regular count, games with 2 fatigue rows."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT g.season,
                   COUNT(*)::bigint AS total_games,
                   SUM(CASE WHEN g.game_type = 'regular' THEN 1 ELSE 0 END)::bigint AS regular_games,
                   SUM(
                     CASE
                       WHEN (SELECT COUNT(*) FROM fatigue_scores fs WHERE fs.game_id = g.id) >= 2
                       THEN 1 ELSE 0
                     END
                   )::bigint AS games_with_fatigue
            FROM games g
            WHERE g.season = ANY(%s)
            GROUP BY g.season
            ORDER BY g.season;
            """,
            (list(seasons),),
        )
        cols = [d[0] for d in cur.description]
        out: list[dict[str, Any]] = []
        for row in cur.fetchall():
            d = dict(zip(cols, row))
            if "season" in d and d["season"] is not None:
                d["season"] = str(d["season"])
            out.append(d)
        return out


def insert_batches(
    conn: Any,
    insert_sql: str,
    records: list[tuple],
    *,
    dry_run: bool,
) -> int:
    """Insert in chunks; return number of records sent (not necessarily new rows)."""
    if dry_run:
        logger.info("[dry-run] Skipping DB insert for %s records.", len(records))
        return 0
    total_sent = 0
    with conn:
        with conn.cursor() as cur:
            for i in range(0, len(records), INSERT_BATCH_SIZE):
                chunk = records[i : i + INSERT_BATCH_SIZE]
                cur.executemany(insert_sql, chunk)
                total_sent += len(chunk)
                logger.info(
                    "  Insert batch %s–%s (%s rows)",
                    i + 1,
                    i + len(chunk),
                    len(chunk),
                )
    return total_sent


def run_fatigue_backfill_ts(repo_root: Path, start: str, end: str) -> None:
    """Reuse scripts/backfill_fatigue.ts (Drizzle + calculateFatigue)."""
    pnpm = shutil.which("pnpm")
    if not pnpm:
        raise RuntimeError("pnpm not found on PATH; install Node tooling to run fatigue backfill.")

    cmd = [
        pnpm,
        "exec",
        "tsx",
        "scripts/backfill_fatigue.ts",
        start,
        end,
    ]
    logger.info("Running fatigue backfill: %s (cwd=%s)", " ".join(cmd), repo_root)
    subprocess.run(cmd, cwd=repo_root, check=True)


def print_validation_table(rows: list[dict[str, Any]], failures: dict[str, str]) -> None:
    print("\n=== Season summary ===")
    print(
        f"{'Season':<10} {'Total':>7} {'Regular':>8} {'w/ fatigue':>11} {'Note':<30}"
    )
    print("-" * 72)
    for r in rows:
        season = r["season"]
        note = ""
        exp = EXPECTED_REGULAR_GAMES.get(season, DEFAULT_EXPECTED_REGULAR)
        reg = int(r["regular_games"] or 0)
        if season in failures:
            note = f"FETCH ERROR: {failures[season][:40]}"
        elif reg > 0 and reg < exp - 100:
            note = f"Low regular count (expected ~{exp})"
        elif reg > exp + 50:
            note = "High regular count (check data)"
        tot = int(r["total_games"] or 0)
        gf = int(r["games_with_fatigue"] or 0)
        print(f"{season:<10} {tot:>7} {reg:>8} {gf:>11} {note:<30}")
    print("-" * 72)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )

    parser = argparse.ArgumentParser(
        description="Backfill 2005-06 … 2014-15 games and run TS fatigue backfill."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch only the first historical season, print sample rows; no DB writes, no fatigue.",
    )
    parser.add_argument(
        "--skip-fatigue",
        action="store_true",
        help="Insert games only; do not invoke backfill_fatigue.ts.",
    )
    args = parser.parse_args()

    import psycopg2
    import fetch_schedule as fs

    seasons: tuple[str, ...] = (HISTORICAL_SEASONS[0],) if args.dry_run else HISTORICAL_SEASONS

    if not fs.DATABASE_URL:
        sys.exit("ERROR: DATABASE_URL not set (scripts/.env)")

    games_before = fatigue_before = None
    conn = psycopg2.connect(fs.DATABASE_URL)
    try:
        games_before = count_rows(conn, "games")
        fatigue_before = count_rows(conn, "fatigue_scores")
        logger.info("DB counts before: games=%s fatigue_scores=%s", games_before, fatigue_before)

        team_map = fs.load_team_id_map(conn)
        logger.info("Loaded %s teams.", len(team_map))
        if fs.SKIP_OT_SEED:
            logger.info("NBA_SEED_SKIP_OT set — overtime_periods will stay 0 for new rows.")
        else:
            logger.warning(
                "Per-game BoxScore OT fetch is slow; set NBA_SEED_SKIP_OT=1 for historical runs."
            )

        failures: dict[str, str] = {}

        for season in seasons:
            logger.info("======== Season %s ========", season)
            season_records: list[tuple] = []
            try:
                for i, season_type in enumerate(fs.SEASON_TYPES):
                    if i > 0:
                        time.sleep(API_DELAY_SECONDS)
                    df = fetch_games_df_with_retry(season, season_type)
                    records = fs.pair_games(df, season, team_map)
                    logger.info("  Paired %s games (%s).", len(records), season_type)
                    season_records.extend(records)
                    time.sleep(API_DELAY_SECONDS)

                seen: set[str] = set()
                unique_records: list[tuple] = []
                for rec in season_records:
                    eid = rec[0]
                    if eid not in seen:
                        seen.add(eid)
                        unique_records.append(rec)

                if args.dry_run:
                    print("\n[dry-run] First season:", season)
                    print(f"  Unique paired games: {len(unique_records)}")
                    regular_n = sum(1 for r in unique_records if r[9] == "regular")
                    print(f"  Of which game_type=regular: {regular_n}")
                    print("  Sample insert tuples (first 3):")
                    for t in unique_records[:3]:
                        print(f"    {t}")
                    print("\n[dry-run] No database insert and no fatigue backfill.")
                    return

                insert_batches(conn, fs.INSERT_SQL, unique_records, dry_run=False)
                logger.info("  Finished inserts for %s.", season)

            except Exception as exc:  # noqa: BLE001
                logger.exception("Season %s failed", season)
                failures[season] = str(exc)

        if not args.dry_run and not failures:
            logger.info("All configured seasons fetched and inserted without fatal errors.")
        elif failures:
            logger.warning(
                "One or more seasons failed to fetch/insert; fatigue backfill is skipped "
                "so TS does not run on a half-finished ingest. Fix errors and re-run."
            )

        if not args.skip_fatigue and not args.dry_run and not failures:
            run_fatigue_backfill_ts(_REPO_ROOT, FATIGUE_BACKFILL_START, FATIGUE_BACKFILL_END)
        elif not args.dry_run and args.skip_fatigue:
            logger.info("--skip-fatigue: not running backfill_fatigue.ts")

        games_after = count_rows(conn, "games")
        fatigue_after = count_rows(conn, "fatigue_scores")
        logger.info("DB counts after: games=%s fatigue_scores=%s", games_after, fatigue_after)
        print(
            f"\nTotals: games {games_before} → {games_after} "
            f"(+{games_after - games_before}); "
            f"fatigue_scores {fatigue_before} → {fatigue_after} "
            f"(+{fatigue_after - fatigue_before})"
        )

        summary = season_summary_rows(conn, HISTORICAL_SEASONS)
        # Include seasons with zero rows in DB (missing entirely)
        by_season = {r["season"]: r for r in summary}
        merged: list[dict[str, Any]] = []
        for s in HISTORICAL_SEASONS:
            if s in by_season:
                merged.append(by_season[s])
            else:
                merged.append(
                    {
                        "season": s,
                        "total_games": 0,
                        "regular_games": 0,
                        "games_with_fatigue": 0,
                    }
                )
        print_validation_table(merged, failures)
        if failures:
            sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
