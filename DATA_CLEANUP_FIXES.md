# Data Storage Fixes

## Issues Fixed

### 1. ✅ Repetitive Hourly Captures
**Problem:** `captureCurrentWeek()` was running every hour, creating duplicate war week entries.

**Fix:** 
- Now only captures once per war week
- Only runs during war end window (Monday 4:25-4:35am CT)
- Checks if war week already exists before capturing
- Prevents duplicate entries in the database

### 2. ✅ Missing Season Numbers
**Problem:** Season numbers (`seasonId`, `sectionIndex`, `periodIndex`) weren't being stored properly from river race API.

**Fix:**
- `convertRiverRaceToWarLog()` now properly extracts season info from API
- `upsertWarWeek()` now preserves and updates season numbers
- Uses `COALESCE` to update season info if it was missing before

### 3. ✅ Excessive Snapshots
**Problem:** Snapshots were being captured every 5 minutes constantly.

**Fix:**
- `captureWarSnapshotsWindow()` already only runs during Monday 4:25-4:31am CT ✅
- This was already correct - snapshots only happen during war end window

## Cleaning Up Existing Duplicate Data

You'll want to clean up the duplicate war weeks in your database. Here are SQL queries to help:

### Find Duplicate War Weeks

```sql
-- Find war weeks with same end_date (duplicates)
SELECT end_date, COUNT(*) as count
FROM war_weeks
GROUP BY end_date
HAVING COUNT(*) > 1
ORDER BY end_date DESC;
```

### Find War Weeks Missing Season Info

```sql
-- Find war weeks without season numbers
SELECT id, end_date, season_id, section_index, period_index, data_source
FROM war_weeks
WHERE season_id IS NULL
ORDER BY end_date DESC;
```

### Delete Duplicate War Weeks (Keep Most Recent)

```sql
-- Delete duplicates, keeping the one with the most recent created_at
-- BE CAREFUL - Test this on a backup first!

DELETE FROM war_weeks w1
WHERE EXISTS (
    SELECT 1 FROM war_weeks w2
    WHERE w2.end_date = w1.end_date
    AND w2.id > w1.id  -- Keep the one with higher ID (more recent)
);
```

### Update Season Numbers from River Race Data

If you have season info in the `raw_data` JSONB field of participants, you can extract it:

```sql
-- Check if participants have season info in raw_data
SELECT DISTINCT
    wp.war_week_id,
    ww.end_date,
    wp.raw_data->>'seasonId' as season_id,
    wp.raw_data->>'sectionIndex' as section_index,
    wp.raw_data->>'periodIndex' as period_index
FROM war_participants wp
JOIN war_weeks ww ON wp.war_week_id = ww.id
WHERE wp.raw_data IS NOT NULL
AND (wp.raw_data->>'seasonId' IS NOT NULL 
     OR wp.raw_data->>'sectionIndex' IS NOT NULL)
LIMIT 10;
```

### Manual Cleanup in DBeaver

1. **View duplicate weeks:**
   - Right-click `war_weeks` table → "View Data"
   - Sort by `end_date` DESC
   - Look for duplicate `end_date` values

2. **Delete duplicates manually:**
   - For each duplicate, keep the one with:
     - Most recent `created_at`
     - Or the one with `season_id` populated
   - Delete the others

3. **Update season numbers:**
   - If you see war weeks without season numbers, you can manually update them
   - Or wait for the next API call to populate them automatically

## Going Forward

After deploying these fixes:

1. **No more hourly duplicates** - Data only captured once per war week
2. **Season numbers preserved** - Will be stored and updated automatically
3. **Snapshots only during war end** - Already working correctly (Monday 4:25-4:31am CT)

## Deploy the Fixes

```bash
# On EC2:
cd ~/gladiators
git pull origin main
sudo systemctl restart gladiators
```

The new code will:
- Only capture data once per war week (during war end window)
- Properly store season numbers from the API
- Prevent future duplicate entries
