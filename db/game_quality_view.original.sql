-- ROLLBACK COPY — the original `game_quality` view as it existed before the
-- era-aware fix (2026-06-03). Restore with this exact DDL if needed.
--
-- Bug: the 9-category pairwise round-robin always compares steals/blocks/
-- turnovers/fg3_made, even in eras where the NBA didn't record them. Pre-1974
-- STL/BLK, pre-1978 TOV, and pre-1980 3PM are zero or fabricated upstream, so
-- old-era player-games are ranked on stats that didn't exist — biasing their
-- Game Quality downward (e.g. Oscar Robertson 1962 dinged for phantom turnovers).
-- See db/game_quality_view.sql for the era-aware replacement.

CREATE OR REPLACE VIEW game_quality AS
WITH cte_schedule AS (
  SELECT CAST(yearweek(CAST(timezone('America/New_York', timezone('UTC', game_date)) AS DATE)) AS INTEGER) AS week_id,
         game_id
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
         s.week_id
    FROM nba_box_scores_v2.main.box_scores AS bs
    INNER JOIN cte_schedule AS s ON bs.game_id = s.game_id
   WHERE bs.period = 'FullGame'
     AND CAST(main."substring"(bs."minutes", 1, (instr(bs."minutes", ':') - 1)) AS INTEGER) >= 15
   ORDER BY week_id, entity_id
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
  (SELECT base.*,
          CAST(sum(CAST(((
            (CAST((base.fg_v > comp.fg_v) AS INTEGER)
             + CAST((base.ft_v > comp.ft_v) AS INTEGER)
             + CAST((base.fg3_made > comp.fg3_made) AS INTEGER)
             + CAST((base.points > comp.points) AS INTEGER)
             + CAST((base.rebounds > comp.rebounds) AS INTEGER)
             + CAST((base.assists > comp.assists) AS INTEGER)
             + CAST((base.steals > comp.steals) AS INTEGER)
             + CAST((base.blocks > comp.blocks) AS INTEGER)
             + CAST((base.turnovers < comp.turnovers) AS INTEGER))
            + ((CAST((base.fg_v = comp.fg_v) AS INTEGER)
             + CAST((base.ft_v = comp.ft_v) AS INTEGER)
             + CAST((base.fg3_made = comp.fg3_made) AS INTEGER)
             + CAST((base.points = comp.points) AS INTEGER)
             + CAST((base.rebounds = comp.rebounds) AS INTEGER)
             + CAST((base.assists = comp.assists) AS INTEGER)
             + CAST((base.steals = comp.steals) AS INTEGER)
             + CAST((base.blocks = comp.blocks) AS INTEGER)
             + CAST((base.turnovers = comp.turnovers) AS INTEGER)) * 0.5)
          ) > 4.5) AS INTEGER)) AS INTEGER) AS wins,
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
