const { CLAN_TAG, apiRequest } = require('./_clash-api');

exports.handler = async () => {
  try {
    const data = await apiRequest(`/v1/clans/%23${CLAN_TAG}`);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ members: data.memberList || [] }),
    };
  } catch (err) {
    const statusCode = err.status || 500;
    const message = err.message || 'Failed to fetch clan members';
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ error: message, reason: err.reason || 'unknown' }),
    };
  }
};
