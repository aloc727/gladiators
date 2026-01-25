# DBeaver Connection Setup - Step by Step

## Prerequisites

You'll need:
1. Your EC2 Elastic IP address
2. Your SSH key (.pem file) - usually in Dropbox or Downloads
3. Database credentials from your `.env` file on EC2

## Step-by-Step Connection

### Step 1: Open DBeaver and Create New Connection

1. Open **DBeaver** on your Mac
2. Click the **"New Database Connection"** button (plug icon) in the toolbar, OR
3. Go to **Database** → **New Database Connection**

### Step 2: Select PostgreSQL

1. In the connection wizard, scroll down and select **PostgreSQL**
2. Click **Next**

### Step 3: Configure Main Connection Settings

In the **Main** tab, fill in:

- **Host:** `localhost` (we'll use SSH tunnel, so this stays localhost)
- **Port:** `5432`
- **Database:** `gladiators`
- **Username:** `gladiators_user`
- **Password:** [Enter your password from `.env` file - `DB_PASSWORD`]

**Note:** Don't click "Test Connection" yet - we need to set up SSH first!

### Step 4: Configure SSH Tunnel

1. Click on the **SSH** tab (at the top of the connection window)
2. Check the box: **"Use SSH Tunnel"**
3. Fill in SSH settings:
   - **Host:** [Your EC2 Elastic IP address]
   - **Port:** `22`
   - **User Name:** `ubuntu` (or `ec2-user` if you're on Amazon Linux)
   - **Authentication Method:** Select **"Public Key"**
   - **Private Key:** Click **"Browse"** and navigate to your `.pem` file
     - Usually in: `~/Dropbox/...` or `~/Downloads/`
     - File will be named something like: `gladiators-key.pem` or `your-key.pem`

### Step 5: Test Connection

1. Click **"Test Connection"** button at the bottom
2. DBeaver will:
   - First connect via SSH (you might see a prompt about the host key - click "Yes")
   - Then connect to PostgreSQL through the tunnel
3. If successful, you'll see: **"Connected"** ✅
4. If it fails, check the error message (see Troubleshooting below)

### Step 6: Save and Connect

1. Click **"Finish"**
2. Your connection will appear in the Database Navigator (left sidebar)
3. Expand it to see: `gladiators` → `Schemas` → `public` → `Tables`

## Finding Your Connection Details

If you need to find your database credentials, SSH into EC2:

```bash
# SSH into EC2
ssh -i /path/to/your-key.pem ubuntu@[YOUR_EC2_IP]

# View your .env file
cat ~/gladiators/.env | grep DB_
```

You'll see something like:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gladiators
DB_USER=gladiators_user
DB_PASSWORD=your_actual_password_here
```

## Viewing Your Data

Once connected:

1. **Expand the connection** in the left sidebar
2. Navigate: `gladiators` → `Schemas` → `public` → `Tables`
3. You'll see 4 tables:
   - `members` - All clan members (current + former)
   - `war_weeks` - War week metadata
   - `war_participants` - Player stats for each war
   - `war_snapshots` - Minute-by-minute snapshots around war end

4. **View table data:**
   - Right-click any table → **"View Data"**
   - Or double-click the table

5. **Run SQL queries:**
   - Right-click `gladiators` database → **"SQL Editor"** → **"New SQL Script"**
   - Write queries like:
     ```sql
     -- See all war weeks
     SELECT * FROM war_weeks ORDER BY end_date DESC LIMIT 10;
     
     -- Count participants per week
     SELECT ww.id, ww.end_date, COUNT(wp.id) as participant_count
     FROM war_weeks ww
     LEFT JOIN war_participants wp ON ww.id = wp.war_week_id
     GROUP BY ww.id, ww.end_date
     ORDER BY ww.end_date DESC;
     
     -- See current members
     SELECT * FROM members WHERE is_current = true;
     ```

## Troubleshooting

### "Connection refused" or "Connection timeout"
- **Check SSH tunnel:** Make sure your EC2 IP is correct
- **Check SSH key:** Verify the `.pem` file path is correct
- **Check security group:** EC2 security group must allow SSH (port 22) from your IP

### "Authentication failed" for PostgreSQL
- **Check password:** Make sure you're using the exact password from `.env` file
- **Check username:** Should be `gladiators_user` (not `postgres`)
- **Verify user exists:** On EC2, run: `sudo -u postgres psql -c "\du"`

### "Host key verification failed"
- Click **"Yes"** when prompted about the host key
- Or go to SSH tab → Advanced → check "Skip host verification" (less secure)

### "Could not find SSH key"
- Make sure the `.pem` file path is correct
- Try using the full path: `/Users/yourname/Dropbox/path/to/key.pem`
- Check file permissions (should be readable)

### "PostgreSQL not running"
- SSH into EC2 and check: `sudo systemctl status postgresql`
- If not running: `sudo systemctl start postgresql`

## Quick Connection Checklist

- [ ] DBeaver installed and open
- [ ] EC2 Elastic IP address ready
- [ ] SSH key (.pem file) location known
- [ ] Database password from `.env` file ready
- [ ] SSH tunnel configured in DBeaver
- [ ] Connection tested successfully
- [ ] Can see tables in Database Navigator

## Next Steps

Once connected, you can:
- Browse and edit data visually
- Run SQL queries
- Export data to CSV/Excel
- View table structures and relationships
- Check data quality and fix any issues
