-- De-duplicate war weeks with ID >= 150
-- Match by start_date AND end_date (same war week)
-- Keep only the LAST entry where ALL participants have > 0 points
-- Delete all others (earlier snapshots with points, and later snapshots with zeros)

-- Step 1: See what we're working with
SELECT 
    COUNT(*) as total_wars_150_plus,
    COUNT(DISTINCT start_date) as unique_start_dates,
    COUNT(DISTINCT end_date) as unique_end_dates,
    COUNT(DISTINCT (start_date, end_date)) as unique_war_weeks,
    MIN(id) as min_id,
    MAX(id) as max_id
FROM war_weeks 
WHERE id >= 150;

-- Step 2: Identify which wars have ALL participants with > 0 points vs any zeros
-- Group by start_date AND end_date to find unique war weeks
WITH war_week_groups AS (
    SELECT 
        w.id,
        w.season_id,
        w.period_index,
        w.start_date,
        w.end_date,
        -- Count total participants
        (SELECT COUNT(*) 
         FROM war_participants 
         WHERE war_week_id = w.id) as total_participants,
        -- Count participants with points > 0
        (SELECT COUNT(*) 
         FROM war_participants 
         WHERE war_week_id = w.id 
         AND war_points > 0) as participants_with_points,
        -- Check if ALL participants have points > 0 (or no participants)
        CASE 
            WHEN (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id) = 0 THEN true
            WHEN (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id AND war_points > 0) = 
                 (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id) THEN true
            ELSE false
        END as all_participants_have_points
    FROM war_weeks w
    WHERE w.id >= 150
)
SELECT 
    start_date,
    end_date,
    COUNT(*) as total_snapshots,
    MAX(CASE WHEN all_participants_have_points THEN id END) as last_id_all_points,
    MAX(id) as highest_id,
    MIN(id) as lowest_id,
    ARRAY_AGG(id ORDER BY id) as all_ids,
    ARRAY_AGG(CASE WHEN all_participants_have_points THEN 'YES' ELSE 'NO' END ORDER BY id) as all_have_points_flags
FROM war_week_groups
GROUP BY start_date, end_date
ORDER BY MAX(id) DESC
LIMIT 30;

-- Step 3: Find the war to KEEP for each unique war week (start_date + end_date)
-- Keep the war with the highest ID where ALL participants still have points > 0
WITH wars_to_keep AS (
    SELECT 
        w.id,
        w.season_id,
        w.period_index,
        w.start_date,
        w.end_date,
        (SELECT COUNT(*) 
         FROM war_participants 
         WHERE war_week_id = w.id) as total_participants,
        (SELECT COUNT(*) 
         FROM war_participants 
         WHERE war_week_id = w.id 
         AND war_points > 0) as participants_with_points,
        -- Check if ALL participants have points > 0
        CASE 
            WHEN (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id) = 0 THEN true
            WHEN (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id AND war_points > 0) = 
                 (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id) THEN true
            ELSE false
        END as all_participants_have_points
    FROM war_weeks w
    WHERE w.id >= 150
),
ranked AS (
    SELECT 
        *,
        ROW_NUMBER() OVER (
            PARTITION BY start_date, end_date
            ORDER BY 
                CASE WHEN all_participants_have_points THEN 0 ELSE 1 END,  -- Wars with ALL points > 0 come first
                id DESC  -- Among those, highest ID wins (last snapshot before reset)
        ) as rn
    FROM wars_to_keep
)
SELECT 
    id as war_id_to_keep,
    season_id,
    period_index,
    start_date,
    end_date,
    total_participants,
    participants_with_points,
    all_participants_have_points,
    'KEEPING THIS ONE' as action
FROM ranked
WHERE rn = 1
ORDER BY id DESC;

-- Step 3b: Show which wars will be DELETED (for verification)
WITH wars_to_keep AS (
    SELECT 
        w.id,
        w.start_date,
        w.end_date,
        (SELECT COUNT(*) 
         FROM war_participants 
         WHERE war_week_id = w.id) as total_participants,
        (SELECT COUNT(*) 
         FROM war_participants 
         WHERE war_week_id = w.id 
         AND war_points > 0) as participants_with_points,
        CASE 
            WHEN (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id) = 0 THEN true
            WHEN (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id AND war_points > 0) = 
                 (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id) THEN true
            ELSE false
        END as all_participants_have_points
    FROM war_weeks w
    WHERE w.id >= 150
),
ranked AS (
    SELECT 
        *,
        ROW_NUMBER() OVER (
            PARTITION BY start_date, end_date
            ORDER BY 
                CASE WHEN all_participants_have_points THEN 0 ELSE 1 END,
                id DESC
        ) as rn
    FROM wars_to_keep
)
SELECT 
    id as war_id_to_delete,
    start_date,
    end_date,
    total_participants,
    participants_with_points,
    all_participants_have_points,
    CASE 
        WHEN all_participants_have_points THEN 'EARLIER snapshot with all points > 0 (will delete)'
        ELSE 'LATER snapshot with some/all zeros (will delete)'
    END as reason
FROM ranked
WHERE rn > 1  -- All except the one we're keeping
ORDER BY id DESC
LIMIT 50;

-- Step 4: Delete participants from wars we're NOT keeping
DELETE FROM war_participants
WHERE war_week_id >= 150
AND war_week_id NOT IN (
    WITH wars_to_keep AS (
        SELECT 
            w.id,
            w.start_date,
            w.end_date,
            (SELECT COUNT(*) 
             FROM war_participants 
             WHERE war_week_id = w.id) as total_participants,
            (SELECT COUNT(*) 
             FROM war_participants 
             WHERE war_week_id = w.id 
             AND war_points > 0) as participants_with_points,
            CASE 
                WHEN (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id) = 0 THEN true
                WHEN (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id AND war_points > 0) = 
                     (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id) THEN true
                ELSE false
            END as all_participants_have_points
        FROM war_weeks w
        WHERE w.id >= 150
    ),
    ranked AS (
        SELECT 
            *,
            ROW_NUMBER() OVER (
                PARTITION BY start_date, end_date
                ORDER BY 
                    CASE WHEN all_participants_have_points THEN 0 ELSE 1 END,
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
            w.start_date,
            w.end_date,
            (SELECT COUNT(*) 
             FROM war_participants 
             WHERE war_week_id = w.id) as total_participants,
            (SELECT COUNT(*) 
             FROM war_participants 
             WHERE war_week_id = w.id 
             AND war_points > 0) as participants_with_points,
            CASE 
                WHEN (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id) = 0 THEN true
                WHEN (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id AND war_points > 0) = 
                     (SELECT COUNT(*) FROM war_participants WHERE war_week_id = w.id) THEN true
                ELSE false
            END as all_participants_have_points
        FROM war_weeks w
        WHERE w.id >= 150
    ),
    ranked AS (
        SELECT 
            *,
            ROW_NUMBER() OVER (
                PARTITION BY start_date, end_date
                ORDER BY 
                    CASE WHEN all_participants_have_points THEN 0 ELSE 1 END,
                    id DESC
            ) as rn
        FROM wars_to_keep
    )
    SELECT id FROM ranked WHERE rn = 1
);

-- Step 6: Verify results
SELECT 
    COUNT(*) as remaining_wars_150_plus,
    COUNT(DISTINCT start_date) as unique_start_dates,
    COUNT(DISTINCT end_date) as unique_end_dates,
    COUNT(DISTINCT (start_date, end_date)) as unique_war_weeks,
    MIN(id) as min_id,
    MAX(id) as max_id
FROM war_weeks 
WHERE id >= 150;

-- Step 7: Show the remaining wars (should be unique, one per war week)
SELECT 
    id,
    season_id,
    period_index,
    start_date,
    end_date,
    data_source,
    (SELECT COUNT(*) 
     FROM war_participants 
     WHERE war_week_id = war_weeks.id) as total_participants,
    (SELECT COUNT(*) 
     FROM war_participants 
     WHERE war_week_id = war_weeks.id 
     AND war_points > 0) as participants_with_points
FROM war_weeks 
WHERE id >= 150
ORDER BY id DESC
LIMIT 30;
