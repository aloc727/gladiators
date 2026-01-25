-- De-duplicate war weeks with ID >= 150
-- Keep only the LAST entry where participants have non-zero points (before they reset to 0)
-- This removes duplicate snapshots captured every 5 minutes

-- Step 1: See what we're working with
SELECT 
    COUNT(*) as total_wars_150_plus,
    COUNT(DISTINCT end_date) as unique_end_dates,
    MIN(id) as min_id,
    MAX(id) as max_id
FROM war_weeks 
WHERE id >= 150;

-- Step 2: Identify which wars have participants with non-zero points vs all zeros
-- For each unique war week, find the last entry where participants have points > 0
WITH war_week_groups AS (
    SELECT 
        COALESCE(season_id::text, 'NULL') as season_id,
        COALESCE(period_index::text, 'NULL') as period_index,
        end_date,
        id,
        -- Calculate total points for this war
        (SELECT COALESCE(SUM(war_points), 0) 
         FROM war_participants 
         WHERE war_week_id = war_weeks.id) as total_points,
        -- Count participants with points > 0
        (SELECT COUNT(*) 
         FROM war_participants 
         WHERE war_week_id = war_weeks.id 
         AND war_points > 0) as participants_with_points
    FROM war_weeks
    WHERE id >= 150
),
ranked_wars AS (
    SELECT 
        *,
        ROW_NUMBER() OVER (
            PARTITION BY season_id, period_index, end_date 
            ORDER BY id DESC
        ) as rn_desc,
        ROW_NUMBER() OVER (
            PARTITION BY season_id, period_index, end_date 
            ORDER BY 
                CASE WHEN participants_with_points > 0 THEN 0 ELSE 1 END,
                id DESC
        ) as rn_by_points
    FROM war_week_groups
)
SELECT 
    season_id,
    period_index,
    end_date,
    COUNT(*) as total_snapshots,
    MAX(CASE WHEN participants_with_points > 0 THEN id END) as last_id_with_points,
    MAX(id) as highest_id,
    MIN(id) as lowest_id,
    ARRAY_AGG(id ORDER BY id) as all_ids,
    ARRAY_AGG(total_points ORDER BY id) as all_totals
FROM ranked_wars
GROUP BY season_id, period_index, end_date
ORDER BY MAX(id) DESC
LIMIT 20;

-- Step 3: Find the war to KEEP for each unique war week
-- Keep the war with the HIGHEST ID where participants still have points > 0 (last snapshot before reset)
-- This means we DELETE:
--   - All earlier snapshots with points (IDs 200, 201, 202... before the last one with points)
--   - All later snapshots with zeros (IDs after the last one with points)
-- If all have 0 points, keep the highest ID anyway
WITH wars_to_keep AS (
    SELECT 
        w.id,
        w.season_id,
        w.period_index,
        w.end_date,
        (SELECT COALESCE(SUM(war_points), 0) 
         FROM war_participants 
         WHERE war_week_id = w.id) as total_points,
        (SELECT COUNT(*) 
         FROM war_participants 
         WHERE war_week_id = w.id 
         AND war_points > 0) as participants_with_points
    FROM war_weeks w
    WHERE w.id >= 150
),
ranked AS (
    SELECT 
        *,
        ROW_NUMBER() OVER (
            PARTITION BY 
                COALESCE(season_id::text, 'NULL'),
                COALESCE(period_index::text, 'NULL'),
                end_date
            ORDER BY 
                CASE WHEN participants_with_points > 0 THEN 0 ELSE 1 END,  -- Wars with points come first
                id DESC  -- Among wars with points, highest ID wins (last snapshot before reset)
        ) as rn
    FROM wars_to_keep
)
SELECT 
    id as war_id_to_keep,
    season_id,
    period_index,
    end_date,
    total_points,
    participants_with_points,
    'KEEPING THIS ONE' as action
FROM ranked
WHERE rn = 1
ORDER BY id DESC;

-- Step 3b: Show which wars will be DELETED (for verification)
WITH wars_to_keep AS (
    SELECT 
        w.id,
        w.season_id,
        w.period_index,
        w.end_date,
        (SELECT COUNT(*) 
         FROM war_participants 
         WHERE war_week_id = w.id 
         AND war_points > 0) as participants_with_points
    FROM war_weeks w
    WHERE w.id >= 150
),
ranked AS (
    SELECT 
        *,
        ROW_NUMBER() OVER (
            PARTITION BY 
                COALESCE(season_id::text, 'NULL'),
                COALESCE(period_index::text, 'NULL'),
                end_date
            ORDER BY 
                CASE WHEN participants_with_points > 0 THEN 0 ELSE 1 END,
                id DESC
        ) as rn
    FROM wars_to_keep
)
SELECT 
    id as war_id_to_delete,
    season_id,
    period_index,
    end_date,
    participants_with_points,
    CASE 
        WHEN participants_with_points > 0 THEN 'EARLIER snapshot with points (will delete)'
        ELSE 'LATER snapshot with zeros (will delete)'
    END as reason
FROM ranked
WHERE rn > 1  -- All except the one we're keeping
ORDER BY id DESC
LIMIT 30;

-- Step 4: Delete participants from wars we're NOT keeping
DELETE FROM war_participants
WHERE war_week_id >= 150
AND war_week_id NOT IN (
    WITH wars_to_keep AS (
        SELECT 
            w.id,
            w.season_id,
            w.period_index,
            w.end_date,
            (SELECT COUNT(*) 
             FROM war_participants 
             WHERE war_week_id = w.id 
             AND war_points > 0) as participants_with_points
        FROM war_weeks w
        WHERE w.id >= 150
    ),
    ranked AS (
        SELECT 
            *,
            ROW_NUMBER() OVER (
                PARTITION BY 
                    COALESCE(season_id::text, 'NULL'),
                    COALESCE(period_index::text, 'NULL'),
                    end_date
                ORDER BY 
                    CASE WHEN participants_with_points > 0 THEN 0 ELSE 1 END,
                    id DESC
            ) as rn
        FROM wars_to_keep
    )
    SELECT id FROM ranked WHERE rn = 1
);

-- Step 5: Delete the duplicate war weeks (keep only the one we identified)
DELETE FROM war_weeks
WHERE id >= 150
AND id NOT IN (
    WITH wars_to_keep AS (
        SELECT 
            w.id,
            w.season_id,
            w.period_index,
            w.end_date,
            (SELECT COUNT(*) 
             FROM war_participants 
             WHERE war_week_id = w.id 
             AND war_points > 0) as participants_with_points
        FROM war_weeks w
        WHERE w.id >= 150
    ),
    ranked AS (
        SELECT 
            *,
            ROW_NUMBER() OVER (
                PARTITION BY 
                    COALESCE(season_id::text, 'NULL'),
                    COALESCE(period_index::text, 'NULL'),
                    end_date
                ORDER BY 
                    CASE WHEN participants_with_points > 0 THEN 0 ELSE 1 END,
                    id DESC
            ) as rn
        FROM wars_to_keep
    )
    SELECT id FROM ranked WHERE rn = 1
);

-- Step 6: Verify results
SELECT 
    COUNT(*) as remaining_wars_150_plus,
    COUNT(DISTINCT end_date) as unique_end_dates,
    MIN(id) as min_id,
    MAX(id) as max_id
FROM war_weeks 
WHERE id >= 150;

-- Step 7: Show the remaining wars (should be unique, one per war week)
SELECT 
    id,
    season_id,
    period_index,
    end_date,
    data_source,
    (SELECT COALESCE(SUM(war_points), 0) 
     FROM war_participants 
     WHERE war_week_id = war_weeks.id) as total_points,
    (SELECT COUNT(*) 
     FROM war_participants 
     WHERE war_week_id = war_weeks.id 
     AND war_points > 0) as participants_with_points
FROM war_weeks 
WHERE id >= 150
ORDER BY id DESC
LIMIT 20;
