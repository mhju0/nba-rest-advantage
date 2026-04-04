import { describe, expect, it } from "vitest";
import {
  calculateFatigue,
  calculateRestAdvantage,
  type RecentGame,
} from "@/lib/fatigue";
import { haversineDistance } from "@/lib/haversine";

/** Lakers home (approx STAPLES / Crypto.com arena). */
const LA_LAT = 34.043;
const LA_LON = -118.267;

/** Madison Square Garden area. */
const NYC_LAT = 40.7505;
const NYC_LON = -73.9934;

/** Ball Arena (Denver). */
const DEN_LAT = 39.7487;
const DEN_LON = -105.0077;

/** TD Garden area. */
const BOS_LAT = 42.3662;
const BOS_LON = -71.0621;

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

/** Subject team is LAL at home (venue = Crypto.com). */
function fatigueHomeTeam(
  gameDate: string,
  recent: RecentGame[],
  isVisitingAltitude = false
) {
  return calculateFatigue(
    gameDate,
    recent,
    isVisitingAltitude,
    LA_LAT,
    LA_LON,
    LA_LAT,
    LA_LON,
    true
  );
}

/** Subject team is LAL on the road at `venueLat` / `venueLon`. */
function fatigueAwayTeam(
  gameDate: string,
  recent: RecentGame[],
  isVisitingAltitude: boolean,
  venueLat: number,
  venueLon: number
) {
  return calculateFatigue(
    gameDate,
    recent,
    isVisitingAltitude,
    LA_LAT,
    LA_LON,
    venueLat,
    venueLon,
    false
  );
}

describe("calculateFatigue", () => {
  it("season opener (no recent games) → fully rested baseline", () => {
    const result = fatigueHomeTeam("2025-10-22", []);

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

    const result = fatigueHomeTeam("2025-01-08", recent);

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

    const consecutive = fatigueHomeTeam("2025-01-06", recent);
    const spaced = fatigueHomeTeam("2025-01-07", recent);

    expect(consecutive.isBackToBack).toBe(true);
    expect(spaced.isBackToBack).toBe(false);
    expect(consecutive.score - spaced.score).toBeGreaterThanOrEqual(2);
    expect(consecutive.score - spaced.score).toBeLessThanOrEqual(5);
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

    const stacked = fatigueHomeTeam("2025-06-04", threeInFour);
    const light = fatigueHomeTeam("2025-06-04", singleBeforeFourth);

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

    const busyResult = fatigueHomeTeam("2025-03-08", busy);
    const lightResult = fatigueHomeTeam("2025-03-08", light);

    expect(busyResult.densityMultiplier).toBeGreaterThan(1);
    expect(busyResult.score).toBeGreaterThan(lightResult.score + 1);
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

    const homeStay = fatigueHomeTeam("2025-02-12", homeOnly);
    const traveled = fatigueHomeTeam("2025-02-12", coastToCoast);

    expect(traveled.travelDistanceMiles).toBeGreaterThan(1000);
    expect(traveled.score).toBeGreaterThan(homeStay.score + 0.8);
  });

  it("road trip streak is consecutive away games plus tonight when the team is away", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-01-01",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
      baseRecent({
        date: "2025-01-03",
        isHome: false,
        opponentLat: BOS_LAT,
        opponentLon: BOS_LON,
      }),
    ];
    const thirdStraightRoad = fatigueAwayTeam(
      "2025-01-05",
      recent,
      false,
      DEN_LAT,
      DEN_LON
    );
    expect(thirdStraightRoad.roadTripConsecutiveAway).toBe(3);
  });

  it("visiting altitude (away at Denver) applies altitude multiplier (~+1–2 pts vs flat venue)", () => {
    const recent: RecentGame[] = [
      baseRecent({ date: "2025-04-05", isHome: true }),
    ];

    const flat = fatigueHomeTeam("2025-04-07", recent);
    const altitude = fatigueAwayTeam("2025-04-07", recent, true, DEN_LAT, DEN_LON);

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

    const flatNoB2b = fatigueAwayTeam(
      "2025-11-12",
      recent,
      false,
      LA_LAT,
      LA_LON
    );

    const stacked = fatigueAwayTeam(
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
    const noOt = fatigueHomeTeam("2025-01-03", [
      baseRecent({ date: "2025-01-02", overtimePeriods: 0 }),
    ]);
    const oneOt = fatigueHomeTeam("2025-01-03", [
      baseRecent({ date: "2025-01-02", overtimePeriods: 1 }),
    ]);
    expect(oneOt.overtimeFatigueBonus).toBe(0.5);
    expect(oneOt.isOvertimePenalty).toBe(true);
    expect(oneOt.score - noOt.score).toBeCloseTo(0.5, 5);
  });

  it("adds +1.0 when the prior game went to double overtime or more", () => {
    const oneOt = fatigueHomeTeam("2025-01-03", [
      baseRecent({ date: "2025-01-02", overtimePeriods: 1 }),
    ]);
    const twoOt = fatigueHomeTeam("2025-01-03", [
      baseRecent({ date: "2025-01-02", overtimePeriods: 2 }),
    ]);
    expect(twoOt.overtimeFatigueBonus).toBe(1);
    expect(twoOt.score - oneOt.score).toBeCloseTo(0.5, 5);
  });

  it("travel miles use a 7-day window (older inter-game legs are excluded)", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-01-01",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
      baseRecent({
        date: "2025-01-02",
        isHome: false,
        opponentLat: BOS_LAT,
        opponentLon: BOS_LON,
      }),
    ];
    const r = fatigueHomeTeam("2025-02-01", recent);
    // No prior game in the 7-day window before Feb 1 → only Boston → LA (home), not LA–NYC–BOS–LA.
    expect(r.travelDistanceMiles).toBeGreaterThan(2200);
    expect(r.travelDistanceMiles).toBeLessThan(3800);
  });

  it("away → away uses direct arena legs regardless of rest days (no phantom home round trip)", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-01-01",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
    ];

    const oneDayGap = fatigueAwayTeam("2025-01-02", recent, false, BOS_LAT, BOS_LON);
    const multiDayGap = fatigueAwayTeam("2025-01-04", recent, false, BOS_LAT, BOS_LON);

    expect(multiDayGap.travelDistanceMiles).toBe(oneDayGap.travelDistanceMiles);
  });

  it("travel: previous HOME → current AWAY is home arena → road arena (one leg)", () => {
    const recent = [baseRecent({ date: "2025-01-10", isHome: true })];
    const r = fatigueAwayTeam("2025-01-12", recent, false, DEN_LAT, DEN_LON);
    const expected = Math.round(haversineDistance(LA_LAT, LA_LON, DEN_LAT, DEN_LON));
    expect(r.travelDistanceMiles).toBe(expected);
  });

  it("travel: previous AWAY → current AWAY is prev road arena → next road arena (no home detour)", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-01-01",
        isHome: false,
        opponentLat: NYC_LAT,
        opponentLon: NYC_LON,
      }),
    ];
    // Prior game falls outside 7-day window → single inter-game leg NYC → Boston only.
    const r = fatigueAwayTeam("2025-01-25", recent, false, BOS_LAT, BOS_LON);
    const expected = Math.round(haversineDistance(NYC_LAT, NYC_LON, BOS_LAT, BOS_LON));
    expect(r.travelDistanceMiles).toBe(expected);
  });

  it("travel: previous AWAY → current HOME is road arena → home arena (one leg)", () => {
    const recent: RecentGame[] = [
      baseRecent({
        date: "2025-01-01",
        isHome: false,
        opponentLat: BOS_LAT,
        opponentLon: BOS_LON,
      }),
    ];
    const r = fatigueHomeTeam("2025-01-20", recent);
    const expected = Math.round(haversineDistance(BOS_LAT, BOS_LON, LA_LAT, LA_LON));
    expect(r.travelDistanceMiles).toBe(expected);
  });

  it("travel: previous HOME → current HOME is 0 between games (home stand)", () => {
    const recent: RecentGame[] = [
      baseRecent({ date: "2025-01-10", isHome: true }),
      baseRecent({ date: "2025-01-12", isHome: true }),
    ];
    const r = fatigueHomeTeam("2025-01-14", recent);
    expect(r.travelDistanceMiles).toBe(0);
  });
});

describe("calculateRestAdvantage", () => {
  it("positive when away team is more fatigued (home rested advantage)", () => {
    const home = fatigueHomeTeam("2025-01-10", []);
    const awayHeavy = fatigueAwayTeam(
      "2025-01-10",
      [baseRecent({ date: "2025-01-09", isHome: true })],
      false,
      LA_LAT,
      LA_LON
    );

    expect(calculateRestAdvantage(home, awayHeavy)).toBeGreaterThan(0);
  });

  it("negative when home team is more fatigued", () => {
    const homeHeavy = fatigueHomeTeam("2025-01-10", [
      baseRecent({ date: "2025-01-09", isHome: true }),
    ]);
    const away = fatigueAwayTeam("2025-01-10", [], false, LA_LAT, LA_LON);

    expect(calculateRestAdvantage(homeHeavy, away)).toBeLessThan(0);
  });
});
