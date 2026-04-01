/**
 * Season-accurate display branding for NBA teams whose identity changed over time.
 * DB `teams` rows use current abbreviations; this maps (abbrev, season) → labels + logos.
 */

import { NBA_TEAM_IDS } from "@/lib/nba-team-ids";
import { parseSeasonStartYear } from "@/lib/nba-season";

export interface TeamBranding {
  abbreviation: string;
  name: string;
  city: string;
  logoUrl: string;
}

function espnLogo(displayAbbr: string): string {
  return `https://a.espncdn.com/i/teamlogos/nba/500/${displayAbbr.toLowerCase()}.png`;
}

function nbaSvgLogo(currentAbbrev: string): string {
  const id = NBA_TEAM_IDS[currentAbbrev];
  if (id === undefined) {
    return espnLogo(currentAbbrev);
  }
  return `https://cdn.nba.com/logos/nba/${id}/global/L/logo.svg`;
}

/** Current-era defaults when no historical rule applies (abbrev = DB / canonical). */
const CURRENT_TEAM_DEFAULTS: Record<string, { name: string; city: string }> = {
  ATL: { name: "Hawks", city: "Atlanta" },
  BOS: { name: "Celtics", city: "Boston" },
  BKN: { name: "Nets", city: "Brooklyn" },
  CHA: { name: "Hornets", city: "Charlotte" },
  CHI: { name: "Bulls", city: "Chicago" },
  CLE: { name: "Cavaliers", city: "Cleveland" },
  DAL: { name: "Mavericks", city: "Dallas" },
  DEN: { name: "Nuggets", city: "Denver" },
  DET: { name: "Pistons", city: "Detroit" },
  GSW: { name: "Warriors", city: "Golden State" },
  HOU: { name: "Rockets", city: "Houston" },
  IND: { name: "Pacers", city: "Indiana" },
  LAC: { name: "Clippers", city: "LA" },
  LAL: { name: "Lakers", city: "Los Angeles" },
  MEM: { name: "Grizzlies", city: "Memphis" },
  MIA: { name: "Heat", city: "Miami" },
  MIL: { name: "Bucks", city: "Milwaukee" },
  MIN: { name: "Timberwolves", city: "Minnesota" },
  NOP: { name: "Pelicans", city: "New Orleans" },
  NYK: { name: "Knicks", city: "New York" },
  OKC: { name: "Thunder", city: "Oklahoma City" },
  ORL: { name: "Magic", city: "Orlando" },
  PHI: { name: "76ers", city: "Philadelphia" },
  PHX: { name: "Suns", city: "Phoenix" },
  POR: { name: "Trail Blazers", city: "Portland" },
  SAC: { name: "Kings", city: "Sacramento" },
  SAS: { name: "Spurs", city: "San Antonio" },
  TOR: { name: "Raptors", city: "Toronto" },
  UTA: { name: "Jazz", city: "Utah" },
  WAS: { name: "Wizards", city: "Washington" },
};

function currentBranding(
  abbrev: string,
  fallback?: { name: string; city: string }
): TeamBranding {
  const defaults = CURRENT_TEAM_DEFAULTS[abbrev];
  const name = fallback?.name ?? defaults?.name ?? abbrev;
  const city = fallback?.city ?? defaults?.city ?? "";
  return {
    abbreviation: abbrev,
    name,
    city,
    logoUrl: nbaSvgLogo(abbrev),
  };
}

/**
 * Returns display abbreviation, name, city, and logo for `currentAbbreviation` in `season`
 * (e.g. `"2005-06"`). Uses historical labels where the franchise rebranded or relocated;
 * otherwise current branding. Optional `fallback` overrides name/city for the current-era path only.
 *
 * Historical logos use ESPN PNGs; current logos use the NBA CDN SVG for the canonical abbrev.
 */
export function getTeamBranding(
  currentAbbreviation: string,
  season: string,
  fallback?: { name: string; city: string }
): TeamBranding {
  const abbr = currentAbbreviation.trim().toUpperCase();
  const startYear = parseSeasonStartYear(season);

  // New Jersey Nets → Brooklyn (2012-13+)
  if (abbr === "BKN" && startYear >= 1985 && startYear <= 2011) {
    return {
      abbreviation: "NJN",
      name: "Nets",
      city: "New Jersey",
      logoUrl: espnLogo("NJN"),
    };
  }

  // Seattle SuperSonics → Oklahoma City (2008-09+)
  if (abbr === "OKC" && startYear >= 1985 && startYear <= 2007) {
    return {
      abbreviation: "SEA",
      name: "SuperSonics",
      city: "Seattle",
      logoUrl: espnLogo("SEA"),
    };
  }

  // Vancouver Grizzlies → Memphis (2001-02+)
  if (abbr === "MEM" && startYear >= 1995 && startYear <= 2000) {
    return {
      abbreviation: "VAN",
      name: "Grizzlies",
      city: "Vancouver",
      logoUrl: espnLogo("VAN"),
    };
  }

  // New Orleans franchise (NOH / NOK / Pelicans)
  if (abbr === "NOP") {
    if (startYear >= 2002 && startYear <= 2004) {
      return {
        abbreviation: "NOH",
        name: "Hornets",
        city: "New Orleans",
        logoUrl: espnLogo("NOH"),
      };
    }
    if (startYear >= 2005 && startYear <= 2006) {
      return {
        abbreviation: "NOK",
        name: "Hornets",
        city: "New Orleans/OKC",
        logoUrl: espnLogo("NOK"),
      };
    }
    if (startYear >= 2007 && startYear <= 2012) {
      return {
        abbreviation: "NOH",
        name: "Hornets",
        city: "New Orleans",
        logoUrl: espnLogo("NOH"),
      };
    }
  }

  // Charlotte Bobcats → Hornets (2014-15+)
  if (abbr === "CHA" && startYear >= 2004 && startYear <= 2013) {
    return {
      abbreviation: "CHA",
      name: "Bobcats",
      city: "Charlotte",
      logoUrl: espnLogo("CHA"),
    };
  }

  // Washington Bullets → Wizards (1997-98+)
  if (abbr === "WAS" && startYear >= 1985 && startYear <= 1996) {
    return {
      abbreviation: "WSB",
      name: "Bullets",
      city: "Washington",
      logoUrl: espnLogo("WSB"),
    };
  }

  return currentBranding(abbr, fallback);
}
