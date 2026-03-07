# Run the historic data import on EC2

The database lives on EC2, so run the import script **on the EC2 server** so it can connect to PostgreSQL.

---

## 1. Log in to EC2

Open **Terminal** on your Mac and run:

```bash
ssh -i /Users/alicelocatelli/Downloads/gladiators-key.pem ubuntu@YOUR_EC2_IP
```

**Replace** `YOUR_EC2_IP` with your EC2 Elastic IP (the same one you use in DBeaver for the SSH tunnel).

First time you may see “Are you sure you want to continue connecting?” — type `yes` and press Enter.

You’re logged in when the prompt changes to something like `ubuntu@ip-172-31-xx-xx:~$`.

---

## 2. Get the script and CSV on EC2

**Option A – Repo already on EC2 (e.g. `~/gladiators`)**

If you already deploy from this repo on the server:

```bash
cd ~/gladiators
git pull origin main
```

Then copy the CSV from your Mac to EC2 (run this **on your Mac** in a **new** terminal tab):

```bash
scp -i /Users/alicelocatelli/Downloads/gladiators-key.pem ~/Downloads/2026.03.06\ -\ Gladiators\ Historic\ Data\ Upload.csv ubuntu@YOUR_EC2_IP:~/gladiators/data/
```

On EC2, create the folder if needed:

```bash
mkdir -p ~/gladiators/data
```

Then run the scp from your Mac. After that, back on EC2:

```bash
cd ~/gladiators
ls data/
# you should see the CSV
```

**Option B – Repo not on EC2 yet**

On EC2:

```bash
cd ~
git clone https://github.com/aloc727/gladiators.git
cd gladiators
```

Then from your **Mac** (new terminal), copy the CSV:

```bash
scp -i /Users/alicelocatelli/Downloads/gladiators-key.pem ~/Downloads/2026.03.06\ -\ Gladiators\ Historic\ Data\ Upload.csv ubuntu@YOUR_EC2_IP:~/gladiators/data/
```

On EC2:

```bash
mkdir -p ~/gladiators/data
# then run the scp from Mac, then:
cd ~/gladiators
```

---

## 3. Install Node and dependencies on EC2 (if needed)

On EC2:

```bash
cd ~/gladiators
node --version
```

- If you see a version (e.g. `v18.x`): skip to step 4.
- If you see “command not found”: install Node:

```bash
sudo apt update
sudo apt install -y nodejs npm
cd ~/gladiators
npm install
```

---

## 4. Set up .env on EC2

The script needs database credentials. If `~/gladiators/.env` already exists on EC2 (from your app), you’re set. If not:

```bash
cd ~/gladiators
nano .env
```

Add (use your real DB password):

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=gladiators
DB_USER=gladiators_user
DB_PASSWORD=your_actual_db_password
```

Save: `Ctrl+O`, Enter, then `Ctrl+X`.

---

## 5. Run the import

On EC2:

```bash
cd ~/gladiators
node scripts/import-spreadsheet-wars.js ~/gladiators/data/2026.03.06\ -\ Gladiators\ Historic\ Data\ Upload.csv
```

Or if the CSV is in the default path the script expects:

```bash
# Copy CSV into place if you put it somewhere else:
cp "/path/where/you/put/it/2026.03.06 - Gladiators Historic Data Upload.csv" ~/gladiators/data/
node scripts/import-spreadsheet-wars.js
```

You should see something like: “Done. Members upserted: … Participant rows upserted: …”

**Optional – dry run first (no DB write):**

```bash
node scripts/import-spreadsheet-wars.js ~/gladiators/data/2026.03.06\ -\ Gladiators\ Historic\ Data\ Upload.csv --dry-run
```

---

## 6. Log out of EC2

```bash
exit
```

---

## Quick reference

| Step        | Where  | Command |
|------------|--------|---------|
| Log in     | Mac    | `ssh -i /Users/alicelocatelli/Downloads/gladiators-key.pem ubuntu@EC2_IP` |
| Copy CSV   | Mac    | `scp -i /Users/alicelocatelli/Downloads/gladiators-key.pem ~/Downloads/2026.03.06\ -\ Gladiators\ Historic\ Data\ Upload.csv ubuntu@EC2_IP:~/gladiators/data/` |
| Install deps | EC2  | `cd ~/gladiators && npm install` |
| Run import | EC2    | `node scripts/import-spreadsheet-wars.js ~/gladiators/data/2026.03.06\ -\ Gladiators\ Historic\ Data\ Upload.csv` |
| Log out    | EC2    | `exit` |
