-- Record Peyton Milkner #9RRRVUYY promoted Member → Elder on 3/8/2026
-- Run this in psql (or your Postgres client) after connecting to the gladiators DB.
-- Member must already exist in members table (from clan sync). If not, the INSERT will fail with FK violation.

INSERT INTO promotion_history (member_tag, from_role, to_role, promoted_at)
VALUES ('#9RRRVUYY', 'member', 'elder', '2026-03-08 12:00:00');
