-- Archive tables: copy of war history so it's not mixed with current data.
-- Run once to move existing data into _archive, then use main tables only for current war.

CREATE TABLE IF NOT EXISTS war_weeks_archive (LIKE war_weeks INCLUDING ALL);
CREATE TABLE IF NOT EXISTS war_participants_archive (LIKE war_participants INCLUDING ALL);
CREATE TABLE IF NOT EXISTS war_snapshots_archive (LIKE war_snapshots INCLUDING ALL);

-- (LIKE does not copy foreign keys, so no need to drop them.)

CREATE INDEX IF NOT EXISTS idx_war_weeks_archive_end_date ON war_weeks_archive(end_date DESC);
CREATE INDEX IF NOT EXISTS idx_war_participants_archive_week ON war_participants_archive(war_week_id);
CREATE INDEX IF NOT EXISTS idx_war_snapshots_archive_week ON war_snapshots_archive(war_week_id);
