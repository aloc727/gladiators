# Gladiators Clan War Stats

A website to display weekly war battle scores for clan members using the Clash Royale API.

## Setup

1. **Get an API Key**
   - Visit [Clash Royale Developer Portal](https://developer.clashroyale.com/)
   - Sign up and create a new API key
   - Copy your API key

2. **Install Dependencies** (if needed)
   ```bash
   npm install
   ```
   Note: This project only uses Node.js built-in modules, so no installation is required.

3. **Configure API Key (SECURE METHOD)**
   - **Option 1: Using .env file (Recommended)**
     ```bash
     # Copy the example file
     cp .env.example .env
     
     # Edit .env and add your API key
     # CLASH_ROYALE_API_KEY=your-api-key-here
     
     # Set secure file permissions
     chmod 600 .env
     ```
   
   - **Option 2: Environment variable**
     ```bash
     export CLASH_ROYALE_API_KEY=your-api-key-here
     ```
   
   ⚠️ **SECURITY WARNING**: Never hardcode your API key in source code files!
   
   See `SECURITY.md` for detailed security best practices.

4. **Run the Server**
   ```bash
   node server.js
   ```
   Or:
   ```bash
   npm start
   ```

5. **Open the Website**
   - Navigate to `http://localhost:3000` in your web browser
   - Click "Refresh Data" to load clan war statistics

## Features

- Displays all clan members in rows
- Shows weekly war points in columns
- Sortable by any column (click column header to sort high-to-low, click again for low-to-high)
- Players not in war for a week show 0 points
- Modern, responsive design
- Automatic data refresh capability
 - Auto-refresh every 5 minutes with countdown timer
- Local historical storage (JSON file) when war log endpoint is disabled (up to 5 years)

## API Endpoints Used

- `GET /clans/{clanTag}` - Get clan members
- `GET /clans/{clanTag}/warlog` - Get war history (temporarily disabled by API)
- `GET /clans/{clanTag}/currentriverrace` - Fallback when war log is disabled

## Project Structure

- `index.html` - Main HTML page
- `styles.css` - Styling
- `app.js` - Frontend JavaScript (data fetching and table rendering)
- `server.js` - Local backend server (handles API calls to avoid CORS issues)
- `netlify/functions/*` - Serverless functions for Netlify deployment
- `netlify.toml` - Netlify config and API redirects
- `package.json` - Node.js project configuration

## Notes

- The Clash Royale API requires authentication via Bearer token
- API rate limits apply (check your API key limits)
- War log endpoint is currently disabled by Clash Royale API; the app uses river race data as a fallback
- Local history is stored in `data/war-history.json` (not committed to git)
- The server runs on port 3000 by default (change in `server.js` if needed)

## Background Notes

- v1.8.0: Added /summary and /players tabs, moved promo/demotion cards to homepage, thermometer widget
- v1.9.0: Thermometer label order + N/A in charts, track joinedAt for members
- v1.10.0: Store raw warlog entries for full historical details when available
- v1.10.0: Preserve full participant fields when warlog returns
- v1.10.0: Store full warlog participant data when endpoint returns

## Netlify Deployment

This project is ready for Netlify:

- Static site served from `/`
- API calls routed to Netlify Functions via `netlify.toml`
- Set environment variables in Netlify:
  - `CLASH_ROYALE_API_KEY`
  - `CLAN_TAG` (optional)

See `DEPLOYMENT.md` for full steps and DNS setup with Namecheap.
