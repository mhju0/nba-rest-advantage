/**
 * Maps team abbreviations (as stored in our database) to the official
 * NBA team IDs used by the NBA CDN for logo assets.
 *
 * Logo URL pattern:
 *   https://cdn.nba.com/logos/nba/{nbaId}/global/L/logo.svg
 */
export const NBA_TEAM_IDS: Record<string, number> = {
  ATL: 1610612737,
  BOS: 1610612738,
  BKN: 1610612751,
  /** Historical: New Jersey Nets (same franchise ID as BKN). */
  NJN: 1610612751,
  CHA: 1610612766,
  CHI: 1610612741,
  CLE: 1610612739,
  DAL: 1610612742,
  DEN: 1610612743,
  DET: 1610612765,
  GSW: 1610612744,
  HOU: 1610612745,
  IND: 1610612754,
  LAC: 1610612746,
  LAL: 1610612747,
  MEM: 1610612763,
  /** Historical: Vancouver Grizzlies (same franchise ID as MEM). */
  VAN: 1610612763,
  MIA: 1610612748,
  MIL: 1610612749,
  MIN: 1610612750,
  NOP: 1610612740,
  /** Historical: New Orleans Hornets (same franchise ID as NOP). */
  NOH: 1610612740,
  /** Historical: New Orleans/Oklahoma City Hornets. */
  NOK: 1610612740,
  NYK: 1610612752,
  OKC: 1610612760,
  /** Historical: Seattle SuperSonics (same franchise ID as OKC). */
  SEA: 1610612760,
  ORL: 1610612753,
  PHI: 1610612755,
  PHX: 1610612756,
  POR: 1610612757,
  SAC: 1610612758,
  SAS: 1610612759,
  TOR: 1610612761,
  UTA: 1610612762,
  WAS: 1610612764,
  /** Historical: Washington Bullets (same franchise ID as WAS). */
  WSB: 1610612764,
}
