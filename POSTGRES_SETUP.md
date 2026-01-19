# PostgreSQL Setup & Migration Guide

## Why PostgreSQL?

- ✅ **Production-grade** database (used by major companies)
- ✅ **Excellent concurrency** (handles multiple connections well)
- ✅ **Advanced features** (JSONB queries, full-text search, etc.)
- ✅ **Scalable** (can move to RDS or separate server later)
- ✅ **Robust** (ACID, transactions, foreign keys, constraints)

## EC2 Setup Steps

### 1. Install PostgreSQL

```bash
# Update package list
sudo apt update

# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Check version (should be 14+)
psql --version

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql  # Auto-start on boot
```

### 2. Create Database and User

```bash
# Switch to postgres user
sudo -u postgres psql

# In psql prompt, run:
CREATE DATABASE gladiators;
CREATE USER gladiators_user WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE gladiators TO gladiators_user;

# Grant schema privileges (for creating tables)
\c gladiators
GRANT ALL ON SCHEMA public TO gladiators_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO gladiators_user;

# Exit psql
\q
```

### 3. Configure PostgreSQL for Local Connections

```bash
# Edit pg_hba.conf (host-based authentication)
sudo nano /etc/postgresql/14/main/pg_hba.conf

# Find the line:
# local   all             all                                     peer

# Add this line (allows password auth for local connections):
local   all             all                                     md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### 4. Test Connection

```bash
# Test from command line
psql -U gladiators_user -d gladiators -h localhost

# If it asks for password and connects, you're good!
# Exit with: \q
```

## Node.js Setup

### 1. Install pg (PostgreSQL client for Node.js)

```bash
cd ~/gladiators
npm install pg
```

### 2. Create `.env` entry for database

Add to your `.env` file:
```
DATABASE_URL=postgresql://gladiators_user:your_secure_password_here@localhost:5432/gladiators
```

Or separate variables:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gladiators
DB_USER=gladiators_user
DB_PASSWORD=your_secure_password_here
```

## Database Schema Creation

### 1. Create tables

```bash
cd ~/gladiators
psql -U gladiators_user -d gladiators -f db/schema-postgres.sql
```

Or from Node.js (we'll create a migration script):
```bash
node scripts/migrate-to-postgres.js
```

## Migration from JSON to PostgreSQL

### Migration Script

The migration script (`scripts/migrate-to-postgres.js`) will:
1. Read existing `data/members.json`
2. Read existing `data/war-history.json`
3. Read existing `data/war-snapshots.json`
4. Insert all data into PostgreSQL tables
5. Verify data integrity
6. Create backup of JSON files (rename to `.json.backup`)

### Run Migration

```bash
# Make sure PostgreSQL is running
sudo systemctl status postgresql

# Run migration
node scripts/migrate-to-postgres.js

# Verify data
psql -U gladiators_user -d gladiators -c "SELECT COUNT(*) FROM members;"
psql -U gladiators_user -d gladiators -c "SELECT COUNT(*) FROM war_weeks;"
psql -U gladiators_user -d gladiators -c "SELECT COUNT(*) FROM war_participants;"
```

## Security Considerations

### 1. Firewall (UFW)
PostgreSQL runs on port 5432. **Don't expose it publicly!**

```bash
# Check current rules
sudo ufw status

# PostgreSQL should only accept local connections (already default)
# If you see port 5432 open to public, close it:
sudo ufw deny 5432
```

### 2. Password Security
- Use a strong password (store in `.env`, never commit)
- Consider using `pgpass` file for password management
- Rotate passwords periodically

### 3. Backup Strategy

```bash
# Manual backup
pg_dump -U gladiators_user -d gladiators > backup_$(date +%Y%m%d).sql

# Restore from backup
psql -U gladiators_user -d gladiators < backup_20260119.sql
```

### 4. Automated Backups (Optional)

Create a cron job:
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * pg_dump -U gladiators_user -d gladiators > /home/ubuntu/backups/gladiators_$(date +\%Y\%m\%d).sql
```

## Advantages Over SQLite

1. **Concurrent Writes**: Multiple processes can write simultaneously
2. **JSONB Queries**: Can query inside JSON fields efficiently
3. **Better Performance**: For larger datasets (1000s of wars)
4. **Advanced Features**: Full-text search, arrays, custom types
5. **Production Ready**: Used by major applications

## Monitoring & Maintenance

### Check Database Size
```sql
SELECT pg_size_pretty(pg_database_size('gladiators'));
```

### Check Table Sizes
```sql
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Vacuum (Cleanup)
```sql
VACUUM ANALYZE;
```

## Troubleshooting

### Connection Refused
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check if it's listening
sudo netstat -tlnp | grep 5432
```

### Permission Denied
```bash
# Check pg_hba.conf settings
sudo cat /etc/postgresql/14/main/pg_hba.conf

# Verify user exists
sudo -u postgres psql -c "\du"
```

### Out of Memory
```bash
# Check PostgreSQL config
sudo nano /etc/postgresql/14/main/postgresql.conf

# Adjust shared_buffers, work_mem if needed
# Restart after changes
sudo systemctl restart postgresql
```
