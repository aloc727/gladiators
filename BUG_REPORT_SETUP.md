# Bug report setup

Submitted bug reports are **emailed** to you so you can find them in one place.

## Where reports go

- Each submission is sent to the address in **BUG_REPORT_EMAIL**.
- You’ll get one email per report with subject like: `[Gladiators] Bug report 2025-03-05T12:34:56`.
- The body is the full report (session info + optional user description).

## Netlify (production)

1. **Resend** (free tier is enough):
   - Sign up at [resend.com](https://resend.com) and create an API key.
   - Optionally add and verify your domain, or use `onboarding@resend.dev` as sender for testing.

2. **Environment variables** in Netlify (Site settings → Environment variables):

   - **RESEND_API_KEY** – your Resend API key.
   - **BUG_REPORT_EMAIL** – email address that receives reports (e.g. your personal or team inbox).
   - **BUG_REPORT_FROM** (optional) – sender string, e.g. `Gladiators <notifications@yourdomain.com>`. Default: `Gladiators Bug Reporter <onboarding@resend.dev>`.

3. Redeploy so the function uses the new env vars.

## Local dev (server.js)

Use the same env vars in your `.env` file:

- **RESEND_API_KEY**
- **BUG_REPORT_EMAIL**
- **BUG_REPORT_FROM** (optional)

Then run `npm start` (or `npm run dev`). Submissions from the app will send to **BUG_REPORT_EMAIL** via Resend.

## If bug report is not configured

If **RESEND_API_KEY** or **BUG_REPORT_EMAIL** is missing, the API returns 503 and the UI shows: “Bug report is not configured yet.” No email is sent until both are set.
