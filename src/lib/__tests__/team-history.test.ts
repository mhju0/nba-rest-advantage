import { describe, expect, it } from "vitest";
import { getTeamBranding } from "@/lib/team-history";

describe("getTeamBranding", () => {
  it("OKC in Seattle era → SuperSonics", () => {
    const b = getTeamBranding("OKC", "2005-06");
    expect(b).toEqual({
      abbreviation: "SEA",
      name: "SuperSonics",
      city: "Seattle",
      logoUrl: "https://a.espncdn.com/i/teamlogos/nba/500/sea.png",
    });
  });

  it("OKC in Thunder era → Thunder", () => {
    const b = getTeamBranding("OKC", "2010-11");
    expect(b.abbreviation).toBe("OKC");
    expect(b.name).toBe("Thunder");
    expect(b.city).toBe("Oklahoma City");
    expect(b.logoUrl).toBe(
      "https://cdn.nba.com/logos/nba/1610612760/global/L/logo.svg"
    );
  });

  it("BKN in New Jersey era → NJN", () => {
    const b = getTeamBranding("BKN", "2000-01");
    expect(b).toEqual({
      abbreviation: "NJN",
      name: "Nets",
      city: "New Jersey",
      logoUrl: "https://a.espncdn.com/i/teamlogos/nba/500/njn.png",
    });
  });

  it("BKN in Brooklyn era → Nets", () => {
    const b = getTeamBranding("BKN", "2015-16");
    expect(b.abbreviation).toBe("BKN");
    expect(b.name).toBe("Nets");
    expect(b.city).toBe("Brooklyn");
    expect(b.logoUrl).toBe(
      "https://cdn.nba.com/logos/nba/1610612751/global/L/logo.svg"
    );
  });

  it("MEM in Vancouver era → VAN", () => {
    const b = getTeamBranding("MEM", "1998-99");
    expect(b).toEqual({
      abbreviation: "VAN",
      name: "Grizzlies",
      city: "Vancouver",
      logoUrl: "https://a.espncdn.com/i/teamlogos/nba/500/van.png",
    });
  });

  it("MEM in Memphis era → MEM", () => {
    const b = getTeamBranding("MEM", "2005-06");
    expect(b.abbreviation).toBe("MEM");
    expect(b.name).toBe("Grizzlies");
    expect(b.city).toBe("Memphis");
    expect(b.logoUrl).toBe(
      "https://cdn.nba.com/logos/nba/1610612763/global/L/logo.svg"
    );
  });

  it("CHA in Bobcats era → Bobcats", () => {
    const b = getTeamBranding("CHA", "2010-11");
    expect(b.abbreviation).toBe("CHA");
    expect(b.name).toBe("Bobcats");
    expect(b.city).toBe("Charlotte");
    expect(b.logoUrl).toBe(
      "https://a.espncdn.com/i/teamlogos/nba/500/cha.png"
    );
  });

  it("CHA in Hornets era → Hornets", () => {
    const b = getTeamBranding("CHA", "2020-21");
    expect(b.abbreviation).toBe("CHA");
    expect(b.name).toBe("Hornets");
    expect(b.city).toBe("Charlotte");
    expect(b.logoUrl).toBe(
      "https://cdn.nba.com/logos/nba/1610612766/global/L/logo.svg"
    );
  });

  it("WAS in Bullets era → WSB", () => {
    const b = getTeamBranding("WAS", "1990-91");
    expect(b).toEqual({
      abbreviation: "WSB",
      name: "Bullets",
      city: "Washington",
      logoUrl: "https://a.espncdn.com/i/teamlogos/nba/500/wsb.png",
    });
  });

  it("LAL unchanged → Lakers", () => {
    const b = getTeamBranding("LAL", "2005-06");
    expect(b.abbreviation).toBe("LAL");
    expect(b.name).toBe("Lakers");
    expect(b.city).toBe("Los Angeles");
    expect(b.logoUrl).toBe(
      "https://cdn.nba.com/logos/nba/1610612747/global/L/logo.svg"
    );
  });

  it("optional fallback overrides current-era name and city only", () => {
    const b = getTeamBranding("LAL", "2024-25", {
      name: "Lakers Custom",
      city: "LA",
    });
    expect(b.name).toBe("Lakers Custom");
    expect(b.city).toBe("LA");
    expect(b.logoUrl).toContain("1610612747");
  });

  it("historical branding ignores fallback", () => {
    const b = getTeamBranding("OKC", "2005-06", {
      name: "Wrong",
      city: "Wrong",
    });
    expect(b.name).toBe("SuperSonics");
    expect(b.city).toBe("Seattle");
  });
});
