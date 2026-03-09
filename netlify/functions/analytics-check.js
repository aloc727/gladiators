/**
 * GET: Check if the request has a valid analytics session cookie.
 * Set ANALYTICS_SESSION_SECRET in Netlify env to match the cookie value set by analytics-auth.
 */
exports.handler = async (event) => {
  const secret = process.env.ANALYTICS_SESSION_SECRET || '';
  const cookieHeader = event.headers.cookie || event.headers.Cookie || '';
  const name = 'gladiators_analytics';
  const match = cookieHeader.match(new RegExp(name + '=([^;]+)'));
  const ok = !!secret && !!match && match[1] === secret;

  return {
    statusCode: ok ? 200 : 401,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok }),
  };
};
