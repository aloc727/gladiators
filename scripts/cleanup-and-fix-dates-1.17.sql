-- Gladiators v1.17: Keep only war_participants 1895-1902 + current week (Season 129 Week 3).
-- Fix war_weeks dates: Season 129 Week 3 = Mar 5-9 (end Mon Mar 9 04:30 CT), Week 2 = Feb 26-Mar 2, Week 1 = Feb 19-23.
-- Run on EC2: psql -U gladiators_user -d gladiators -h localhost -f scripts/cleanup-and-fix-dates-1.17.sql

-- 1) Keep only: participant ids 1895-1902, and any participant in the current week (Mar 5-9, Season 129 Week 3).
--    Delete all other war_participants.
DELETE FROM war_participants
WHERE id NOT IN (1895, 1896, 1897, 1898, 1899, 1900, 1901, 1902)
  AND war_week_id NOT IN (
    SELECT id FROM war_weeks
    WHERE end_date >= '2025-03-09 09:00:00+00'::timestamptz
      AND end_date <= '2025-03-09 10:00:00+00'::timestamptz
  );

-- 2) Update war_weeks to correct Season 129 dates (Week 1, 2, 3).
-- Week 1: end Feb 23 04:30 CT = 10:30 UTC
UPDATE war_weeks SET season_id = 129, section_index = 0, period_index = 1,
  start_date = '2025-02-19 10:30:00+00'::timestamptz, end_date = '2025-02-23 10:30:00+00'::timestamptz,
  data_source = COALESCE(data_source, 'riverrace')
WHERE end_date >= '2025-02-23 10:00:00+00' AND end_date <= '2025-02-23 11:00:00+00';

-- Week 2: end Mar 2 04:30 CT = 10:30 UTC
UPDATE war_weeks SET season_id = 129, section_index = 0, period_index = 2,
  start_date = '2025-02-26 10:30:00+00'::timestamptz, end_date = '2025-03-02 10:30:00+00'::timestamptz,
  data_source = COALESCE(data_source, 'riverrace')
WHERE end_date >= '2025-03-02 10:00:00+00' AND end_date <= '2025-03-02 11:00:00+00';

-- Week 3 (current): end Mar 9 04:30 CT = 09:30 UTC (CDT)
UPDATE war_weeks SET season_id = 129, section_index = 0, period_index = 3,
  start_date = '2025-03-05 09:30:00+00'::timestamptz, end_date = '2025-03-09 09:30:00+00'::timestamptz,
  data_source = COALESCE(data_source, 'riverrace')
WHERE end_date >= '2025-03-09 09:00:00+00' AND end_date <= '2025-03-09 10:00:00+00';

-- 3) Remove war_weeks that have no participants
DELETE FROM war_weeks WHERE id NOT IN (SELECT war_week_id FROM war_participants);
