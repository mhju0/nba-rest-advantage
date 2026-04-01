"""Fetch NBA game schedules and insert into games table.

Covers seasons from 1985-86 through 2025-26, excluding 2019-20 (see below).
Each game appears twice in LeagueGameFinder (one row per team). We pair rows by
GAME_ID, using MATCHUP ("vs." = home, "@ " = away) to identify home/away teams.

Safe to run multiple times — uses INSERT ... ON CONFLICT (external_id) DO UPDATE
for scores, status, overtime_periods, and game_type so current-season rows refresh
when games go final.

Reads DATABASE_URL from scripts/.env.

Skipped season — 2019-20 (COVID bubble):
  After the March 2020 shutdown, the league finished the season in a single-site
  bubble in Orlando with no real home/road travel. Feeding those games into our
  haversine / travel-fatigue model would corrupt schedule-load signals, so this
  season is omitted entirely.

Other notes:
  2020-21: Normal home/away schedule (no bubble) — included.

  Playoffs: Not fetched — only Regular Season (stats.nba.com game IDs with 002 prefix).

Post-fetch (recompute aggregates for analysis + tracker; repo root, DATABASE_URL set):

  pnpm exec tsx scripts/backfill_fatigue.ts
  pnpm exec tsx scripts/backfill_predictions.ts

Large historical pulls: fatigue backfill can take 30–90+ minutes for ~40 seasons.
"""

import os
import sys
import time
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from nba_api.stats.endpoints import leaguegamefinder

_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from nba_ot_periods import fetch_overtime_periods

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    sys.exit("ERROR: DATABASE_URL not set in scripts/.env")

# Set NBA_SEED_SKIP_OT=1 to skip per-game BoxScore calls (faster seed; OT stays 0).
SKIP_OT_SEED = os.environ.get("NBA_SEED_SKIP_OT", "").lower() in ("1", "true", "yes")

# 2019-20 omitted — Orlando bubble has no meaningful travel for fatigue analysis.
def _nba_season_labels() -> list[str]:
    """Start years 1985..2025 → '1985-86' .. '2025-26'; skip 2019-20 bubble."""
    out: list[str] = []
    for y in range(1985, 2026):
        if y == 2019:
            continue
        out.append(f"{y}-{str(y + 1)[-2:]}")
    return out


SEASONS = _nba_season_labels()
# Playoffs excluded — app and fatigue model target regular season only.
SEASON_TYPES = ["Regular Season"]

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


# Some older seasons use different abbreviations in nba_api than what we store.
# Map any legacy/alternate abbreviations → our canonical abbreviation.
ABBR_ALIASES: dict[str, str] = {
    "CHO": "CHA",   # Charlotte Hornets (nba_api alternates between CHO and CHA)
    "CHH": "CHA",   # Original Charlotte Hornets (1988–2002; maps to current CHA row)
    "NJN": "BKN",   # New Jersey Nets (moved to Brooklyn 2012-13; kept for safety)
    "NOH": "NOP",   # New Orleans Hornets/Pelicans pre-2013 (kept for safety)
    "NOK": "NOP",   # New Orleans/Oklahoma City Hornets (2005-07; unlikely but safe)
    "SEA": "OKC",   # Seattle SuperSonics (became OKC 2008-09; kept for safety)
    "VAN": "MEM",   # Vancouver Grizzlies (moved to Memphis 2001; kept for safety)
    # Legacy stats.nba.com codes (pre–mid-2000s naming)
    "GOS": "GSW",   # Golden State (historical typo / old code)
    "PHL": "PHI",   # Philadelphia 76ers
    "SAN": "SAS",   # San Antonio Spurs
    "UTH": "UTA",   # Utah Jazz
}


def normalize_abbr(abbr: str) -> str:
    return ABBR_ALIASES.get(abbr, abbr)


def normalize_stats_game_id(game_id: object) -> str:
    """10-digit NBA stats GAME_ID string (zero-padded if numeric)."""
    s = str(game_id).strip()
    if s.isdigit() and len(s) < 10:
        return s.zfill(10)
    return s


def is_regular_season_game_id(game_id: object) -> bool:
    """Regular-season games use a 002 prefix in NBA stats GAME_ID."""
    gid = normalize_stats_game_id(game_id)
    return len(gid) >= 3 and gid.startswith("002")


def season_id_to_label(season_id: object) -> str:
    """Map stats.nba.com SEASON_ID (e.g. 22025) to '2025-26'."""
    raw = int(season_id)
    y = int(str(raw)[-4:])
    return f"{y}-{str(y + 1)[-2:]}"


def get_game_type(game_id: str, game_date) -> str:
    """
    Determine season segment from the NBA API game ID and date.
    - IDs starting with '004' are playoff games.
    - Playoff games in June (month >= 6) are the Finals.
    """
    gid_str = normalize_stats_game_id(game_id)
    if gid_str.startswith("004"):
        try:
            month = game_date.month
        except AttributeError:
            import datetime
            month = datetime.date.fromisoformat(str(game_date)).month
        return "finals" if month >= 6 else "playoffs"
    return "regular"


def _pair_games_dataframe(
    df: pd.DataFrame,
    team_map: dict[str, int],
    resolve_season,
    *,
    force_skip_ot: bool | None = None,
) -> list[tuple]:
    """
    Pair home/away rows by GAME_ID. resolve_season(home_row) -> season label or None to skip.
    """
    if df.empty:
        return []

    df = df.copy()
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"]).dt.date
    df["PTS"] = pd.to_numeric(df["PTS"], errors="coerce")

    home_rows = df[df["MATCHUP"].str.contains(r"\bvs\.", regex=True, na=False)].copy()
    away_rows = df[df["MATCHUP"].str.contains(r"\s@\s", regex=True, na=False)].copy()

    home_idx = home_rows.set_index("GAME_ID")
    away_idx = away_rows.set_index("GAME_ID")

    skipped = 0
    skipped_non_regular = 0
    skipped_season = 0
    records: list[tuple] = []

    for game_id, home in home_idx.iterrows():
        if game_id not in away_idx.index:
            print(f"    WARNING: no away row for game {game_id}, skipping")
            skipped += 1
            continue

        away = away_idx.loc[game_id]
        if isinstance(away, pd.DataFrame):
            away = away.iloc[0]

        season = resolve_season(home)
        if season is None:
            skipped_season += 1
            continue

        home_abbr = normalize_abbr(home["TEAM_ABBREVIATION"])
        away_abbr = normalize_abbr(away["TEAM_ABBREVIATION"])

        if home_abbr not in team_map:
            print(f"    WARNING: unknown home team abbreviation '{home['TEAM_ABBREVIATION']}' (normalized: '{home_abbr}'), skipping {game_id}")
            skipped += 1
            continue
        if away_abbr not in team_map:
            print(f"    WARNING: unknown away team abbreviation '{away['TEAM_ABBREVIATION']}' (normalized: '{away_abbr}'), skipping {game_id}")
            skipped += 1
            continue

        gid_str = normalize_stats_game_id(game_id)
        if not is_regular_season_game_id(gid_str):
            skipped_non_regular += 1
            continue

        home_score = int(home["PTS"]) if pd.notna(home["PTS"]) else None
        away_score = int(away["PTS"]) if pd.notna(away["PTS"]) else None

        is_final = home_score is not None and away_score is not None
        status = "final" if is_final else "scheduled"
        skip_ot = SKIP_OT_SEED if force_skip_ot is None else force_skip_ot
        if is_final and not skip_ot:
            ot_periods = fetch_overtime_periods(gid_str)
        else:
            ot_periods = 0
        game_type = get_game_type(gid_str, home["GAME_DATE"])

        records.append((
            gid_str,
            home["GAME_DATE"],
            season,
            team_map[home_abbr],
            team_map[away_abbr],
            home_score,
            away_score,
            status,
            ot_periods,
            game_type,
        ))

    if skipped_non_regular:
        print(f"    Skipped {skipped_non_regular} non-regular games (game_id prefix is not 002).")
    if skipped_season:
        print(f"    Skipped {skipped_season} games (missing or invalid SEASON_ID).")
    if skipped:
        print(f"    Skipped {skipped} games due to missing data.")

    return records


def pair_games(df: pd.DataFrame, season: str, team_map: dict[str, int]) -> list[tuple]:
    """
    Pair home/away rows by GAME_ID and return insert-ready tuples.

    MATCHUP format:
      "ABC vs. XYZ"  → ABC is the home team
      "ABC @ XYZ"    → ABC is the away team
    """
    return _pair_games_dataframe(df, team_map, lambda _home: season)


def resolve_season_from_row(home) -> str | None:
    """Use SEASON_ID from LeagueGameFinder (date-range queries)."""
    if "SEASON_ID" not in home.index or pd.isna(home["SEASON_ID"]):
        return None
    try:
        return season_id_to_label(home["SEASON_ID"])
    except (TypeError, ValueError):
        return None


def pair_games_from_date_range_df(
    df: pd.DataFrame,
    team_map: dict[str, int],
    *,
    force_skip_ot: bool | None = None,
) -> list[tuple]:
    """Same as pair_games but season comes from each row's SEASON_ID (required for multi-day API pulls)."""
    return _pair_games_dataframe(
        df, team_map, resolve_season_from_row, force_skip_ot=force_skip_ot
    )


def fetch_league_df_date_range(date_from: str, date_to: str) -> pd.DataFrame:
    """LeagueGameFinder for an inclusive calendar span (YYYY-MM-DD)."""
    print(f"  Fetching LeagueGameFinder {date_from} … {date_to} …", end=" ", flush=True)
    finder = leaguegamefinder.LeagueGameFinder(
        date_from_nullable=date_from,
        date_to_nullable=date_to,
        league_id_nullable="00",
        timeout=90,
    )
    out = finder.get_data_frames()[0]
    print(f"{len(out)} rows")
    return out


def upsert_game_records(conn, records: list[tuple]) -> int:
    """INSERT … ON CONFLICT DO UPDATE. Deduplicates by external_id (last wins)."""
    if not records:
        return 0
    seen: dict[str, tuple] = {}
    for rec in records:
        seen[rec[0]] = rec
    unique = list(seen.values())
    with conn.cursor() as cur:
        cur.executemany(INSERT_SQL, unique)
    return len(unique)


INSERT_SQL = """
INSERT INTO games (
    external_id, date, season,
    home_team_id, away_team_id,
    home_score, away_score, status,
    overtime_periods, game_type
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (external_id) DO UPDATE SET
    home_score = EXCLUDED.home_score,
    away_score = EXCLUDED.away_score,
    status = EXCLUDED.status,
    overtime_periods = EXCLUDED.overtime_periods,
    game_type = EXCLUDED.game_type;
"""


def main() -> None:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        team_map = load_team_id_map(conn)
        print(f"Loaded {len(team_map)} teams from DB.")
        if SKIP_OT_SEED:
            print("NBA_SEED_SKIP_OT is set — new rows get overtime_periods=0 (faster seed).\n")
        else:
            print("Fetching overtime via BoxScoreSummary (slow; set NBA_SEED_SKIP_OT=1 to skip).\n")

        total_upserts = 0

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

            # Deduplicate within season (guard against duplicate API rows)
            seen: set[str] = set()
            unique_records = []
            for rec in season_records:
                if rec[0] not in seen:
                    seen.add(rec[0])
                    unique_records.append(rec)

            with conn:
                with conn.cursor() as cur:
                    cur.executemany(INSERT_SQL, unique_records)
                    total_upserts += len(unique_records)
                    print(f"  Upserted {len(unique_records)} game row(s) (insert or update).\n")

        print(f"Done. Total game records applied: {total_upserts}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
