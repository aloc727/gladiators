const { CLAN_TAG, apiRequest, convertRiverRaceToWarLog } = require('./_clash-api');

exports.handler = async () => {
  try {
    const data = await apiRequest(`/v1/clans/%23${CLAN_TAG}/warlog`);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ warLog: data.items || [] }),
    };
  } catch (err) {
    const isWarLogDisabled =
      err.status === 404 &&
      typeof err.message === 'string' &&
      err.message.toLowerCase().includes('disabled');

    if (isWarLogDisabled) {
      try {
        const riverRace = await apiRequest(`/v1/clans/%23${CLAN_TAG}/currentriverrace`);
        const warLog = convertRiverRaceToWarLog(riverRace);
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
          body: JSON.stringify({ warLog }),
        };
      } catch (riverErr) {
        return {
          statusCode: riverErr.status || 500,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
          body: JSON.stringify({
            error: 'War log endpoint disabled and river race unavailable',
            reason: riverErr.reason || 'unknown',
          }),
        };
      }
    }

    return {
      statusCode: err.status || 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ error: err.message || 'Failed to fetch war log', reason: err.reason || 'unknown' }),
    };
  }
};
