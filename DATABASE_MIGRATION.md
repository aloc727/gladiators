# Database Migration Plan

## Why Migrate from JSON to Database?

**Current Issues:**
- JSON files are fragile (corruption risk, no transactions)
- Hard to query/filter efficiently
- No referential integrity
- Difficult to handle concurrent writes
- Limited scalability as data grows

**Benefits of Database:**
- ✅ ACID transactions (data integrity)
- ✅ Efficient queries (indexes, joins)
- ✅ Referential integrity (foreign keys)
- ✅ Concurrent access safe
- ✅ Easy backups (single file or dump)
- ✅ SQL proficiency = easy maintenance

## Database Choice: SQLite vs Postgres

### Option 1: SQLite (Recommended for Start)
**Pros:**
- Zero setup (single file, no server)
- Perfect for single EC2 instance
- Fast for read-heavy workloads
- Easy backups (just copy the file)
- Built into Node.js ecosystem

**Cons:**
- Limited concurrent writes (fine for your use case)
- No network access (local only - fine for single server)

### Option 2: Postgres (If You Want More Power)
**Pros:**
- Better for high concurrency
- More advanced features
- Can scale to multiple servers later

**Cons:**
- Requires installation and setup
- More moving parts
- Overkill for current needs

**Recommendation:** Start with **SQLite**. You can migrate to Postgres later if needed (same SQL concepts).

## Database Schema

```sql
-- Members table (all-time member tracking)
CREATE TABLE members (
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
CREATE TABLE war_weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
CREATE TABLE war_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    war_week_id INTEGER NOT NULL,            -- FK to war_weeks
    member_tag TEXT NOT NULL,                -- FK to members
    rank INTEGER,                             -- War rank (1-50)
    war_points INTEGER,                      -- Total points
    decks_used INTEGER,                      -- Number of decks used
    boat_attacks INTEGER,                    -- Boat attacks (if available)
    trophies INTEGER,                         -- Trophies (if available)
    raw_data TEXT,                           -- JSON blob of full API response
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (war_week_id) REFERENCES war_weeks(id) ON DELETE CASCADE,
    FOREIGN KEY (member_tag) REFERENCES members(tag) ON DELETE CASCADE,
    UNIQUE(war_week_id, member_tag)
);

-- War snapshots (minute-by-minute around rollover)
CREATE TABLE war_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    war_week_id INTEGER NOT NULL,            -- FK to war_weeks
    snapshot_time TIMESTAMP NOT NULL,        -- When snapshot was taken
    snapshot_data TEXT NOT NULL,             -- JSON blob of full state
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (war_week_id) REFERENCES war_weeks(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_war_weeks_end_date ON war_weeks(end_date DESC);
CREATE INDEX idx_war_participants_week ON war_participants(war_week_id);
CREATE INDEX idx_war_participants_member ON war_participants(member_tag);
CREATE INDEX idx_war_participants_week_member ON war_participants(war_week_id, member_tag);
CREATE INDEX idx_members_is_current ON members(is_current);
CREATE INDEX idx_members_tag ON members(tag);
```

## Migration Steps

1. **Create database schema** (SQLite file: `data/gladiators.db`)
2. **Migrate existing JSON data** to database
3. **Update server.js** to use database instead of JSON
4. **Test thoroughly** (verify data integrity)
5. **Keep JSON as backup** (export periodically)

## Implementation Plan

1. Install `better-sqlite3` (fast, synchronous SQLite for Node.js)
2. Create migration script to convert JSON → DB
3. Update `server.js` functions:
   - `loadWarHistory()` → `db.getWarWeeks()`
   - `saveWarHistory()` → `db.saveWarWeek()`
   - `loadMemberHistory()` → `db.getMembers()`
   - `saveMemberHistory()` → `db.saveMember()`
4. Add database helper module (`db.js`)
5. Test on local, then deploy to EC2

## Rollback Plan

- Keep JSON files as backup
- Can export DB back to JSON if needed
- Git commit before migration (easy revert)
