# Bug report setup

Bug reports are submitted via **Netlify Forms**. No Resend or environment variables are required.

## Production (Netlify)

1. The site includes a hidden form named `bug-report` with `data-netlify="true"`.
2. When a user submits from the "Report bug" modal, the app POSTs to `/` with the report body. Netlify captures it as a form submission.
3. **View reports:** Netlify dashboard → your site → **Forms** → **bug-report**. Submissions appear there with the full report text in the `report` field.

No env vars, no email setup. Netlify’s free tier includes form submissions.

## Local dev (server.js)

When you run `npm start`, POSTs to `/` with `form-name=bug-report` are handled by the local server. Each report is appended to **`data/bug_reports.jsonl`** (one JSON object per line: `{"at":"...","report":"..."}`). The `data/` directory is in `.gitignore`.

To view local reports, open `data/bug_reports.jsonl` in an editor, or run e.g. `tail -n 5 data/bug_reports.jsonl`.

## Optional: Resend (legacy)

The `/api/bug-report` endpoint and Resend integration are still in the codebase but no longer used by the UI. If you prefer email delivery, you could switch the frontend back to POSTing to `/api/bug-report` and set `RESEND_API_KEY` and `BUG_REPORT_EMAIL` in Netlify env vars.
