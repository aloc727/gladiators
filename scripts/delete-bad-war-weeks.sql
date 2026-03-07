-- Remove entire rows (full records) where id is in this list.
-- war_weeks: whole war-week rows (CASCADE deletes their participants and snapshots).
-- war_participants: whole participant rows for these ids.
-- Bad IDs: 1890, 1891, 1892, 1893, 9, 1318, 102
DELETE FROM war_weeks WHERE id IN (1890, 1891, 1892, 1893, 9, 1318);
DELETE FROM war_participants WHERE id IN (1890, 1891, 1892, 1893, 9, 1318, 102);

-- Remove all participants (and optionally the weeks) for war_week_id 1 and 1887
DELETE FROM war_participants WHERE war_week_id IN (1, 1887);
DELETE FROM war_weeks WHERE id IN (1, 1887);
