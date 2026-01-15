# Auto-Refresh Feature

## Overview

The website now includes an **auto-refresh** feature that automatically updates the war statistics every 5 minutes to keep the data live and up-to-date.

## How It Works

- **Refresh Interval**: Every 5 minutes (300 seconds)
- **Default**: Auto-refresh is **enabled by default**
- **Toggle**: You can enable/disable it using the checkbox in the top-right corner
- **Countdown**: Shows "Next refresh in: X:XX" so you know when the next update will happen
- **Manual Refresh**: Clicking "Refresh Data" resets the timer

## API Rate Limits

The Clash Royale API has rate limits to prevent abuse:
- **Typical limits**: ~100 requests per 10 seconds per IP address
- **Our setting**: 5 minutes between refreshes (very conservative)
- **Why**: This ensures we never hit rate limits and are respectful to the API

## Configuration

To change the refresh interval, edit `app.js`:

```javascript
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
```

Change `5` to your desired number of minutes.

## Considerations

1. **Browser Tab**: The auto-refresh only works when the browser tab is open and active
2. **Network**: Requires an active internet connection
3. **API Availability**: If the API is down, the refresh will fail gracefully and retry after the interval
4. **Data Freshness**: War data typically updates when wars end (Sundays at 4:30am CT), so more frequent refreshes won't show new data until then

## Disabling Auto-Refresh

Simply uncheck the "Auto-refresh" checkbox. The page will stop automatically updating, but you can still manually refresh using the "Refresh Data" button.
