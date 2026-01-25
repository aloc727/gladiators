# PostgreSQL Database Connection Guide

## Connection Details

To connect to your PostgreSQL database on EC2, you'll need these details from your `.env` file:

```
Host: [Your EC2 Elastic IP or domain]
Port: 5432 (default PostgreSQL port)
Database: gladiators
Username: gladiators_user
Password: [From your .env DB_PASSWORD]
```

## Option 1: Direct Connection (if PostgreSQL is exposed)

**Note:** By default, PostgreSQL only accepts local connections. You'll need to either:
- Use SSH tunneling (recommended for security)
- Or configure PostgreSQL to accept remote connections (requires firewall/security group changes)

## Option 2: SSH Tunnel (Recommended - Most Secure)

### Using DBeaver:

1. Install DBeaver: `brew install --cask dbeaver-community`
2. Open DBeaver
3. Click "New Database Connection" → Select "PostgreSQL"
4. In the connection settings:
   - **Host:** `localhost` (or `127.0.0.1`)
   - **Port:** `5432`
   - **Database:** `gladiators`
   - **Username:** `gladiators_user`
   - **Password:** [Your DB_PASSWORD from .env]
5. Go to **SSH** tab:
   - Check "Use SSH Tunnel"
   - **Host:** [Your EC2 Elastic IP]
   - **Port:** `22`
   - **User Name:** `ubuntu` (or your EC2 username)
   - **Authentication Method:** Key pair
   - **Private Key:** Browse to your `.pem` file
6. Click "Test Connection" → Should succeed!
7. Click "Finish"

### Using TablePlus:

1. Install TablePlus: `brew install --cask tableplus`
2. Click "Create a new connection" → PostgreSQL
3. Fill in connection details:
   - **Name:** Gladiators DB
   - **Host:** `localhost`
   - **Port:** `5432`
   - **User:** `gladiators_user`
   - **Password:** [Your DB_PASSWORD]
   - **Database:** `gladiators`
4. Go to **SSH** tab:
   - Enable "Use SSH Tunnel"
   - **SSH Host:** [Your EC2 Elastic IP]
   - **SSH Port:** `22`
   - **SSH User:** `ubuntu`
   - **SSH Key:** Select your `.pem` file
5. Click "Test" → Should connect!

### Using pgAdmin:

1. Install pgAdmin: `brew install --cask pgadmin4`
2. Open pgAdmin
3. Right-click "Servers" → "Register" → "Server"
4. General tab:
   - **Name:** Gladiators DB
5. Connection tab:
   - **Host name/address:** `localhost`
   - **Port:** `5432`
   - **Maintenance database:** `gladiators`
   - **Username:** `gladiators_user`
   - **Password:** [Your DB_PASSWORD]
6. SSH Tunnel tab:
   - Check "Use SSH Tunnel"
   - **Tunnel host:** [Your EC2 Elastic IP]
   - **Tunnel port:** `22`
   - **Username:** `ubuntu`
   - **Authentication:** Key file
   - **Key file:** Browse to your `.pem` file
7. Click "Save"

## Option 3: Manual SSH Tunnel (Command Line)

If your GUI tool doesn't support SSH tunneling, create a tunnel manually:

```bash
# Create SSH tunnel (run this in a terminal, keep it open)
ssh -i /path/to/your-key.pem -L 5432:localhost:5432 ubuntu@[YOUR_EC2_IP]

# Then connect to:
# Host: localhost
# Port: 5432
# Database: gladiators
# Username: gladiators_user
# Password: [Your DB_PASSWORD]
```

## Finding Your Connection Details

To get your exact connection details, SSH into EC2 and check:

```bash
# SSH into EC2
ssh -i /path/to/your-key.pem ubuntu@[YOUR_EC2_IP]

# Check PostgreSQL is running
sudo systemctl status postgresql

# View database name
sudo -u postgres psql -c "\l"

# View users
sudo -u postgres psql -c "\du"

# Check your .env file (if you have access)
cat ~/gladiators/.env | grep DB_
```

## Quick Start: DBeaver (Recommended)

1. **Install:**
   ```bash
   brew install --cask dbeaver-community
   ```

2. **Open DBeaver** and create new PostgreSQL connection with SSH tunnel (see instructions above)

3. **Browse your data:**
   - Expand `gladiators` database
   - Expand `Schemas` → `public` → `Tables`
   - You'll see: `members`, `war_weeks`, `war_participants`, `war_snapshots`
   - Right-click any table → "View Data" to see the data

4. **Run queries:**
   - Right-click database → "SQL Editor" → "New SQL Script"
   - Write queries like:
     ```sql
     SELECT * FROM war_weeks ORDER BY end_date DESC LIMIT 10;
     SELECT COUNT(*) FROM war_participants;
     SELECT * FROM members WHERE is_current = true;
     ```

## Troubleshooting

**Connection refused:**
- Make sure PostgreSQL is running: `sudo systemctl status postgresql` on EC2
- Check SSH tunnel is active
- Verify security group allows SSH (port 22)

**Authentication failed:**
- Double-check username and password from `.env` file
- Verify user exists: `sudo -u postgres psql -c "\du"` on EC2

**Can't find .pem file:**
- Your SSH key should be in your Dropbox folder or Downloads
- Make sure it has correct permissions: `chmod 400 /path/to/key.pem`
