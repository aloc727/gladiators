# Quick Start Guide - See Your Website Now! 🚀

## Step-by-Step Instructions

### Step 1: Open Terminal
- On Mac: Press `Cmd + Space`, type "Terminal", and press Enter
- Navigate to the project folder:
  ```bash
  cd "/Users/alocatelli/Dropbox/Documents Default/gladiators repository/gladiators"
  ```

### Step 2: Start the Server
Simply run:
```bash
node server.js
```

You should see:
```
Server running at http://localhost:3000/
Clan Tag: #2CPPJLJ

📊 DEMO MODE: Using sample data (no API key required)
```

### Step 3: Open in Browser
1. Open your web browser (Chrome, Safari, Firefox, etc.)
2. Go to: `http://localhost:3000`
3. You should see the website with demo data!

### Step 4: Try It Out!
- **Click any column header** to sort (high-to-low, then low-to-high)
- **Click "Refresh Data"** to reload
- Notice some players have 0 for certain weeks (they didn't participate)

### Step 5: Stop the Server
When you're done, press `Ctrl + C` in the terminal to stop the server.

---

## Using Real Data (Optional)

To see your actual clan data:

1. Get an API key from: https://developer.clashroyale.com/
2. Set it as an environment variable:
   ```bash
   export CLASH_ROYALE_API_KEY=your-api-key-here
   node server.js
   ```
3. Refresh the page - you'll see your real clan data!

---

## Troubleshooting

**"command not found: node"**
- Install Node.js from: https://nodejs.org/

**Port 3000 already in use**
- Change the PORT in `server.js` to a different number (like 3001)

**Page won't load**
- Make sure the server is running (you should see the console message)
- Check that you're going to `http://localhost:3000` (not https)
