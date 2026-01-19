# PostgreSQL Migration - Code Complete! ✅

## What's Been Done

### 1. **Database Module Created** (`db.js`)
- PostgreSQL connection pool
- All CRUD operations for members, war weeks, participants, snapshots
- Schema initialization
- Error handling

### 2. **Server Updated** (`server.js`)
- ✅ Replaced all JSON file operations with database calls
- ✅ All functions now async/await
- ✅ Database schema auto-initializes on startup
- ✅ Maintains same API structure for frontend (no breaking changes)
- ✅ Graceful error handling (falls back to demo data if DB fails)

### 3. **Migration Script Ready** (`scripts/migrate-to-postgres.js`)
- Converts JSON → PostgreSQL
- Creates backups automatically
- Verifies data integrity

## Next Steps on EC2

### Step 1: Install PostgreSQL
```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Step 2: Create Database & User
```bash
sudo -u postgres psql
```

Then in psql:
```sql
CREATE DATABASE gladiators;
CREATE USER gladiators_user WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE gladiators TO gladiators_user;
\c gladiators
GRANT ALL ON SCHEMA public TO gladiators_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gladiators_user;
\q
```

### Step 3: Configure PostgreSQL
```bash
sudo nano /etc/postgresql/14/main/pg_hba.conf
# Add: local   all             all                                     md5
sudo systemctl restart postgresql
```

### Step 4: Update `.env` File
Add to `~/gladiators/.env`:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gladiators
DB_USER=gladiators_user
DB_PASSWORD=your_secure_password_here
```

### Step 5: Install Dependencies & Pull Code
```bash
cd ~/gladiators
git pull origin main
npm install
```

### Step 6: Run Migration
```bash
node scripts/migrate-to-postgres.js
```

This will:
- Create all database tables
- Migrate all JSON data to PostgreSQL
- Create `.json.backup` files
- Verify data integrity

### Step 7: Restart Service
```bash
sudo systemctl restart gladiators
sudo systemctl status gladiators
```

### Step 8: Verify
- Check website loads
- Check data appears correctly
- Check server logs: `sudo journalctl -u gladiators -f`

## Rollback Plan

If something goes wrong:

1. **Stop the service:**
   ```bash
   sudo systemctl stop gladiators
   ```

2. **Revert to v1.12:**
   ```bash
   cd ~/gladiators
   git checkout v1.12
   sudo systemctl restart gladiators
   ```

3. **Or restore JSON files:**
   ```bash
   cp data/members.json.backup data/members.json
   cp data/war-history.json.backup data/war-history.json
   cp data/war-snapshots.json.backup data/war-snapshots.json
   ```

## What Changed

### Before (JSON):
- `loadWarHistory()` → Read JSON file
- `saveWarHistory()` → Write JSON file
- `loadMemberHistory()` → Read JSON file
- `saveMemberHistory()` → Write JSON file
- `loadSnapshots()` → Read JSON file
- `saveSnapshots()` → Write JSON file

### After (PostgreSQL):
- `loadWarHistory()` → `db.getWarWeeks()` + `db.getParticipantsByWarWeek()`
- `upsertWarEntry()` → `db.upsertWarWeek()` + `db.upsertParticipant()`
- `attachMemberHistory()` → `db.getMembers()` + `db.upsertMember()`
- `getMemberHistoryList()` → `db.getMembers(true)`
- `captureWarSnapshotsWindow()` → `db.saveSnapshot()`

## Benefits

✅ **Data Integrity**: Foreign keys, constraints, transactions
✅ **Performance**: Indexed queries, connection pooling
✅ **Scalability**: Handles thousands of wars efficiently
✅ **Concurrent Access**: Multiple processes can read/write safely
✅ **SQL Proficiency**: Easy to query, maintain, extend

## Testing Checklist

- [ ] PostgreSQL installed and running
- [ ] Database and user created
- [ ] `.env` file updated with DB credentials
- [ ] `npm install` completed
- [ ] Migration script ran successfully
- [ ] Service restarted
- [ ] Website loads correctly
- [ ] Data appears in tables
- [ ] API endpoints return data
- [ ] No errors in logs

## Support

If you encounter issues:
1. Check server logs: `sudo journalctl -u gladiators -n 50`
2. Check PostgreSQL logs: `sudo journalctl -u postgresql -n 50`
3. Test database connection: `psql -U gladiators_user -d gladiators`
4. Verify data: `SELECT COUNT(*) FROM members;`

---

**Ready to deploy!** 🚀
