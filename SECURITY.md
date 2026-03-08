# Security and Hardening

This document summarizes security measures and penetration-test considerations for the Gladiators Clan War Stats application.

## Client-side (browser)

### XSS prevention
- **Central escaping:** All user- or API-sourced data inserted into the DOM is passed through `escapeHtml()` before use in `innerHTML` or attribute values. This includes player names, tags, role labels, and date strings.
- **No unsanitized HTML:** Dynamic content is escaped for `&`, `<`, `>`, `"`, `'` to prevent script injection and attribute breakout.
- **Trusted content only:** Static strings (e.g. labels, tooltips) are controlled by the codebase, not user input.

### Data exposure (doxxing / privacy)
- The app displays **in-game clan data** (player names, tags, war scores, roles) that is already public to clan members via the game and API. No additional PII (email, real names, addresses) is collected or shown.
- **LocalStorage** is used only for UI preferences (e.g. `currentRange`, `currentMembersOnly`). No secrets or tokens are stored in the client.

### External links
- RoyaleAPI and GroupMe links open in a new tab with `rel="noopener noreferrer"` to reduce tab-napping and referrer leakage.

## Server-side (Node.js)

### Secrets and configuration
- **API key:** Clash Royale API key is read only from the environment (`CLASH_ROYALE_API_KEY`). It is never logged (except a masked preview in one startup message) and never sent to the client.
- **Database:** Credentials come from environment variables (`DB_PASSWORD`, etc.). The app coerces the password to a string so the driver never receives a non-string value.
- **`.env`:** Loaded only on the server; never served or exposed to the browser.

### Injection
- **SQL:** All database queries use **parameterized statements** (`$1`, `$2`, …). User or API data is never concatenated into SQL strings.
- **HTTP:** Responses use `Content-Type` correctly (JSON, HTML, or plain text). No user input is reflected into response headers in an exploitable way.

### HTTP security headers
- **X-Content-Type-Options: nosniff** – Prevents MIME sniffing.
- **X-Frame-Options: DENY** – Prevents embedding in iframes (clickjacking).
- **X-XSS-Protection: 1; mode=block** – Legacy XSS filter (in addition to escaping).
- **Referrer-Policy: strict-origin-when-cross-origin** – Limits referrer sent to other sites.
- **Permissions-Policy** – Restricts geolocation, microphone, camera, payment.
- **Content-Security-Policy** – Restricts script, style, font, image, and connect sources; `base-uri` and `form-action` set to `'self'`.
- **X-Powered-By** removed to avoid revealing server stack.

### Rate limiting
- **In-memory rate limit** per client IP: 120 requests per 60-second window. Responses with `429 Too Many Requests` and `Retry-After: 60` when exceeded. Reduces abuse and aggressive scraping.

### CORS
- API responses set CORS headers. Origin can be restricted via `ALLOWED_ORIGIN` (default `*` for same-origin or configured host).

## Deployment recommendations

1. **HTTPS:** Serve the site over HTTPS only (e.g. reverse proxy with TLS).
2. **Environment:** Keep `.env` (or equivalent) out of version control and restrict file permissions.
3. **Dependencies:** Run `npm audit` periodically and update dependencies for known vulnerabilities.
4. **Database:** Use a dedicated DB user with minimal required privileges; avoid shared production credentials with other services.

## Penetration-test checklist (summary)

- [x] No API key or DB credentials in client or responses.
- [x] All dynamic DOM content escaped via `escapeHtml()`.
- [x] Parameterized SQL only; no string concatenation for queries.
- [x] Security headers (CSP, X-Frame-Options, etc.) applied to responses.
- [x] Rate limiting on server to mitigate brute-force and scraping.
- [x] No sensitive PII beyond in-game clan data; localStorage used only for UI preferences.
- [ ] Run over HTTPS in production (deployment responsibility).
- [ ] Regular dependency and npm audit (operational).
