# PostgreSQL Data Model

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        MEMBERS                               │
├─────────────────────────────────────────────────────────────┤
│ tag (PK)              TEXT                                   │
│ name                  TEXT                                   │
│ role                  TEXT (leader/coleader/elder/member)   │
│ first_seen            TIMESTAMP                              │
│ joined_at             TIMESTAMP                              │
│ last_seen             TIMESTAMP                              │
│ tenure_known          BOOLEAN                               │
│ is_current            BOOLEAN                               │
│ created_at            TIMESTAMP                              │
│ updated_at            TIMESTAMP                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ 1:N
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    WAR_PARTICIPANTS                          │
├─────────────────────────────────────────────────────────────┤
│ id (PK)              SERIAL                                  │
│ war_week_id (FK)     INTEGER → war_weeks.id                 │
│ member_tag (FK)      TEXT → members.tag                     │
│ rank                 INTEGER (1-50)                          │
│ war_points           INTEGER                                 │
│ decks_used           INTEGER                                 │
│ boat_attacks         INTEGER                                 │
│ trophies             INTEGER                                 │
│ raw_data             JSONB (full API response)              │
│ created_at           TIMESTAMP                               │
│                                                              │
│ UNIQUE(war_week_id, member_tag)                              │
└─────────────────────────────────────────────────────────────┘
         │
         │ N:1
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                      WAR_WEEKS                               │
├─────────────────────────────────────────────────────────────┤
│ id (PK)              SERIAL                                  │
│ season_id            INTEGER (e.g., 128)                     │
│ section_index        INTEGER (e.g., 0)                      │
│ period_index         INTEGER (e.g., 1 = week number)         │
│ start_date           TIMESTAMP (Thursday)                    │
│ end_date             TIMESTAMP (Monday 4:30 AM CT)           │
│ created_date         TIMESTAMP (from API)                     │
│ data_source          TEXT ('warlog' or 'riverrace')          │
│ created_at           TIMESTAMP                               │
│                                                              │
│ UNIQUE(season_id, section_index, period_index, end_date)     │
└─────────────────────────────────────────────────────────────┘
         │
         │ 1:N
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    WAR_SNAPSHOTS                             │
├─────────────────────────────────────────────────────────────┤
│ id (PK)              SERIAL                                  │
│ war_week_id (FK)     INTEGER → war_weeks.id                 │
│ snapshot_time        TIMESTAMP (4:25, 4:26, ... 4:31 AM)    │
│ snapshot_data        JSONB (full state at that moment)       │
│ created_at           TIMESTAMP                               │
└─────────────────────────────────────────────────────────────┘
```

## Table Relationships

### 1. **members** (Master Member List)
- **Purpose**: All-time member tracking (current + former)
- **Primary Key**: `tag` (e.g., "#JPRY8GGJY")
- **Key Fields**:
  - `tag`: Unique player identifier (never changes)
  - `name`: Current name (can change)
  - `role`: Current role in clan
  - `is_current`: Filter flag for "current members only"
  - `first_seen`, `joined_at`, `last_seen`: Tenure tracking

### 2. **war_weeks** (War Week Metadata)
- **Purpose**: One row per war week (Thursday → Monday)
- **Primary Key**: `id` (auto-increment)
- **Unique Constraint**: `(season_id, section_index, period_index, end_date)`
- **Key Fields**:
  - `season_id`, `section_index`, `period_index`: API identifiers
  - `start_date`, `end_date`: War boundaries
  - `data_source`: Track if from `/warlog` or `/riverrace` API

### 3. **war_participants** (Player Performance Per War)
- **Purpose**: One row per player per war (many-to-many)
- **Primary Key**: `id` (auto-increment)
- **Foreign Keys**:
  - `war_week_id` → `war_weeks.id`
  - `member_tag` → `members.tag`
- **Unique Constraint**: `(war_week_id, member_tag)` (one record per player per war)
- **Key Fields**:
  - `rank`, `war_points`, `decks_used`: Core metrics
  - `raw_data`: Full API response (JSONB for querying)

### 4. **war_snapshots** (Minute-by-Minute Rollover Data)
- **Purpose**: Capture state around Monday 4:30 AM CT rollover
- **Primary Key**: `id` (auto-increment)
- **Foreign Key**: `war_week_id` → `war_weeks.id`
- **Key Fields**:
  - `snapshot_time`: Exact timestamp (4:25, 4:26, ... 4:31 AM)
  - `snapshot_data`: Full state JSONB

## Data Flow: JSON → Database

### Current JSON Structure:
```json
// members.json
{
  "items": [
    {
      "tag": "#JPRY8GGJY",
      "name": "PlayerName",
      "role": "member",
      "firstSeen": "2026-01-01T...",
      "joinedAt": "2026-01-01T...",
      "lastSeen": "2026-01-19T...",
      "tenureKnown": true,
      "isCurrent": true
    }
  ]
}

// war-history.json
{
  "items": [
    {
      "seasonId": 128,
      "sectionIndex": 0,
      "periodIndex": 1,
      "startDate": "2026-01-08T...",
      "endDate": "2026-01-12T...",
      "createdDate": "2026-01-12T...",
      "dataSource": "riverrace",
      "participants": [
        {
          "tag": "#JPRY8GGJY",
          "name": "PlayerName",
          "rank": 5,
          "warPoints": 1600,
          "decksUsed": 4,
          "boatAttacks": 2,
          "trophies": 5000,
          // ... full API response
        }
      ]
    }
  ]
}

// war-snapshots.json
{
  "weeks": {
    "2026-01-12T10:30:00.000Z": [
      {
        "snapshotTime": "2026-01-12T10:25:00.000Z",
        "snapshotData": { /* full state */ }
      }
    ]
  }
}
```

### Database Structure:
```
members (1 row per player, all-time)
  └─> war_participants (N rows per player, one per war)
        └─> war_weeks (1 row per war)
              └─> war_snapshots (N rows per war, one per minute)
```

## Key Design Decisions

### 1. **Normalized Structure**
- **Why**: Eliminates data duplication
- **Example**: Player name stored once in `members`, referenced by `tag` in `war_participants`
- **Benefit**: Name changes update one place, all wars reflect new name

### 2. **Foreign Key Constraints**
- **Why**: Data integrity (can't delete member with war history)
- **CASCADE**: Deleting a war week deletes all participants and snapshots
- **Benefit**: Prevents orphaned records

### 3. **JSONB for Raw Data**
- **Why**: Store full API responses for future use
- **Benefit**: Can query inside JSON (`raw_data->>'warPoints'`)
- **Index**: GIN index for fast JSON queries

### 4. **Unique Constraints**
- **war_weeks**: Prevents duplicate wars (same season/week/end_date)
- **war_participants**: Prevents duplicate player entries per war
- **Benefit**: Idempotent inserts (safe to re-run migration)

### 5. **Indexes for Performance**
- **war_weeks.end_date**: Fast "get recent wars" queries
- **war_participants(war_week_id, member_tag)**: Fast lookups
- **members.is_current**: Fast "current members only" filter
- **JSONB GIN indexes**: Fast JSON queries

## Query Examples

### Get all wars for a player:
```sql
SELECT ww.*, wp.rank, wp.war_points, wp.decks_used
FROM war_participants wp
JOIN war_weeks ww ON wp.war_week_id = ww.id
WHERE wp.member_tag = '#JPRY8GGJY'
ORDER BY ww.end_date DESC;
```

### Get all participants for a war:
```sql
SELECT m.name, m.role, wp.rank, wp.war_points
FROM war_participants wp
JOIN members m ON wp.member_tag = m.tag
WHERE wp.war_week_id = 123
ORDER BY wp.rank;
```

### Get current members with their latest war:
```sql
SELECT m.*, 
       (SELECT wp.war_points 
        FROM war_participants wp
        JOIN war_weeks ww ON wp.war_week_id = ww.id
        WHERE wp.member_tag = m.tag
        ORDER BY ww.end_date DESC
        LIMIT 1) as latest_war_points
FROM members m
WHERE m.is_current = true;
```

## Migration Mapping

| JSON Source | Database Target | Notes |
|------------|----------------|-------|
| `members.json.items[]` | `members` table | One-to-one |
| `war-history.json.items[]` | `war_weeks` table | One war = one row |
| `war-history.json.items[].participants[]` | `war_participants` table | Nested array → separate table |
| `war-snapshots.json.weeks[date][]` | `war_snapshots` table | Nested structure → flat table |

## Benefits Over JSON

1. **Referential Integrity**: Can't have participant without member
2. **Efficient Queries**: Indexed lookups vs. full file scans
3. **Concurrent Access**: Multiple processes can read/write safely
4. **Scalability**: Handles thousands of wars efficiently
5. **Data Integrity**: Foreign keys prevent orphaned records
6. **Flexible Queries**: SQL joins, aggregations, filters

## Future Extensibility

Easy to add:
- **clan_stats** table (aggregated metrics per week)
- **player_achievements** table (badges, streaks)
- **war_analytics** table (derived metrics)
- **audit_log** table (track changes)

All without changing core structure!
