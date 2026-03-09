# Analytics page: setup and login

Step-by-step setup for the password-protected analytics page. No password is stored in the repo; you set it via environment variables.

---

## 1. Local development (.env)

**Where:** In your project root, file `.env` (create it from `.env.example` if you don’t have it).

**Add these two lines** (replace the example values with your own):

```
ANALYTICS_PASSWORD=your-chosen-analytics-password
ANALYTICS_SESSION_SECRET=any-long-random-string-for-the-cookie
```

- `ANALYTICS_PASSWORD`: the password you will type to open the analytics page.
- `ANALYTICS_SESSION_SECRET`: a random string (e.g. 32+ characters). It is stored in the session cookie; nobody needs to type it. Example: `openssl rand -hex 24` or a long random phrase.

**Exact location in `.env`:** Add them after your existing variables (e.g. after `CLASH_ROYALE_API_KEY=...`). Order does not matter.

**Then:** Restart your local server (`node server.js` or `npm start`) so it picks up the new env vars.

---

## 2. Netlify (production)

**Where:** Netlify dashboard → your site → **Site configuration** → **Environment variables** (or **Site settings** → **Environment variables**).

**Add two variables:**

| Key                     | Value                    | Scopes     |
|-------------------------|--------------------------|------------|
| `ANALYTICS_PASSWORD`    | same password you use locally (or a different one) | All (or Production) |
| `ANALYTICS_SESSION_SECRET` | same long random string as local (or a new one) | All (or Production) |

**Exact steps:**

1. Go to [app.netlify.com](https://app.netlify.com) and log in.
2. Click your **gladiators** site.
3. In the left sidebar: **Site configuration** → **Environment variables** (under “Build & deploy”).
4. Click **Add a variable** → **Add a single variable** (or **Add multiple**).
5. First variable:
   - **Key:** `ANALYTICS_PASSWORD`
   - **Value:** your analytics password (e.g. the same as in `.env`).
   - **Scopes:** check **All** (or at least **Production**).
   - Save.
6. Second variable:
   - **Key:** `ANALYTICS_SESSION_SECRET`
   - **Value:** the same long random string you put in `.env` (or a new one for production).
   - **Scopes:** All (or Production).
   - Save.

**Then:** Trigger a new deploy (e.g. **Deploys** → **Trigger deploy** → **Deploy site**) so the new env vars are used.

---

## 3. How to log in to the analytics page

**URL (local):** `http://localhost:3000/analytics.html`  
**URL (Netlify):** `https://your-site-name.netlify.app/analytics.html` (replace with your real Netlify URL)

**Exact steps:**

1. Open the analytics URL in your browser.
2. You’ll see a login box and a password field.
3. Type the password you set in `ANALYTICS_PASSWORD` (local or Netlify, depending on which you’re using).
4. Click the submit button (or press Enter).
5. If the password is correct, the page shows the analytics dashboard. A session cookie is set so you stay logged in for 24 hours; you won’t be asked again until it expires or you clear cookies.

**If it says “Incorrect password”:**

- Local: Check that `.env` has `ANALYTICS_PASSWORD=...` with no typos and no quotes around the value, and that you restarted the server.
- Netlify: Check the env var in Netlify, then trigger a new deploy and try again.

**If you never get the login box (e.g. blank or error):**

- Local: Ensure the server is running and you’re using `http://localhost:3000/analytics.html`.
- Netlify: Ensure `ANALYTICS_PASSWORD` and `ANALYTICS_SESSION_SECRET` are set and a new deploy has completed.

---

## Quick reference

| What              | Where / action |
|-------------------|----------------|
| Set password      | `.env` line: `ANALYTICS_PASSWORD=your-password` |
| Set cookie secret | `.env` line: `ANALYTICS_SESSION_SECRET=long-random-string` |
| Netlify vars      | Site → Site configuration → Environment variables → Add `ANALYTICS_PASSWORD` and `ANALYTICS_SESSION_SECRET` |
| Open analytics    | Go to `/analytics.html`, type password, submit |
