/**
 * GET: Return current war week from currentriverrace API.
 * Used so the first column shows live current-week data (not last week's).
 */
const { apiRequest, convertRiverRaceToWarLog } = require('./_clash-api');

exports.handler = async () => {
  try {
    const riverData = await apiRequest(`/v1/clans/%23${process.env.CLAN_TAG || '2CPPJLJ'}/currentriverrace`);
    const entries = convertRiverRaceToWarLog(riverData);
    const currentWar = entries[0] || null;
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ currentWar }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ currentWar: null }),
    };
  }
};
