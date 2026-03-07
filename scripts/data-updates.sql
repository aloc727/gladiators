-- One-off data updates: names, tag correction, participation 0 instead of N/A
-- All tags normalized to #UPPERCASE. Matches with or without # so existing rows are updated.
-- Run on EC2: psql -U gladiators_user -d gladiators -h localhost -f scripts/data-updates.sql

-- 1) Update display names and normalize tag to #UPPERCASE (participants first, then members)
-- 2YVYLCL29 -> gerbster
UPDATE war_participants SET member_tag = '#2YVYLCL29' WHERE member_tag IN ('2YVYLCL29', '#2YVYLCL29');
UPDATE members SET name = 'gerbster', tag = '#2YVYLCL29' WHERE tag IN ('2YVYLCL29', '#2YVYLCL29');

-- U9999GLC9 -> moneyman
UPDATE war_participants SET member_tag = '#U9999GLC9' WHERE member_tag IN ('U9999GLC9', '#U9999GLC9');
UPDATE members SET name = 'moneyman', tag = '#U9999GLC9' WHERE tag IN ('U9999GLC9', '#U9999GLC9');

-- VP2VQYULR -> yoshioka
UPDATE war_participants SET member_tag = '#VP2VQYULR' WHERE member_tag IN ('VP2VQYULR', '#VP2VQYULR');
UPDATE members SET name = 'yoshioka', tag = '#VP2VQYULR' WHERE tag IN ('VP2VQYULR', '#VP2VQYULR');

-- Y2G9UQG89 -> Kevingar
UPDATE war_participants SET member_tag = '#Y2G9UQG89' WHERE member_tag IN ('Y2G9UQG89', '#Y2G9UQG89');
UPDATE members SET name = 'Kevingar', tag = '#Y2G9UQG89' WHERE tag IN ('Y2G9UQG89', '#Y2G9UQG89');

-- 2) Fix war_participants: 0PPJRRJV9 -> #20PPJRRJV9 (ensure member exists first)
INSERT INTO members (tag, name, role, last_seen, is_current)
VALUES ('#20PPJRRJV9', 'Unknown', 'member', CURRENT_TIMESTAMP, true)
ON CONFLICT (tag) DO NOTHING;
UPDATE war_participants SET member_tag = '#20PPJRRJV9' WHERE member_tag IN ('0PPJRRJV9', '#0PPJRRJV9', '20PPJRRJV9');

-- 3) Set participation to 0 (instead of N/A) for specific rows
UPDATE war_participants SET war_points = 0 WHERE id = 1902;  -- JP #QCLLU80J
UPDATE war_participants SET war_points = 0 WHERE id = 1897;  -- caitpenning #LPJJYCQLV
