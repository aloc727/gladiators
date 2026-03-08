-- Demotion history table (Leader -> Co-Leader -> Elder -> Member)
-- Run in psql if you apply schema manually and need this table.
CREATE TABLE IF NOT EXISTS demotion_history (
    id SERIAL PRIMARY KEY,
    member_tag TEXT NOT NULL,
    from_role TEXT NOT NULL,
    to_role TEXT NOT NULL,
    demoted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_tag) REFERENCES members(tag) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_demotion_history_member ON demotion_history(member_tag);
CREATE INDEX IF NOT EXISTS idx_demotion_history_at ON demotion_history(demoted_at DESC);
