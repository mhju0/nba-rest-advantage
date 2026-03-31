"""Backfill the game_type column for all existing games rows.

Safe to run multiple times — only updates rows where game_type = 'regular' whose
external_id indicates they should be 'playoffs' or 'finals'.

Logic:
  - external_id starts with '004' + month >= 6 → 'finals'
  - external_id starts with '004' + month  < 6 → 'playoffs'
  - everything else stays 'regular'
"""

import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    sys.exit("ERROR: DATABASE_URL not set in scripts/.env")


def main() -> None:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE games
                    SET game_type = CASE
                        WHEN external_id LIKE '004%%' AND EXTRACT(MONTH FROM date::date) >= 6 THEN 'finals'
                        WHEN external_id LIKE '004%%' THEN 'playoffs'
                        ELSE 'regular'
                    END
                    WHERE game_type = 'regular'
                      AND external_id LIKE '004%%';
                """)
                updated = cur.rowcount
        print(f"Backfilled {updated} playoff/finals game_type rows.")

        # Verify counts
        with conn.cursor() as cur:
            cur.execute(
                "SELECT game_type, COUNT(*) FROM games GROUP BY game_type ORDER BY game_type;"
            )
            rows = cur.fetchall()
        print("\ngame_type breakdown:")
        for gtype, cnt in rows:
            print(f"  {gtype:10s}: {cnt:,}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
