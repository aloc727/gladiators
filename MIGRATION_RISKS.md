# PostgreSQL Migration Risk Assessment

## Summary: **LOW RISK** ✅

The migration from JSON to PostgreSQL is **low risk** with proper safeguards in place. Here's the detailed breakdown:

---

## 1. Setup Risks

### Risk Level: **LOW** ✅

**Potential Issues:**
- PostgreSQL installation fails
- Database connection errors
- Schema creation issues
- Migration script errors

**Mitigations:**
- ✅ Standard Ubuntu package (well-tested)
- ✅ Automated schema creation (`db.initializeSchema()`)
- ✅ Migration script has error handling and rollback
- ✅ JSON files kept as backups (`.json.backup`)
- ✅ Can rollback by reverting `server.js` changes
- ✅ v1.12 branch saved as stable snapshot

**Recovery Plan:**
1. If migration fails: JSON backups are untouched
2. If schema issues: Drop database, recreate, retry
3. If connection issues: Check `.env` credentials, PostgreSQL service status
4. Worst case: Revert to v1.12 branch

---

## 2. Login/Authentication Risks

### Risk Level: **LOW** ✅

**Current Setup:**
- Database user: `gladiators_user`
- Password stored in `.env` (same pattern as API key)
- Local-only access (no public exposure)
- Connection pooling (handles reconnects)

**Potential Issues:**
- Password exposed in logs (unlikely)
- Connection pool exhaustion
- Database user permissions

**Mitigations:**
- ✅ Password in `.env` (already git-ignored, same as API key)
- ✅ Local-only connections (firewall blocks external access)
- ✅ Connection pool limits (max 20 connections)
- ✅ Proper user permissions (GRANT statements in setup)
- ✅ No password in code or logs

**Security Notes:**
- PostgreSQL runs on same EC2 instance (no network exposure)
- UFW firewall blocks port 5432 from public
- Password complexity recommended (but not enforced)

---

## 3. Cost Risks

### Risk Level: **ZERO** ✅

**Cost Analysis:**
- **PostgreSQL**: FREE (runs on existing EC2 instance)
- **Storage**: ~10-50 MB (negligible, included in EC2)
- **RAM**: ~50-100 MB (minimal, your instance has 1GB+)
- **CPU**: <1% (idle, spikes during queries)
- **No additional AWS services**: No RDS, no extra charges

**Resource Usage:**
- Your dataset: ~71 members, ~260 war weeks, ~thousands of participants
- Database size: Estimated 5-20 MB
- Memory footprint: ~50-100 MB (PostgreSQL default)
- Query performance: Milliseconds (indexed queries)

**Comparison:**
- JSON files: ~80 KB total
- PostgreSQL: ~5-20 MB (includes indexes, overhead)
- Still negligible on your EC2 instance

**Verdict:** **No additional cost** - PostgreSQL runs on your existing EC2 instance.

---

## 4. Data Integrity Risks

### Risk Level: **LOW** ✅

**Potential Issues:**
- Data loss during migration
- Corrupted data
- Missing relationships (foreign keys)

**Mitigations:**
- ✅ Migration script creates backups (`.json.backup`)
- ✅ Transaction support (all-or-nothing inserts)
- ✅ Foreign key constraints (data integrity)
- ✅ Verification step after migration
- ✅ Can re-run migration (idempotent with `ON CONFLICT`)

**Data Safety:**
- Original JSON files untouched (backups created)
- Migration is additive (doesn't delete JSON)
- Can export database back to JSON if needed
- Git history preserves all versions

---

## 5. Application Downtime Risks

### Risk Level: **LOW** ✅

**Migration Process:**
1. Install PostgreSQL (5 minutes)
2. Create database/user (2 minutes)
3. Run migration script (1-2 minutes)
4. Update `server.js` (code change)
5. Restart service (10 seconds)

**Downtime:**
- **Migration itself**: ~5-10 minutes (can do during low traffic)
- **Code update**: ~30 seconds (git pull + restart)
- **Total**: ~10 minutes max

**Mitigations:**
- ✅ Can run migration while old code still runs (JSON still works)
- ✅ Update code separately (after migration verified)
- ✅ Quick rollback (revert `server.js`, restart)
- ✅ v1.12 branch ready if needed

---

## 6. Performance Risks

### Risk Level: **VERY LOW** ✅

**Current Performance:**
- JSON loading: ~50-100ms (file I/O)
- JSON parsing: ~10-20ms
- Total: ~100ms per request

**PostgreSQL Performance:**
- Query time: ~5-20ms (indexed)
- Connection pool: Reuses connections
- Total: ~20-50ms per request

**Verdict:** **Faster** - Database queries are typically faster than JSON parsing, especially with indexes.

**Resource Impact:**
- RAM: +50-100 MB (PostgreSQL process)
- CPU: <1% average, <5% during queries
- Disk: +5-20 MB (database files)

**Your EC2 Instance:**
- t2.micro: 1 GB RAM, 1 vCPU (sufficient)
- t3.micro: 1 GB RAM, 2 vCPU (more than enough)

---

## 7. Rollback Plan

### If Migration Fails:

1. **Stop migration script** (Ctrl+C)
2. **Check backups**: `ls -la data/*.backup`
3. **Restore if needed**: `cp data/members.json.backup data/members.json`
4. **Revert code**: `git checkout v1.12` or revert `server.js` changes
5. **Restart service**: `sudo systemctl restart gladiators`

### If Database Issues:

1. **Check PostgreSQL**: `sudo systemctl status postgresql`
2. **Check logs**: `sudo journalctl -u postgresql -n 50`
3. **Test connection**: `psql -U gladiators_user -d gladiators`
4. **Recreate if needed**: Drop database, recreate, re-run migration

### If Code Issues:

1. **Revert to v1.12**: `git checkout v1.12`
2. **Restart service**: `sudo systemctl restart gladiators`
3. **Debug later**: Fix issues, retry migration

---

## Risk Summary Table

| Risk Category | Level | Impact | Mitigation |
|--------------|-------|--------|------------|
| Setup | LOW | Medium | Automated scripts, backups |
| Authentication | LOW | Low | Local-only, .env storage |
| Cost | ZERO | None | No additional services |
| Data Integrity | LOW | Medium | Backups, transactions |
| Downtime | LOW | Low | Can migrate while running |
| Performance | VERY LOW | Positive | Faster queries |

---

## Recommendation: **PROCEED** ✅

**Why:**
- Low risk with multiple safeguards
- No additional cost
- Better data integrity
- Easier maintenance (SQL proficiency)
- Can rollback easily

**Best Practices:**
1. ✅ Test migration on a copy first (optional)
2. ✅ Run migration during low-traffic period
3. ✅ Verify data after migration
4. ✅ Keep JSON backups for 1-2 weeks
5. ✅ Monitor logs after deployment

---

## Pre-Migration Checklist

- [ ] v1.12 branch created and pushed ✅
- [ ] PostgreSQL installed on EC2
- [ ] Database and user created
- [ ] `.env` updated with DB credentials
- [ ] `npm install` run (pg package)
- [ ] Migration script tested (dry run)
- [ ] JSON backups verified
- [ ] Rollback plan understood

---

## Post-Migration Checklist

- [ ] Migration completed successfully
- [ ] Data verified (counts match)
- [ ] `server.js` updated to use database
- [ ] Service restarted
- [ ] Website tested (all features work)
- [ ] Logs checked (no errors)
- [ ] JSON backups kept for safety

---

**Bottom Line:** This is a **low-risk, high-reward** migration. The safeguards (backups, rollback plan, v1.12 branch) make it safe to proceed.

---

## Archive war history (no mix with current war)

To move all existing war history into `_archive` tables so only **current war** data lives in the main tables (and you can load past history later from your own source):

```bash
node scripts/archive-war-history.js
```

This copies `war_weeks`, `war_participants`, and `war_snapshots` into `war_weeks_archive`, `war_participants_archive`, and `war_snapshots_archive`, then clears the main tables. Current war data comes only from the API from then on. Snapshots are taken from the **current river race** API, keyed by **Central Time** (Monday 4:30am CT), and each snapshot includes an **ID** and **date/timestamp in Central Time**.
