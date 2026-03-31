"""Populate the games.spread column from historical betting spread data.

Tries sources in this order:
  1. A local CSV at scripts/spreads_data.csv (manually downloaded or pre-placed)
  2. sports-reference.com / sportsoddshistory.com — placeholder for future scraping
  3. Falls back to printing instructions and creating spreads_template.csv

CSV format expected (header required):
  date,home_team,away_team,spread,over_under
  2023-11-01,BOS,MIA,-5.5,217.5
  ...
  date       – YYYY-MM-DD
  home_team  – 3-letter NBA team abbreviation (matches our teams table)
  away_team  – 3-letter NBA team abbreviation
  spread     – home team's closing line (negative = home favored, e.g. -5.5)
  over_under – total line (optional, not yet stored)

Spread data notes:
  - Use closing lines, not opening lines.
  - A spread of -5.5 means the home team is favoured by 5.5 points.
  - A push (exactly hitting the spread) is treated as no cover.

To get data:
  1. Kaggle: search "NBA betting odds historical" or "NBA spreads" and download
     a CSV. Rename/reshape it to match the format above.
  2. sports-reference.com/cbb/boxscores/ — manual data for specific games.
  3. The-odds-api.com has historical odds via API (paid).
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
DATA_FILE = SCRIPTS_DIR / "spreads_data.csv"
TEMPLATE_FILE = SCRIPTS_DIR / "spreads_template.csv"


def create_template() -> None:
    """Write a blank template CSV so the user knows the expected format."""
    if TEMPLATE_FILE.exists():
        return
    rows = [
        ["date", "home_team", "away_team", "spread", "over_under"],
        ["2023-11-01", "BOS", "MIA", "-5.5", "217.5"],
        ["2023-11-01", "LAL", "GSW", "2.0", "224.0"],
    ]
    with open(TEMPLATE_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)
    print(f"Created template at {TEMPLATE_FILE}")
    print("Fill it in (or replace it with spreads_data.csv) and re-run this script.")


def load_csv(path: Path) -> list[dict]:
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        return list(reader)


def populate_spreads(rows: list[dict], conn: psycopg2.extensions.connection) -> None:
    updated = 0
    skipped = 0

    with conn.cursor() as cur:
        # Build a lookup: (date, home_abbr, away_abbr) → game_id
        cur.execute("""
            SELECT g.id, g.date, ht.abbreviation AS home_abbr, at.abbreviation AS away_abbr
            FROM games g
            JOIN teams ht ON ht.id = g.home_team_id
            JOIN teams at ON at.id = g.away_team_id
        """)
        game_lookup: dict[tuple, int] = {}
        for gid, gdate, home, away in cur.fetchall():
            game_lookup[(str(gdate), home, away)] = gid

    with conn:
        with conn.cursor() as cur:
            for row in rows:
                key = (row["date"].strip(), row["home_team"].strip().upper(), row["away_team"].strip().upper())
                game_id = game_lookup.get(key)
                if game_id is None:
                    skipped += 1
                    continue
                spread_val = row.get("spread", "").strip()
                if not spread_val:
                    skipped += 1
                    continue
                try:
                    float(spread_val)
                except ValueError:
                    skipped += 1
                    continue

                cur.execute(
                    "UPDATE games SET spread = %s WHERE id = %s",
                    (spread_val, game_id),
                )
                updated += 1

    print(f"Updated {updated} game spreads. Skipped {skipped} rows (no match or bad data).")


def main() -> None:
    if DATA_FILE.exists():
        print(f"Found {DATA_FILE}. Loading spreads...")
        rows = load_csv(DATA_FILE)
        conn = psycopg2.connect(DATABASE_URL)
        try:
            populate_spreads(rows, conn)
        finally:
            conn.close()
    else:
        print("No spreads_data.csv found.")
        create_template()
        print(
            "\nTo add spread data:\n"
            "  1. Download a historical NBA odds CSV from Kaggle or another source.\n"
            "  2. Reshape it to match scripts/spreads_template.csv format.\n"
            "  3. Save it as scripts/spreads_data.csv.\n"
            "  4. Re-run: python scripts/fetch_spreads.py\n\n"
            "Once spread data is loaded, the /api/analysis endpoint will automatically\n"
            "calculate ATS cover rates and display them in the Analysis page."
        )


if __name__ == "__main__":
    main()
