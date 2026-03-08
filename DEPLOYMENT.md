# Deployment Guide - Making Your Site Public

## Restarting the app (systemd)

```bash
sudo systemctl restart gladiators
```

## Database password (systemd / env)

The app reads `DB_PASSWORD` from the environment. **systemd does not load `.env` files.** To pass the password, use one of the options below.

### Option A – EnvironmentFile (recommended), literal steps

Do these on the server (e.g. SSH into your Ubuntu box). Replace `YOUR_DB_PASSWORD` with your real Postgres password everywhere; do not add quotes around it.

**Step 1 – Create the directory**
```bash
sudo mkdir -p /etc/gladiators
```

**Step 2 – Create the env file (put your real password after the `=`)**
```bash
echo 'DB_PASSWORD=YOUR_DB_PASSWORD' | sudo tee /etc/gladiators/env
```
Example: if your password is `abc123`, you type:  
`echo 'DB_PASSWORD=abc123' | sudo tee /etc/gladiators/env`

**Step 3 – Lock down the file**
```bash
sudo chmod 600 /etc/gladiators/env
```

**Step 4 – Open the systemd service file for editing**
```bash
sudo systemctl edit --full gladiators
```
If that opens a blank or wrong file, try:
```bash
sudo nano /etc/systemd/system/gladiators.service
```
(or use `sudo vi` if you use vi.)

**Step 5 – Add one line in the `[Service]` block**  
Find the line that says `[Service]`. Below it (or with the other Environment lines), add exactly this line on its own line:
```ini
EnvironmentFile=/etc/gladiators/env
```
Save and exit (in nano: Ctrl+O, Enter, then Ctrl+X; in vi: Esc, then `:wq`, Enter).

**Step 6 – Reload systemd and restart the app**
```bash
sudo systemctl daemon-reload
```
```bash
sudo systemctl restart gladiators
```

**Step 7 – Confirm it’s running and can connect to the DB**
```bash
sudo systemctl status gladiators
```
You should see `active (running)`. Then check the logs:
```bash
journalctl -u gladiators -n 30 --no-pager
```
You should see “Connected to PostgreSQL” and no “client password must be a string” (or similar) errors.

### Option B – Inline in service

In the service file, add:
   ```ini
   Environment=DB_PASSWORD=your_actual_password_here
   ```
   (Less ideal if the file is world-readable.)

Ensure the value is a plain string (no extra quotes in the env file). The app coerces `DB_PASSWORD` to a string so pg always receives a string.

**If you run schema by hand** (e.g. when the app can't connect): run the SQL in `db/schema-postgres.sql` for `promotion_history` and `demotion_history`, or use `scripts/apply-demotion-history.sql` for demotions only. To backfill a promotion (e.g. Peyton Milkner): run `scripts/record-peyton-promotion.sql` (or the INSERT from it) in your Postgres client.

## IP Address Restrictions & API Keys

### How It Works

**Important**: The API key IP restriction applies to the **server making the API calls**, NOT the users viewing the website.

- ✅ **Your server** makes API calls to Clash Royale API
- ✅ **Users' browsers** only talk to your server (not the API directly)
- ✅ As long as your **server's IP** matches the whitelist, it works for everyone

### Current Setup

Your API key is restricted to: `76.141.1.6`

This means:
- ✅ Works if your server runs from that IP (your laptop at home)
- ❌ Won't work if you deploy to a hosting service (different IP)

## Making It Public - Options

### Option 1: Keep Running Locally + Use a Tunnel (Easiest)

Use a service like **ngrok** to expose your local server:

1. **Install ngrok**: https://ngrok.com/
2. **Start your server**: `node server.js`
3. **In another terminal, run**: `ngrok http 3000`
4. **Share the ngrok URL** (e.g., `https://abc123.ngrok.io`) with your clan

**Pros**: 
- Free
- Easy setup
- No code changes needed
- IP restriction still works (server runs from your IP)

**Cons**: 
- URL changes each time (unless you pay for static URL)
- Your laptop must be on and running
- Less reliable for 24/7 access

### Option 2: Deploy to Netlify (Best for Public Access)

This project is now Netlify-ready using **Netlify Functions**:

- Static site hosted by Netlify
- API calls routed through `/.netlify/functions/*`
- No changes needed in the browser code

**Important about IP restrictions**:
- Netlify Functions **do not have a fixed IP address**
- That means IP whitelisting **won't work reliably**
- You should either **remove the IP restriction** or use a host with a **static IP**

**Important about storage**:
- Netlify Functions have **ephemeral storage**
- The simple JSON history file will **not persist**
- If you need historical data, use a host with a **persistent disk**

#### Netlify Setup (High-Level)

1. Push this repo to GitHub
2. Create a new site in Netlify and link the GitHub repo
3. Set environment variables in Netlify:
   - `CLASH_ROYALE_API_KEY`
   - `CLAN_TAG` (optional; defaults to `2CPPJLJ`)
4. Deploy
5. Point `gladiators.top` to Netlify (see DNS section below)

### Option 3: Deploy to a Host with Static IP (Alternative)

If you want to keep IP restrictions:

- Use a host that provides a static outbound IP
- Examples: DigitalOcean, AWS EC2, Render (paid tiers)
- Add that static IP to the Clash Royale API whitelist

### Option 4: Remove IP Restriction (Less Secure)

If you want maximum flexibility:

1. Go to your API key settings
2. Remove the IP address from "ALLOWED IP ADDRESSES" (leave it empty)
3. Now the API key works from any IP

**Warning**: This is less secure - if someone steals your API key, they can use it from anywhere.

## Testing Your Setup

1. **Check your server IP**:
   ```bash
   curl https://api.ipify.org
   ```

2. **Verify it matches** your API key's whitelist

3. **Test the API**:
   ```bash
   node test-api.js
   ```

## Troubleshooting

### "API authentication failed" Error

This usually means:
1. **IP mismatch**: Your server's IP doesn't match the whitelist
2. **Invalid API key**: Check your `.env` file
3. **Expired key**: Generate a new one

### Users Can't Access the Site

- If using `localhost:3000`: Only works on your computer
- Use ngrok or deploy to a hosting service
- Make sure your server is running
- Check firewall settings

## Recommended Approach

For a clan website that others can access:

1. **Short term**: Use ngrok to share with your clan
2. **Long term**: Deploy to Netlify (simple + public)
3. **Remove IP restriction** or move to a host with a static IP

## DNS Setup for Namecheap + Netlify

Once Netlify creates your site, it will provide a default URL like:

`https://your-site-name.netlify.app`

To connect `gladiators.top`:

1. In Netlify:
   - Go to **Domain settings** → **Add custom domain**
   - Add `gladiators.top`
   - Netlify will show you DNS records to add

2. In Namecheap:
   - Go to **Domain List** → **Manage** → **Advanced DNS**
   - Add the records Netlify provides (usually CNAME + A records)
   - Example (Netlify often provides these):
     - `CNAME` for `www` → `your-site-name.netlify.app`
     - `A` records for root `@` → Netlify IPs

3. Wait for DNS propagation (15–60 minutes typically)
