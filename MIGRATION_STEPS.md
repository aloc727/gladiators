# PostgreSQL Migration - Step-by-Step Guide

Follow these steps **on your EC2 instance** to migrate from JSON to PostgreSQL.

---

## Step 1: Connect to EC2

```bash
ssh -i /path/to/your-key.pem ubuntu@your_elastic_ip
```

---

## Step 2: Install PostgreSQL

```bash
# Update package list
sudo apt update

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Check version (should show 14+)
psql --version

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql  # Auto-start on boot

# Verify it's running
sudo systemctl status postgresql
```

**Expected output:** Should show "active (running)" in green.

---

## Step 3: Create Database and User

```bash
# Switch to postgres user
sudo -u postgres psql
```

**In the psql prompt**, run these commands (copy/paste all at once):

```sql
CREATE DATABASE gladiators;
CREATE USER gladiators_user WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE gladiators TO gladiators_user;
\c gladiators
GRANT ALL ON SCHEMA public TO gladiators_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gladiators_user;
\q
```

**Important:** Replace `'your_secure_password_here'` with a strong password. Write it down - you'll need it for the `.env` file.

**Expected output:** Should see "CREATE DATABASE", "CREATE ROLE", "GRANT" messages, then exit back to bash.

---

## Step 4: Configure PostgreSQL Authentication

```bash
# Edit PostgreSQL config
sudo nano /etc/postgresql/14/main/pg_hba.conf
```

**Find this line** (around line 90):
```
local   all             all                                     peer
```

**Add this line** right after it:
```
local   all             all                                     md5
```

**Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

**Restart PostgreSQL:**
```bash
sudo systemctl restart postgresql
```

---

## Step 5: Test Database Connection

```bash
# Test connection (will prompt for password)
psql -U gladiators_user -d gladiators -h localhost
```

**Enter the password** you created in Step 3.

**If it works**, you'll see:
```
gladiators=>
```

**Exit:**
```sql
\q
```

---

## Step 6: Navigate to Project and Pull Latest Code

```bash
cd ~/gladiators
git pull origin main
```

**Expected output:** Should pull the latest changes including database migration code.

---

## Step 7: Install Node.js Dependencies

```bash
npm install
```

**Expected output:** Should install `pg` package and show "added 1 package".

---

## Step 8: Update .env File

```bash
# Edit .env file
nano .env
```

**Add these lines** (keep your existing CLASH_ROYALE_API_KEY):
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gladiators
DB_USER=gladiators_user
DB_PASSWORD=your_secure_password_here
```

**Replace `your_secure_password_here`** with the password from Step 3.

**Save and exit:** `Ctrl+X`, then `Y`, then `Enter`

---

## Step 9: Stop the Service (Temporarily)

```bash
sudo systemctl stop gladiators
```

**Verify it's stopped:**
```bash
sudo systemctl status gladiators
```

Should show "inactive (dead)".

---

## Step 10: Run Migration Script

```bash
node scripts/migrate-to-postgres.js
```

**Expected output:**
```
🚀 Starting PostgreSQL migration...

📐 Initializing database schema...
✅ Database schema initialized

💾 Creating backups...
✅ Backed up: members.json → members.json.backup
✅ Backed up: war-history.json → war-history.json.backup
✅ Backed up: war-snapshots.json → war-snapshots.json.backup

📋 Migrating members...
✅ Migrated 71 members

📋 Migrating war history...
✅ Migrated X war weeks and Y participants

📋 Migrating war snapshots...
✅ Migrated Z snapshots

🔍 Verifying migration...
   Members: 71
   War weeks: X
   Participants: Y
   Snapshots: Z

✅ Migration complete!
```

**If you see errors**, check:
- Database is running: `sudo systemctl status postgresql`
- `.env` file has correct credentials
- You can connect: `psql -U gladiators_user -d gladiators -h localhost`

---

## Step 11: Verify Data in Database

```bash
psql -U gladiators_user -d gladiators -h localhost
```

**Run these queries:**

```sql
-- Count members
SELECT COUNT(*) FROM members;

-- Count war weeks
SELECT COUNT(*) FROM war_weeks;

-- Count participants
SELECT COUNT(*) FROM war_participants;

-- Check a few member names
SELECT tag, name, is_current FROM members LIMIT 10;

-- Exit
\q
```

**Expected:** Should match the numbers from migration output.

---

## Step 12: Update Member Names

```bash
node scripts/update-member-names.js
```

**Expected output:**
```
🔄 Updating member names...

✅ Updated: #20YL8PG2UY → womplex
✅ Updated: #JGYCJCGL → ShadowFang
...
📊 Summary:
   Updated: 22
   Created: 0
   Errors: 0

✅ Done!
```

---

## Step 13: Restart the Service

```bash
sudo systemctl start gladiators
sudo systemctl status gladiators
```

**Expected output:** Should show "active (running)" in green.

**Check logs:**
```bash
sudo journalctl -u gladiators -n 50 --no-pager
```

**Look for:**
- ✅ "Connected to PostgreSQL database"
- ✅ "Database initialized"
- ✅ "Loaded X war weeks from database"
- ❌ No error messages about database connection

---

## Step 14: Test the Website

1. **Open your website** in a browser
2. **Check that data loads** (war table, members, etc.)
3. **Verify Demotion Watch** only shows current members
4. **Check member names** are correct

---

## Troubleshooting

### Database Connection Errors

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check connection
psql -U gladiators_user -d gladiators -h localhost

# Check logs
sudo journalctl -u postgresql -n 50
```

### Service Won't Start

```bash
# Check service logs
sudo journalctl -u gladiators -n 100

# Check if port 3000 is in use
sudo netstat -tlnp | grep 3000

# Try starting manually to see errors
cd ~/gladiators
node server.js
```

### Migration Fails

```bash
# Check database exists
psql -U gladiators_user -d gladiators -h localhost -c "\dt"

# Check .env file
cat .env | grep DB_

# Verify JSON backups exist
ls -la data/*.backup
```

---

## Rollback (If Needed)

If something goes wrong:

```bash
# Stop service
sudo systemctl stop gladiators

# Revert to v1.12
cd ~/gladiators
git checkout v1.12

# Restore JSON files (if needed)
cp data/members.json.backup data/members.json
cp data/war-history.json.backup data/war-history.json
cp data/war-snapshots.json.backup data/war-snapshots.json

# Restart service
sudo systemctl start gladiators
```

---

## Success Checklist

- [ ] PostgreSQL installed and running
- [ ] Database and user created
- [ ] `.env` file updated with DB credentials
- [ ] `npm install` completed
- [ ] Migration script ran successfully
- [ ] Data verified in database
- [ ] Member names updated
- [ ] Service restarted
- [ ] Website loads correctly
- [ ] No errors in logs

---

**You're all set!** 🎉

If you run into any issues, check the troubleshooting section or let me know what error you're seeing.
