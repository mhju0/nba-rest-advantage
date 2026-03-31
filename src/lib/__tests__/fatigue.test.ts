import { describe, expect, it } from "vitest";
import {
  calculateFatigue,
  calculateRestAdvantage,
  type RecentGame,
} from "@/lib/fatigue";

/** Lakers home (approx STAPLES / Crypto.com arena). */
const LA_LAT = 34.043;
const LA_LON = -118.267;

/** Madison Square Garden area. */
const NYC_LAT = 40.7505;
const NYC_LON = -73.9934;

/** Ball Arena (Denver). */
const DEN_LAT = 39.7487;
const DEN_LON = -105.0077;

function baseRecent(overrides: Partial<RecentGame> = {}): RecentGame {
  return {
    date: "2025-01-01",
    teamId: 1,
    opponentTeamId: 2,
    isHome: true,
    teamLat: LA_LAT,
    teamLon: LA_LON,
    opponentLat: LA_LAT,
    opponentLon: LA_LON,
    opponentAltitudeFlag: false,
    overtimePeriods: 0,
    ...overrides,
  };
}

describe("calculateFatigue", () => {
  it("season opener (no recent games) → fully rested baseline", () => {
    const result = calculateFatigue(
      "2025-10-22",
      [],
      false,
      LA_LAT,
      LA_LON
    );

    expect(result.score).toBe(0);
    expect(result.decayLoadScore).toBe(0);
    expect(result.travelLoadScore).toBe(0);
    expect(result.gamesInLast7Days).toBe(0);
    expect(result.daysSinceLastGame).toBeNull();
    expect(result.freshnessBonus).toBe(0);
    expect(result.overtimeFatigueBonus).toBe(0);
    expect(result.isOvertimePenalty).toBe(false);
  });

  it("3+ days since last game applies freshness bonus (about −1 pt or lower)", () => {
    const recent: RecentGame[] = [
      baseRecent({ date: "2025-01-01", isHome: true }),
    ];

    const result = calculateFatigue("2025-01-08", recent, false, LA_LAT, LA_LON);

    expect(result.daysSinceLastGame).toBe(7);
    expect(result.freshnessBonus).toBeLessThanOrEqual(-1);
    expect(result.freshnessBonus).toBeGreaterThanOrEqual(-2);
    expect(result.isBackToBack).toBe(false);
  });

  it("back-to-back adds ~3 fatigue points once base decay load is material", () => {
    const recent: RecentGame[] = [
      baseRecent({ date: "2025-01-03", isHome: true }),
      baseRecent({ date: "2025-01-04", isHome: true }),
      baseRecent({ date: "2025-01-05", isHome: true }),
    ];

    const consecutive = calculateFatigue("2025-01-06", recent, false, LA_LAT, LA_LON);
    const spaced = calculateFatigue("2025-01-07", recent, false, LA_LAT, LA_LON);

    expect(consecutive.isBackToBack).toBe(true);
    expect(spaced.isBackToBack).toBe(false);
    expect(consecutive.score - spaced.score).toBeGreaterThanOrEqual(2.5);
    expect(consecutive.score - spaced.score).toBeLessThanOrEqual(4.5);
  });

  it("third game in four nights (stacked games) adds ~2+ fatigue vs a single front-loaded game", () => {
    const threeInFour: RecentGame[] = [
      baseRecent({ date: "2025-06-01", isHome: true }),
      baseRecent({ date: "2025-06-02", isHome: true }),
      baseRecent({ date: "2025-06-03", isHome: true }),
    ];
    const singleBeforeFourth: RecentGame[] = [
      baseRecent({ date: "2025-06-03", isHome: true }),
    ];

    const stacked = calculateFatigue("2025-06-04", threeInFour, false, LA_LAT, LA_LON);
    const light = calculateFatigue("2025-06-04", singleBeforeFourth, false, LA_LAT, LA_LON);

    expect(stacked.gamesInLast7Days).toBe(3);
    expect(stacked.score).toBeGreaterThan(light.score + 2);
  });

  it("compressed schedule (4 games in 7 days) adds density-driven fatigue vs one game", () => {
    const busy: RecentGame[] = [
      baseRecent({ date: "2025-03-01", isHome: true }),
      baseRecent({ date: "2025-03-03", isHome: true }),
      baseRecent({ date: "2025-03-05", isHome: true }),
      baseRecent({ date: "2025-03-07", isHome: true }),
    ];

    const light: RecentGame[] = [baseRecent({ date: "2025-03-07", isHome: true })];

    const busyResult = calculateFatigue("2025-03-08", busy, false, LA_LAT, LA_LON);
    const lightResult = calculateFatigue("2025-03-08", light, false, LA_LAT, LA_LON);

    expect(busyResult.densityMultiplier).toBeGreaterThan(1);
    expect(busyResult.score).toBeGreaterThan(lightResult.score + 1.5);
  });

  it("long inter-arena travel adds ~1+ fatigue vs same-arena chain", () => {
    const homeOnly: RecentGame[] = [
      baseRecent({
        date: "2025-02-10",
        isHome: true,
        opponentLat: LA_LAT,
        opponentLon: LA_LON,
      }),
    ];

    const coastToCoast: RecentGame[] = [
      baseRecent({
        date: "2025-02-10",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
    ];

    const homeStay = calculateFatigue("2025-02-12", homeOnly, false, LA_LAT, LA_LON);
    const traveled = calculateFatigue("2025-02-12", coastToCoast, false, LA_LAT, LA_LON);

    expect(traveled.travelDistanceMiles).toBeGreaterThan(1000);
    expect(traveled.score).toBeGreaterThan(homeStay.score + 0.8);
  });

  it("visiting altitude (away at Denver) applies altitude multiplier (~+1–2 pts vs flat venue)", () => {
    const recent: RecentGame[] = [
      baseRecent({ date: "2025-04-05", isHome: true }),
    ];

    const flat = calculateFatigue("2025-04-07", recent, false, LA_LAT, LA_LON);
    const altitude = calculateFatigue("2025-04-07", recent, true, DEN_LAT, DEN_LON);

    expect(altitude.altitudeMultiplier).toBe(1.15);
    expect(flat.altitudeMultiplier).toBe(1);
    expect(altitude.score - flat.score).toBeGreaterThanOrEqual(1);
    expect(altitude.score - flat.score).toBeLessThanOrEqual(2.5);
  });

  it("combined: back-to-back + long travel + altitude compounds", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-11-09",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
    ];

    const flatNoB2b = calculateFatigue(
      "2025-11-12",
      recent,
      false,
      LA_LAT,
      LA_LON
    );

    const stacked = calculateFatigue(
      "2025-11-10",
      recent,
      true,
      DEN_LAT,
      DEN_LON
    );

    expect(stacked.isBackToBack).toBe(true);
    expect(stacked.altitudeMultiplier).toBe(1.15);
    expect(stacked.score).toBeGreaterThan(flatNoB2b.score + 3);
  });

  it("adds +0.5 when the prior game went to one overtime", () => {
    const noOt = calculateFatigue(
      "2025-01-03",
      [baseRecent({ date: "2025-01-02", overtimePeriods: 0 })],
      false,
      LA_LAT,
      LA_LON
    );
    const oneOt = calculateFatigue(
      "2025-01-03",
      [baseRecent({ date: "2025-01-02", overtimePeriods: 1 })],
      false,
      LA_LAT,
      LA_LON
    );
    expect(oneOt.overtimeFatigueBonus).toBe(0.5);
    expect(oneOt.isOvertimePenalty).toBe(true);
    expect(oneOt.score - noOt.score).toBeCloseTo(0.5, 5);
  });

  it("adds +1.0 when the prior game went to double overtime or more", () => {
    const oneOt = calculateFatigue(
      "2025-01-03",
      [baseRecent({ date: "2025-01-02", overtimePeriods: 1 })],
      false,
      LA_LAT,
      LA_LON
    );
    const twoOt = calculateFatigue(
      "2025-01-03",
      [baseRecent({ date: "2025-01-02", overtimePeriods: 2 })],
      false,
      LA_LAT,
      LA_LON
    );
    expect(twoOt.overtimeFatigueBonus).toBe(1);
    expect(twoOt.score - oneOt.score).toBeCloseTo(0.5, 5);
  });
});

describe("calculateRestAdvantage", () => {
  it("positive when away team is more fatigued (home rested advantage)", () => {
    const home = calculateFatigue("2025-01-10", [], false, LA_LAT, LA_LON);
    const awayHeavy = calculateFatigue(
      "2025-01-10",
      [baseRecent({ date: "2025-01-09", isHome: true })],
      false,
      LA_LAT,
      LA_LON
    );

    expect(calculateRestAdvantage(home, awayHeavy)).toBeGreaterThan(0);
  });

  it("negative when home team is more fatigued", () => {
    const homeHeavy = calculateFatigue(
      "2025-01-10",
      [baseRecent({ date: "2025-01-09", isHome: true })],
      false,
      LA_LAT,
      LA_LON
    );
    const away = calculateFatigue("2025-01-10", [], false, LA_LAT, LA_LON);

    expect(calculateRestAdvantage(homeHeavy, away)).toBeLessThan(0);
  });
});
