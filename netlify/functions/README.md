# Netlify Functions

These functions proxy Clash Royale API calls so the public site can access data securely.

- `clan-members.js` -> `GET /api/clan/members`
- `clan-warlog.js` -> `GET /api/clan/warlog`

Environment variables required in Netlify:
- `CLASH_ROYALE_API_KEY`
- `CLAN_TAG` (optional; defaults to 2CPPJLJ)
