/**
 * POST: Submit a bug report. Sends the report to BUG_REPORT_EMAIL via Resend.
 * Body: { "report": "plain text report content" }
 * Env: RESEND_API_KEY, BUG_REPORT_EMAIL (optional: BUG_REPORT_FROM, default "Gladiators Bug Reporter <onboarding@resend.dev>")
 */
const { Resend } = require('resend');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.RESEND_API_KEY || '';
  const toEmail = process.env.BUG_REPORT_EMAIL || '';
  const from = process.env.BUG_REPORT_FROM || 'Gladiators Bug Reporter <onboarding@resend.dev>';

  if (!apiKey || !toEmail) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Bug report not configured' }),
    };
  }

  let report = '';
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body || {};
    report = typeof body.report === 'string' ? body.report.trim() : '';
  } catch (_) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  if (!report) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Report is required' }) };
  }

  // Cap size to avoid abuse (e.g. 50KB)
  if (report.length > 50 * 1024) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Report too long' }) };
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: [toEmail],
    subject: `[Gladiators] Bug report ${new Date().toISOString().slice(0, 19)}`,
    text: report,
  });

  if (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Failed to send report' }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, id: data?.id }),
  };
};
