# Security Guide

## 🔒 API Key Security

**CRITICAL: Your API key is sensitive and must be protected.**

### Best Practices

1. **NEVER commit your API key to version control**
   - The `.env` file is already in `.gitignore`
   - Never add your API key to `server.js` or any other code file
   - Never share your API key in screenshots, logs, or messages

2. **Use Environment Variables Only**
   - Store your API key in a `.env` file (see `.env.example`)
   - Or set it as an environment variable: `export CLASH_ROYALE_API_KEY=your-key`
   - The server will automatically load from `.env` if it exists

3. **File Permissions**
   - Ensure `.env` has restricted permissions:
     ```bash
     chmod 600 .env
     ```

4. **If Your Key is Compromised**
   - Immediately revoke it at https://developer.clashroyale.com/
   - Generate a new API key
   - Update your `.env` file with the new key

## 🛡️ Security Features Implemented

- ✅ API key stored only in environment variables
- ✅ API key never logged or exposed in error messages
- ✅ Input validation to prevent SSRF attacks
- ✅ Request timeouts to prevent hanging connections
- ✅ Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- ✅ Error message sanitization
- ✅ CORS configuration

## 🚨 Production Deployment

If deploying to production:

1. **Use HTTPS** - Never transmit API keys over HTTP
2. **Restrict CORS** - Set `ALLOWED_ORIGIN` to your specific domain
3. **Rate Limiting** - Consider adding rate limiting middleware
4. **Secrets Management** - Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
5. **Environment Variables** - Use your hosting platform's environment variable system
6. **Monitoring** - Set up alerts for failed authentication attempts

## 📝 Setup Instructions

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your API key:
   ```
   CLASH_ROYALE_API_KEY=your-actual-api-key-here
   ```

3. Set proper file permissions:
   ```bash
   chmod 600 .env
   ```

4. Start the server:
   ```bash
   node server.js
   ```

## 🔍 Verification

To verify your API key is secure:

- ✅ Check that `.env` is in `.gitignore`
- ✅ Verify `.env` is not tracked by git: `git status`
- ✅ Confirm API key is not in any code files: `grep -r "your-api-key" .`
- ✅ Check server logs don't show the full key (only first/last 4 chars)
