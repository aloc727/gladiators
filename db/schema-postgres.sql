-- Gladiators Clan War Stats Database Schema
-- PostgreSQL Database Schema

-- Members table (all-time member tracking)
CREATE TABLE IF NOT EXISTS members (
    tag TEXT PRIMARY KEY,                    -- e.g., "#JPRY8GGJY"
    name TEXT,                               -- Current name (can change)
    role TEXT,                               -- leader, coleader, elder, member
    first_seen TIMESTAMP,                    -- First time we saw them
    joined_at TIMESTAMP,                     -- When they joined clan
    last_seen TIMESTAMP,                     -- Last time we saw them
    tenure_known BOOLEAN DEFAULT FALSE,       -- Do we know actual join date?
    is_current BOOLEAN DEFAULT TRUE,         -- Currently in clan?
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- War weeks (one row per war week)
CREATE TABLE IF NOT EXISTS war_weeks (
    id SERIAL PRIMARY KEY,
    season_id INTEGER,                       -- e.g., 128
    section_index INTEGER,                   -- e.g., 0
    period_index INTEGER,                    -- e.g., 1 (week number)
    start_date TIMESTAMP NOT NULL,           -- War start (Thursday)
    end_date TIMESTAMP NOT NULL,             -- War end (Monday 4:30 AM CT)
    created_date TIMESTAMP,                  -- From API
    data_source TEXT,                        -- 'warlog' or 'riverrace'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(season_id, section_index, period_index, end_date)
);

-- War participants (one row per player per war)
CREATE TABLE IF NOT EXISTS war_participants (
    id SERIAL PRIMARY KEY,
    war_week_id INTEGER NOT NULL,            -- FK to war_weeks
    member_tag TEXT NOT NULL,                -- FK to members
    rank INTEGER,                             -- War rank (1-80)
    war_points INTEGER,                      -- Total points
    decks_used INTEGER,                      -- Number of decks used
    boat_attacks INTEGER,                    -- Boat attacks (if available)
    trophies INTEGER,                         -- Trophies (if available)
    raw_data JSONB,                          -- JSON blob of full API response (Postgres JSONB for querying)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (war_week_id) REFERENCES war_weeks(id) ON DELETE CASCADE,
    FOREIGN KEY (member_tag) REFERENCES members(tag) ON DELETE CASCADE,
    UNIQUE(war_week_id, member_tag)
);

-- War snapshots (minute-by-minute around rollover)
CREATE TABLE IF NOT EXISTS war_snapshots (
    id SERIAL PRIMARY KEY,
    war_week_id INTEGER NOT NULL,            -- FK to war_weeks
    snapshot_time TIMESTAMP NOT NULL,        -- When snapshot was taken
    snapshot_data JSONB NOT NULL,            -- JSON blob of full state
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (war_week_id) REFERENCES war_weeks(id) ON DELETE CASCADE
);

-- Promotion history (Member -> Elder -> Co-Leader)
CREATE TABLE IF NOT EXISTS promotion_history (
    id SERIAL PRIMARY KEY,
    member_tag TEXT NOT NULL,
    from_role TEXT NOT NULL,
    to_role TEXT NOT NULL,
    promoted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (member_tag) REFERENCES members(tag) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_promotion_history_member ON promotion_history(member_tag);
CREATE INDEX IF NOT EXISTS idx_promotion_history_at ON promotion_history(promoted_at DESC);

-- Demotion history (Leader -> Co-Leader -> Elder -> Member)
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_war_weeks_end_date ON war_weeks(end_date DESC);
CREATE INDEX IF NOT EXISTS idx_war_participants_week ON war_participants(war_week_id);
CREATE INDEX IF NOT EXISTS idx_war_participants_member ON war_participants(member_tag);
CREATE INDEX IF NOT EXISTS idx_war_participants_week_member ON war_participants(war_week_id, member_tag);
CREATE INDEX IF NOT EXISTS idx_members_is_current ON members(is_current);
CREATE INDEX IF NOT EXISTS idx_members_tag ON members(tag);

-- JSONB indexes for querying raw_data (Postgres-specific feature)
CREATE INDEX IF NOT EXISTS idx_war_participants_raw_data ON war_participants USING GIN (raw_data);
CREATE INDEX IF NOT EXISTS idx_war_snapshots_data ON war_snapshots USING GIN (snapshot_data);
