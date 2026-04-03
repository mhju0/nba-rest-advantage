"""Import NBA spread & moneyline data from Kaggle into the games table.

Usage:
    python scripts/import_kaggle_spreads.py

Prerequisites:
    1. Download the Kaggle dataset:
       python scripts/get_kaggle_data.py
       (Dataset: ehallmar/nba-historical-stats-and-betting-data)
    2. Ensure scripts/.env has DATABASE_URL set.

Expected files (in scripts/):
    - nba_spread.csv     — columns: game_id, book_name, book_id, team_id, a_team_id, spread1, spread2, price1, price2
    - nba_moneyline.csv  — columns: game_id, book_name, book_id, team_id, a_team_id, price1, price2

Spread convention:
    The games.spread column stores the HOME team's closing line as a decimal.
    Negative = home favored (e.g., -5.5 means home favored by 5.5).

De-duplication:
    Multiple sportsbooks per game. We prefer Pinnacle Sports, then fall back
    to the first available book.
"""

import csv
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    sys.exit("ERROR: DATABASE_URL not set in scripts/.env")

SCRIPTS_DIR = Path(__file__).parent
SPREAD_FILE = SCRIPTS_DIR / "nba_spread.csv"
MONEYLINE_FILE = SCRIPTS_DIR / "nba_moneyline.csv"

PREFERRED_BOOK = "Pinnacle Sports"

# ── NBA team ID → 3-char abbreviation (current franchise) ─────────────
# Historical franchise IDs map to the current team abbreviation because
# the DB teams table only has current 30 teams.
NBA_ID_TO_ABBR: dict[int, str] = {
    1610612737: "ATL",
    1610612738: "BOS",
    1610612739: "CLE",
    1610612740: "NOP",  # also NOH, NOK historically
    1610612741: "CHI",
    1610612742: "DAL",
    1610612743: "DEN",
    1610612744: "GSW",
    1610612745: "HOU",
    1610612746: "LAC",
    1610612747: "LAL",
    1610612748: "MIA",
    1610612749: "MIL",
    1610612750: "MIN",
    1610612751: "BKN",  # also NJN historically
    1610612752: "NYK",
    1610612753: "ORL",
    1610612754: "IND",
    1610612755: "PHI",
    1610612756: "PHX",
    1610612757: "POR",
    1610612758: "SAC",
    1610612759: "SAS",
    1610612760: "OKC",  # also SEA historically
    1610612761: "TOR",
    1610612762: "UTA",
    1610612763: "MEM",  # also VAN historically
    1610612764: "WAS",  # also WSB historically
    1610612765: "DET",
    1610612766: "CHA",
}


def load_game_lookup(conn) -> dict[str, dict]:
    """Build a lookup: external_id → {id, home_abbr, away_abbr}."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT g.id, g.external_id, ht.abbreviation AS home_abbr, at.abbreviation AS away_abbr
            FROM games g
            JOIN teams ht ON ht.id = g.home_team_id
            JOIN teams at ON at.id = g.away_team_id
        """)
        lookup = {}
        for gid, ext_id, home, away in cur.fetchall():
            lookup[ext_id] = {"id": gid, "home_abbr": home, "away_abbr": away}
        return lookup


def read_spreads() -> dict[str, dict]:
    """Read nba_spread.csv and de-duplicate: one spread per game.

    Returns: {game_id: {"home_spread": float}} keyed by NBA game ID string.
    We need the game_lookup to know which team is home, so we store raw data
    first and resolve later.
    """
    if not SPREAD_FILE.exists():
        print(f"WARNING: {SPREAD_FILE} not found. Skipping spreads.")
        return {}

    # First pass: collect preferred book rows per game
    # {game_id: {"team_id": int, "a_team_id": int, "spread1": float, "spread2": float, "book": str}}
    best: dict[str, dict] = {}

    with open(SPREAD_FILE, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            gid = row["game_id"].strip()
            book = row["book_name"].strip()
            try:
                spread1 = float(row["spread1"])
                spread2 = float(row["spread2"])
                team_id = int(row["team_id"])
                a_team_id = int(row["a_team_id"])
            except (ValueError, KeyError):
                continue

            if gid not in best:
                best[gid] = {
                    "team_id": team_id,
                    "a_team_id": a_team_id,
                    "spread1": spread1,
                    "spread2": spread2,
                    "book": book,
                }
            elif book == PREFERRED_BOOK and best[gid]["book"] != PREFERRED_BOOK:
                best[gid] = {
                    "team_id": team_id,
                    "a_team_id": a_team_id,
                    "spread1": spread1,
                    "spread2": spread2,
                    "book": book,
                }

    return best


def read_moneylines() -> dict[str, dict]:
    """Read nba_moneyline.csv and de-duplicate: one moneyline per game.

    Returns: {game_id: {"team_id": int, "a_team_id": int, "price1": float, "price2": float}}
    """
    if not MONEYLINE_FILE.exists():
        print(f"WARNING: {MONEYLINE_FILE} not found. Skipping moneylines.")
        return {}

    best: dict[str, dict] = {}

    with open(MONEYLINE_FILE, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            gid = row["game_id"].strip()
            book = row["book_name"].strip()
            try:
                price1 = float(row["price1"])
                price2 = float(row["price2"])
                team_id = int(row["team_id"])
                a_team_id = int(row["a_team_id"])
            except (ValueError, KeyError):
                continue

            if gid not in best:
                best[gid] = {
                    "team_id": team_id,
                    "a_team_id": a_team_id,
                    "price1": price1,
                    "price2": price2,
                    "book": book,
                }
            elif book == PREFERRED_BOOK and best[gid]["book"] != PREFERRED_BOOK:
                best[gid] = {
                    "team_id": team_id,
                    "a_team_id": a_team_id,
                    "price1": price1,
                    "price2": price2,
                    "book": book,
                }

    return best


def resolve_home_spread(spread_row: dict, game_info: dict) -> float | None:
    """Given a spread CSV row and DB game info, return the home team's spread."""
    team_abbr = NBA_ID_TO_ABBR.get(spread_row["team_id"])
    a_team_abbr = NBA_ID_TO_ABBR.get(spread_row["a_team_id"])
    home_abbr = game_info["home_abbr"]

    if team_abbr == home_abbr:
        return spread_row["spread1"]
    elif a_team_abbr == home_abbr:
        return spread_row["spread2"]
    else:
        return None


def resolve_moneylines(ml_row: dict, game_info: dict) -> tuple[int, int] | None:
    """Given a moneyline CSV row and DB game info, return (home_ml, away_ml)."""
    team_abbr = NBA_ID_TO_ABBR.get(ml_row["team_id"])
    a_team_abbr = NBA_ID_TO_ABBR.get(ml_row["a_team_id"])
    home_abbr = game_info["home_abbr"]

    if team_abbr == home_abbr:
        return (int(ml_row["price1"]), int(ml_row["price2"]))
    elif a_team_abbr == home_abbr:
        return (int(ml_row["price2"]), int(ml_row["price1"]))
    else:
        return None


def main() -> None:
    conn = psycopg2.connect(DATABASE_URL)

    try:
        print("Loading game lookup from database...")
        game_lookup = load_game_lookup(conn)
        print(f"  Found {len(game_lookup)} games in DB.")

        # ── Spreads ───────────────────────────────────────────────
        print(f"\nReading {SPREAD_FILE.name}...")
        spreads = read_spreads()
        print(f"  Found {len(spreads)} unique games in Kaggle spread data.")

        spread_matched = 0
        spread_unmatched = 0
        spread_resolve_fail = 0
        spread_updates: list[tuple] = []

        for gid, srow in spreads.items():
            game = game_lookup.get(gid)
            if game is None:
                spread_unmatched += 1
                continue
            home_spread = resolve_home_spread(srow, game)
            if home_spread is None:
                spread_resolve_fail += 1
                continue
            spread_updates.append((home_spread, game["id"]))
            spread_matched += 1

        # ── Moneylines ────────────────────────────────────────────
        print(f"\nReading {MONEYLINE_FILE.name}...")
        moneylines = read_moneylines()
        print(f"  Found {len(moneylines)} unique games in Kaggle moneyline data.")

        ml_matched = 0
        ml_unmatched = 0
        ml_resolve_fail = 0
        ml_updates: list[tuple] = []

        for gid, mrow in moneylines.items():
            game = game_lookup.get(gid)
            if game is None:
                ml_unmatched += 1
                continue
            result = resolve_moneylines(mrow, game)
            if result is None:
                ml_resolve_fail += 1
                continue
            home_ml, away_ml = result
            ml_updates.append((home_ml, away_ml, game["id"]))
            ml_matched += 1

        # ── Bulk update ───────────────────────────────────────────
        print("\nApplying updates to database...")
        with conn:
            with conn.cursor() as cur:
                if spread_updates:
                    from psycopg2.extras import execute_batch
                    execute_batch(
                        cur,
                        "UPDATE games SET spread = %s WHERE id = %s",
                        spread_updates,
                        page_size=1000,
                    )

                if ml_updates:
                    from psycopg2.extras import execute_batch
                    execute_batch(
                        cur,
                        "UPDATE games SET home_moneyline = %s, away_moneyline = %s WHERE id = %s",
                        ml_updates,
                        page_size=1000,
                    )

        # ── Summary ───────────────────────────────────────────────
        print("\n" + "=" * 55)
        print("SPREAD IMPORT SUMMARY")
        print("=" * 55)
        print(f"  Kaggle games found:        {len(spreads)}")
        print(f"  Matched to DB:             {spread_matched}")
        print(f"  No DB match (ext_id):      {spread_unmatched}")
        print(f"  Team resolution failed:    {spread_resolve_fail}")
        print(f"  Rows updated:              {len(spread_updates)}")

        print()
        print("=" * 55)
        print("MONEYLINE IMPORT SUMMARY")
        print("=" * 55)
        print(f"  Kaggle games found:        {len(moneylines)}")
        print(f"  Matched to DB:             {ml_matched}")
        print(f"  No DB match (ext_id):      {ml_unmatched}")
        print(f"  Team resolution failed:    {ml_resolve_fail}")
        print(f"  Rows updated:              {len(ml_updates)}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
