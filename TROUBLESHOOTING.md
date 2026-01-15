# Troubleshooting Guide

## "Clan not found" Error

If you see "Clan not found. Please verify the clan tag", check:

### 1. Verify Your Clan Tag
- The clan tag should be exactly as shown in-game (case-sensitive)
- Make sure there are no extra spaces or characters
- Current tag in code: `#2CPPJLJ`

### 2. Check API Key Permissions
- Your API key needs permission to access clan data
- Go to https://developer.clashroyale.com/ and verify your API key is active
- Make sure your API key has the correct IP whitelist (if required)

### 3. Test the API Directly
You can test if your API key works by running:
```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     "https://api.clashroyale.com/v1/clans/%232CPPJLJ"
```

Replace `YOUR_API_KEY` with your actual key from the `.env` file.

### 4. Common Issues
- **Wrong clan tag**: Double-check the tag in-game
- **API key expired**: Generate a new key if needed
- **IP restrictions**: Make sure your IP is whitelisted (if your API key has IP restrictions)
- **Rate limiting**: Wait a few minutes if you've made too many requests

### 5. Check Server Logs
Look at your server terminal output for more detailed error messages. The server will show:
- Whether the API key is configured
- What endpoint is being called
- Any error details from the API
