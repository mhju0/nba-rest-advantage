"""Fetch overtime period count for a single NBA game (stats.nba.com).

`overtime_periods` stored in Postgres: 0 = regulation only, 1 = one OT, etc.
Derived from the final period index (period 5 after regulation = 1 OT).
"""

from __future__ import annotations

import time


def fetch_overtime_periods(game_id: str, *, delay_seconds: float = 0.65) -> int:
    """
    Return count of overtime periods (0 if regulation or lookup fails).

    Rate-limited: sleeps `delay_seconds` before each HTTP call.
    """
    time.sleep(delay_seconds)
    gid = str(game_id).strip().zfill(10)
    try:
        from nba_api.stats.endpoints import boxscoresummaryv2

        bs = boxscoresummaryv2.BoxScoreSummaryV2(game_id=gid, timeout=90)
        for df in bs.get_data_frames():
            if df is None or df.empty:
                continue
            # Game summary row often includes PERIOD = last period played
            for col in df.columns:
                if str(col).upper() == "PERIOD":
                    raw = df.iloc[0][col]
                    if raw is None:
                        continue
                    try:
                        period = int(float(raw))
                    except (TypeError, ValueError):
                        continue
                    return max(0, period - 4)
    except Exception as exc:
        print(f"      [OT] {gid}: {exc}")
    return 0
