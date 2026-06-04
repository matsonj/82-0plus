-- Era-aware `game_quality` view (source of truth — committed here; lives in
-- MotherDuck nba_box_scores_v2.main). Apply with MotherDuck query_rw.
--
-- Game Quality = within-week round-robin win rate: each player-game (>=15 min)
-- scores 1 per weekly peer it beats across the box-score categories (ties 0.5),
-- and "wins" a matchup if it takes a strict majority. game_quality = wins/gm_count.
--
-- FIX vs the original: the NBA didn't record every stat in every era, and the
-- upstream box scores carry zero/fabricated values for the untracked ones. So
-- the comparison now only counts categories that were officially tracked that
-- season (per the `legacy_stat_availability` view), and the majority threshold
-- scales to the live-category count:
--     1946-1972  PTS,REB,AST,FG,FT only          -> 5 categories, win > 2.5
--     1973-1976  +STL,BLK                         -> 7 categories, win > 3.5
--     1977-1978  +TOV                             -> 8 categories, win > 4.0
--     1979+      +3PT (all)                        -> 9 categories, win > 4.5
-- season_year is the season's STARTING year (1979 = 1979-80, first 3PT season),
-- which matches legacy_stat_availability.from_year. This removes the structural
-- penalty old-era greats carried (e.g. Oscar 1962 +0.10, Wilt 1962 +0.15) while
-- leaving already-correct ratings essentially unchanged (Kareem 1972/1977 ~0.00).

CREATE OR REPLACE VIEW game_quality AS
WITH cte_schedule AS (
  SELECT CAST(yearweek(CAST(timezone('America/New_York', timezone('UTC', game_date)) AS DATE)) AS INTEGER) AS week_id,
         game_id,
         season_year
    FROM nba_box_scores_v2.main.schedule
),
cte_box_score_cnt AS (
  SELECT s.week_id, count_star() AS gm_count
    FROM nba_box_scores_v2.main.box_scores AS bs
    INNER JOIN cte_schedule AS s ON bs.game_id = s.game_id
   WHERE bs.period = 'FullGame'
     AND CAST(main."substring"(bs."minutes", 1, (instr(bs."minutes", ':') - 1)) AS INTEGER) >= 15
   GROUP BY ALL
),
cte_prep AS (
  SELECT bs.game_id, bs.entity_id, bs.player_name,
         CASE WHEN bs.fg_attempted > 0 THEN round(CAST(bs.fg_made AS DOUBLE) / bs.fg_attempted, 3) ELSE 0 END AS fg_pct,
         CASE WHEN bs.ft_attempted > 0 THEN round(CAST(bs.ft_made AS DOUBLE) / bs.ft_attempted, 3) ELSE 0 END AS ft_pct,
         round((fg_pct - 0.47) * bs.fg_attempted, 2) AS fg_v,
         round((ft_pct - 0.80) * bs.ft_attempted, 2) AS ft_v,
         bs.fg3_made, bs.points, bs.rebounds, bs.assists, bs.steals, bs.blocks, bs.turnovers,
         s.week_id,
         -- Era flags: which categories the NBA officially tracked that season.
         -- NULL season_year -> treat as modern (all tracked).
         (COALESCE(s.season_year, 9999) >= 1973) AS has_sb,   -- steals + blocks
         (COALESCE(s.season_year, 9999) >= 1977) AS has_tov,  -- turnovers
         (COALESCE(s.season_year, 9999) >= 1979) AS has_3,    -- made threes
         (5 + 2 * CAST(COALESCE(s.season_year, 9999) >= 1973 AS INTEGER)
              + CAST(COALESCE(s.season_year, 9999) >= 1977 AS INTEGER)
              + CAST(COALESCE(s.season_year, 9999) >= 1979 AS INTEGER)) AS ncat
    FROM nba_box_scores_v2.main.box_scores AS bs
    INNER JOIN cte_schedule AS s ON bs.game_id = s.game_id
   WHERE bs.period = 'FullGame'
     AND CAST(main."substring"(bs."minutes", 1, (instr(bs."minutes", ':') - 1)) AS INTEGER) >= 15
),
cte_missing_games AS (
  SELECT bs.game_id, bs.entity_id, bs.player_name,
         CASE WHEN bs.fg_attempted > 0 THEN round(CAST(bs.fg_made AS DOUBLE) / bs.fg_attempted, 3) ELSE 0 END AS fg_pct,
         CASE WHEN bs.ft_attempted > 0 THEN round(CAST(bs.ft_made AS DOUBLE) / bs.ft_attempted, 3) ELSE 0 END AS ft_pct,
         round((fg_pct - 0.47) * bs.fg_attempted, 2) AS fg_v,
         round((ft_pct - 0.80) * bs.ft_attempted, 2) AS ft_v,
         bs.fg3_made, bs.points, bs.rebounds, bs.assists, bs.steals, bs.blocks, bs.turnovers,
         s.week_id
    FROM nba_box_scores_v2.main.box_scores AS bs
    INNER JOIN cte_schedule AS s ON bs.game_id = s.game_id
   WHERE bs.period = 'FullGame'
     AND CAST(main."substring"(bs."minutes", 1, (instr(bs."minutes", ':') - 1)) AS INTEGER) < 15
),
cte_final AS (
  -- Era-aware round-robin: only count categories tracked in `base`'s season
  -- (base and comp share a week, so the same era). Threshold = ncat / 2.
  (SELECT base.* EXCLUDE (has_sb, has_tov, has_3, ncat),
          CAST(sum(CAST(((
            (CAST((base.fg_v > comp.fg_v) AS INTEGER)
             + CAST((base.ft_v > comp.ft_v) AS INTEGER)
             + CAST((base.points > comp.points) AS INTEGER)
             + CAST((base.rebounds > comp.rebounds) AS INTEGER)
             + CAST((base.assists > comp.assists) AS INTEGER)
             + CASE WHEN base.has_3  THEN CAST((base.fg3_made > comp.fg3_made) AS INTEGER) ELSE 0 END
             + CASE WHEN base.has_sb THEN CAST((base.steals > comp.steals) AS INTEGER)
                                          + CAST((base.blocks > comp.blocks) AS INTEGER) ELSE 0 END
             + CASE WHEN base.has_tov THEN CAST((base.turnovers < comp.turnovers) AS INTEGER) ELSE 0 END)
            + ((CAST((base.fg_v = comp.fg_v) AS INTEGER)
             + CAST((base.ft_v = comp.ft_v) AS INTEGER)
             + CAST((base.points = comp.points) AS INTEGER)
             + CAST((base.rebounds = comp.rebounds) AS INTEGER)
             + CAST((base.assists = comp.assists) AS INTEGER)
             + CASE WHEN base.has_3  THEN CAST((base.fg3_made = comp.fg3_made) AS INTEGER) ELSE 0 END
             + CASE WHEN base.has_sb THEN CAST((base.steals = comp.steals) AS INTEGER)
                                          + CAST((base.blocks = comp.blocks) AS INTEGER) ELSE 0 END
             + CASE WHEN base.has_tov THEN CAST((base.turnovers = comp.turnovers) AS INTEGER) ELSE 0 END) * 0.5)
          ) > base.ncat / 2.0) AS INTEGER)) AS INTEGER) AS wins,
          bsc.gm_count
     FROM cte_prep AS base
     LEFT JOIN cte_prep AS comp ON comp.entity_id != base.entity_id AND comp.week_id = base.week_id
     LEFT JOIN cte_box_score_cnt AS bsc ON bsc.week_id = base.week_id
    GROUP BY ALL)
  UNION ALL
  (SELECT mg.*, -1 AS wins, bsc.gm_count
     FROM cte_missing_games AS mg
     LEFT JOIN cte_box_score_cnt AS bsc ON bsc.week_id = mg.week_id)
)
SELECT *,
       CASE WHEN wins != -1 THEN round(CAST(wins AS DOUBLE) / gm_count, 4) ELSE -1 END AS game_quality
  FROM cte_final;
