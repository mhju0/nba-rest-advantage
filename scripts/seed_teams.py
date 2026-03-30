"""Seed all 30 NBA teams into the teams table.

Safe to run multiple times — uses INSERT ON CONFLICT DO NOTHING.
Reads DATABASE_URL from scripts/.env.
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

# fmt: off
TEAMS = [
    # abbreviation, name, city, conference, latitude, longitude, altitude_flag
    # ── Eastern Conference ─────────────────────────────────────────────────
    # Atlantic
    ("BOS", "Celtics",      "Boston",       "East", 42.3662,  -71.0621, False),
    ("BKN", "Nets",         "Brooklyn",     "East", 40.6826,  -73.9754, False),
    ("NYK", "Knicks",       "New York",     "East", 40.7505,  -73.9934, False),
    ("PHI", "76ers",        "Philadelphia", "East", 39.9012,  -75.1720, False),
    ("TOR", "Raptors",      "Toronto",      "East", 43.6435,  -79.3791, False),
    # Central
    ("CHI", "Bulls",        "Chicago",      "East", 41.8807,  -87.6742, False),
    ("CLE", "Cavaliers",    "Cleveland",    "East", 41.4965,  -81.6882, False),
    ("DET", "Pistons",      "Detroit",      "East", 42.3410,  -83.0553, False),
    ("IND", "Pacers",       "Indianapolis", "East", 39.7640,  -86.1555, False),
    ("MIL", "Bucks",        "Milwaukee",    "East", 43.0450,  -87.9170, False),
    # Southeast
    ("ATL", "Hawks",        "Atlanta",      "East", 33.7573,  -84.3963, False),
    ("CHA", "Hornets",      "Charlotte",    "East", 35.2251,  -80.8392, False),
    ("MIA", "Heat",         "Miami",        "East", 25.7814,  -80.1870, False),
    ("ORL", "Magic",        "Orlando",      "East", 28.5392,  -81.3836, False),
    ("WAS", "Wizards",      "Washington",   "East", 38.8981,  -77.0209, False),
    # ── Western Conference ─────────────────────────────────────────────────
    # Northwest
    ("DEN", "Nuggets",      "Denver",       "West", 39.7487, -105.0077, True),   # 5,280 ft
    ("MIN", "Timberwolves", "Minneapolis",  "West", 44.9795,  -93.2762, False),
    ("OKC", "Thunder",      "Oklahoma City","West", 35.4634,  -97.5151, False),
    ("POR", "Trail Blazers","Portland",     "West", 45.5316, -122.6668, False),
    ("UTA", "Jazz",         "Salt Lake City","West",40.7683, -111.9011, True),   # 4,226 ft
    # Pacific
    ("GSW", "Warriors",     "San Francisco","West", 37.7680, -122.3877, False),
    ("LAC", "Clippers",     "Los Angeles",  "West", 33.9534, -118.3417, False),
    ("LAL", "Lakers",       "Los Angeles",  "West", 34.0430, -118.2673, False),
    ("PHX", "Suns",         "Phoenix",      "West", 33.4457, -112.0712, False),
    ("SAC", "Kings",        "Sacramento",   "West", 38.5802, -121.4997, False),
    # Southwest
    ("DAL", "Mavericks",    "Dallas",       "West", 32.7905,  -96.8103, False),
    ("HOU", "Rockets",      "Houston",      "West", 29.7508,  -95.3621, False),
    ("MEM", "Grizzlies",    "Memphis",      "West", 35.1383,  -90.0505, False),
    ("NOP", "Pelicans",     "New Orleans",  "West", 29.9490,  -90.0821, False),
    ("SAS", "Spurs",        "San Antonio",  "West", 29.4269,  -98.4375, False),
]
# fmt: on

INSERT_SQL = """
INSERT INTO teams (abbreviation, name, city, conference, latitude, longitude, altitude_flag)
VALUES (%s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (abbreviation) DO NOTHING;
"""


def main() -> None:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.executemany(INSERT_SQL, TEAMS)
                print(f"Seeded {cur.rowcount} teams (skipped existing rows).")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
