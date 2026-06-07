// Era pace adjustment for the usage penalty.
//
// A player's box "possessions" (fga + 0.44·fta + tov) scale with league PACE,
// which has swung enormously: ~131 team possessions/game in 1962 (Wilt's era) and
// ~141 in the late '50s, vs ~105–112 in the modern era. The usage penalty compares
// a five's combined possessions to a fixed budget, so high-pace-era stars (e.g.
// Wilt's 39-FGA seasons) blow the budget and become impossible to fit — not because
// they hogged their team's offense, but because EVERYONE shot more that year.
//
// Fix: normalize each player's possessions to a reference pace. paceAdj(season) =
// REF_PACE / leaguePace(season), clamped, so usage is judged as a SHARE of the
// era's possessions, not an absolute count. Modern players land near 1.0 (≈ no
// change); high-pace-era players are scaled down so they fit fairly.
//
// PACE_BY_SEASON is the real league average of SUM(fga + 0.44·fta + tov) per
// team-game (Regular Season, FullGame box rows) from nba_box_scores_v2 — the SAME
// possession formula lib/scoring.ts uses for the budget, so the units match.
// season_year is the season's STARTING year (1979 = 1979-80).

// Reference = the 2000s–2010s pace plateau (~105.5, the value at 2010), the most
// "neutral" modern baseline. Seasons near it land ≈ 1.0; only the high-pace eras
// (1950s–1970s) get a meaningful pull-down.
export const REF_PACE = 105.5;

// Bound the adjustment so no era is treated wildly: at most a ~22% pull-down for
// the fastest eras, a small bump for any slower-than-reference year.
const PACE_ADJ_MIN = 0.78;
const PACE_ADJ_MAX = 1.08;

// Real league pace by season (team possessions/game). Pre-1951 seasons had too few
// games to be reliable and effectively no indexed players, so they fall back to the
// nearest available year via the clamp below.
export const PACE_BY_SEASON: Readonly<Record<number, number>> = {
  1951: 123.2, 1952: 122.6, 1953: 117.8, 1954: 117.7, 1955: 134.5, 1956: 132.4,
  1957: 138.6, 1958: 141.5, 1959: 107.3, 1960: 105.5, 1961: 105.5, 1962: 131.3,
  1963: 125.0, 1964: 121.3, 1965: 118.8, 1966: 111.2, 1967: 130.0, 1968: 125.5,
  1969: 128.7, 1970: 125.4, 1971: 121.7, 1972: 118.7, 1973: 117.5, 1974: 116.5,
  1975: 116.6, 1976: 117.4, 1977: 114.2, 1978: 115.6, 1979: 113.9, 1980: 113.4,
  1981: 110.2, 1982: 117.8, 1983: 119.1, 1984: 119.1, 1985: 119.4, 1986: 118.9,
  1987: 117.0, 1988: 118.5, 1989: 115.3, 1990: 115.1, 1991: 114.2, 1992: 113.5,
  1993: 111.6, 1994: 108.8, 1995: 107.1, 1996: 105.5, 1997: 106.1, 1998: 104.2,
  1999: 108.1, 2000: 105.9, 2001: 105.6, 2002: 105.8, 2003: 104.7, 2004: 105.7,
  2005: 104.3, 2006: 105.7, 2007: 106.0, 2008: 105.2, 2009: 106.1, 2010: 105.5,
  2011: 105.3, 2012: 105.7, 2013: 107.4, 2014: 107.3, 2015: 108.6, 2016: 109.0,
  2017: 109.3, 2018: 112.9, 2019: 112.9, 2020: 111.2, 2021: 110.8, 2022: 112.1,
  2023: 111.4, 2024: 112.3, 2025: 113.2,
};

const SEASONS = Object.keys(PACE_BY_SEASON).map(Number);
const MIN_SEASON = Math.min(...SEASONS);
const MAX_SEASON = Math.max(...SEASONS);

/** League pace for a season, snapping out-of-range years to the nearest covered one. */
export function leaguePace(season: number): number {
  const s = season <= MIN_SEASON ? MIN_SEASON : season >= MAX_SEASON ? MAX_SEASON : season;
  // Every season in [MIN, MAX] is present; if a gap ever appears, fall back to REF.
  return PACE_BY_SEASON[s] ?? REF_PACE;
}

/**
 * Multiplier applied to a player's box possessions so usage is era-relative:
 * REF_PACE / leaguePace(season), clamped to [PACE_ADJ_MIN, PACE_ADJ_MAX]. A value
 * below 1 pulls a fast-era player's possessions down (they fit more easily); above
 * 1 nudges a slow-era player up. Modern seasons land ≈ 1.0.
 */
export function paceAdj(season: number): number {
  if (!Number.isFinite(season) || season <= 0) return 1;
  const f = REF_PACE / leaguePace(season);
  return Math.max(PACE_ADJ_MIN, Math.min(PACE_ADJ_MAX, f));
}
