# War Weeks Table Fields Explained

## Clash Royale War Structure

In Clash Royale's clan war system, wars are organized hierarchically:

```
Season (e.g., Season 128)
  └── Section (usually 0, but can be different for different war tracks)
      └── Period/Week (Week 1, Week 2, Week 3, etc.)
```

## Database Fields

### `season_id` (INTEGER)
- **What it is**: The season number
- **Example**: `128` means "Season 128"
- **Purpose**: Clash Royale organizes wars into seasons (typically lasting several weeks)
- **Display**: Used to show "Season 128 Week 1" in the UI

### `section_index` (INTEGER)
- **What it is**: The war section/track index
- **Example**: Usually `0`, but can be `1`, `2`, etc. for different war tracks
- **Purpose**: Clash Royale can have multiple war tracks or sections within a season
- **Common value**: Most clans will have `section_index = 0` (the main war track)
- **Note**: This is often `0` or `null` for most clans

### `period_index` (INTEGER)
- **What it is**: The week number within the season
- **Example**: `1` = Week 1, `2` = Week 2, `3` = Week 3, etc.
- **Purpose**: Identifies which week of the season this war belongs to
- **Display**: Used to show "Season 128 Week 1" in the UI

## How They Work Together

Together, these three fields uniquely identify a war week:

- **Season 128, Section 0, Period 1** = "Season 128 Week 1"
- **Season 128, Section 0, Period 2** = "Season 128 Week 2"
- **Season 128, Section 0, Period 3** = "Season 128 Week 3"

## In Your Database

The unique constraint is:
```sql
UNIQUE(season_id, section_index, period_index, end_date)
```

This ensures you can't have duplicate war weeks with the same season/section/period combination.

## Example Data

```sql
-- Example war week entry
season_id: 128
section_index: 0
period_index: 1
start_date: 2026-01-08 04:30:00
end_date: 2026-01-12 04:30:00

-- This represents: "Season 128 Week 1"
-- War ran from Thursday Jan 8 to Monday Jan 12
```

## Why Some Fields Might Be NULL

- **`season_id` NULL**: Data captured before season info was available, or from an API that doesn't provide it
- **`section_index` NULL**: Usually means it's the default/main war track (effectively 0)
- **`period_index` NULL**: Week number wasn't available from the API

The code tries to preserve and update these values when they become available from the API.
