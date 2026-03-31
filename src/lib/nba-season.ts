import { endOfMonth, format, startOfMonth } from "date-fns";

/** Seasons present in the seeded DB (2019-20 bubble omitted). */
export const NBA_SEASONS = [
  "2015-16",
  "2016-17",
  "2017-18",
  "2018-19",
  "2020-21",
  "2021-22",
  "2022-23",
  "2023-24",
  "2024-25",
  "2025-26",
] as const;

export type NbaSeasonLabel = (typeof NBA_SEASONS)[number];

/** Regular-season calendar months (Oct–Apr) in tab order. */
export const NBA_REGULAR_MONTHS: readonly { value: number; label: string }[] = [
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
] as const;

const SEASON_RE = /^(\d{4})-\d{2}$/;

/**
 * First calendar year of an NBA season label (e.g. "2024-25" → 2024).
 */
export function parseSeasonStartYear(season: string): number {
  const m = season.match(SEASON_RE);
  if (!m) {
    throw new Error(`Invalid season label: ${season}`);
  }
  return parseInt(m[1], 10);
}

/**
 * Regular season spans Oct 1 (start year) through Apr 30 (start year + 1).
 */
export function regularSeasonDateBounds(season: string): { from: string; to: string } {
  const y = parseSeasonStartYear(season);
  return { from: `${y}-10-01`, to: `${y + 1}-04-30` };
}

/**
 * Calendar year for a month tab within an NBA season (Oct–Dec → start year; Jan–Apr → start+1).
 */
export function calendarYearForSeasonMonth(season: string, month: number): number {
  const y = parseSeasonStartYear(season);
  if (month >= 10) return y;
  return y + 1;
}

/** First and last calendar dates for a month in season context. */
export function monthCalendarBounds(season: string, month: number): { from: string; to: string } {
  const year = calendarYearForSeasonMonth(season, month);
  const anchor = new Date(year, month - 1, 1);
  return {
    from: format(startOfMonth(anchor), "yyyy-MM-dd"),
    to: format(endOfMonth(anchor), "yyyy-MM-dd"),
  };
}

/** Intersection of two inclusive YYYY-MM-DD ranges; null if empty. */
export function intersectDateBounds(
  a: { from: string; to: string },
  b: { from: string; to: string }
): { from: string; to: string } | null {
  const from = a.from > b.from ? a.from : b.from;
  const to = a.to < b.to ? a.to : b.to;
  if (from > to) return null;
  return { from, to };
}

/** Default month tab: current month if Oct–Apr, else October (off-season). */
export function defaultNbaCalendarMonth(): number {
  const m = new Date().getMonth() + 1;
  if (NBA_REGULAR_MONTHS.some((x) => x.value === m)) return m;
  return 10;
}

export function defaultNbaSeason(): NbaSeasonLabel {
  return NBA_SEASONS[NBA_SEASONS.length - 1];
}
