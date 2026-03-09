/**
 * POST: Check password (from env ANALYTICS_PASSWORD) and set session cookie.
 * Body: { "password": "..." }
 * Set ANALYTICS_PASSWORD and ANALYTICS_SESSION_SECRET in Netlify env.
 */
exports.handler = async (event) => {
  const expected = process.env.ANALYTICS_PASSWORD || '';
  const secret = process.env.ANALYTICS_SESSION_SECRET || '';
  const name = 'gladiators_analytics';

  let password = '';
  if (event.body) {
    try {
      const parsed = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      password = parsed.password || '';
    } catch (_) {}
  }

  const ok = !!expected && !!secret && password === expected;
  const cookie = ok
    ? `${name}=${secret}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
    : `${name}=; HttpOnly; Path=/; Max-Age=0`;

  return {
    statusCode: ok ? 200 : 401,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie,
    },
    body: JSON.stringify({ ok }),
  };
};
