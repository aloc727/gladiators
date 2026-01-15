const https = require('https');

const API_BASE_URL = 'api.clashroyale.com';
const CLAN_TAG = process.env.CLAN_TAG || '2CPPJLJ';
const API_KEY = process.env.CLASH_ROYALE_API_KEY || '';

function isValidApiKey(key) {
  return key && typeof key === 'string' && key.length > 10 && key.trim().length === key.length;
}

function apiRequest(path) {
  return new Promise((resolve, reject) => {
    if (!isValidApiKey(API_KEY)) {
      reject({ status: 500, reason: 'apiKeyMissing', message: 'API key not configured' });
      return;
    }

    const options = {
      hostname: API_BASE_URL,
      path,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        Accept: 'application/json',
        'User-Agent': 'Gladiators-War-Stats/1.0',
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const jsonData = JSON.parse(data);
            resolve(jsonData);
          } catch (err) {
            reject({ status: 500, reason: 'parseError', message: 'Failed to parse API response' });
          }
          return;
        }

        let reason = 'unknown';
        let message = `API returned status ${res.statusCode}`;
        try {
          const errorData = JSON.parse(data);
          reason = errorData.reason || reason;
          message = errorData.message || message;
        } catch (err) {
          // keep defaults
        }

        reject({ status: res.statusCode, reason, message });
      });
    });

    req.on('error', () => {
      reject({ status: 500, reason: 'networkError', message: 'Network error occurred' });
    });

    req.on('timeout', () => {
      req.destroy();
      reject({ status: 504, reason: 'timeout', message: 'Request timeout' });
    });

    req.end();
  });
}

function getCurrentSundayCT() {
  const now = new Date();
  const currentDay = now.getDay();
  const daysSinceSunday = currentDay === 0 ? 0 : currentDay;
  const currentSunday = new Date(now);
  currentSunday.setDate(now.getDate() - daysSinceSunday);
  currentSunday.setHours(4, 30, 0, 0);
  return currentSunday;
}

function convertRiverRaceToWarLog(riverRaceData) {
  if (!riverRaceData || !riverRaceData.clan || !riverRaceData.clan.participants) {
    return [];
  }

  const currentSunday = getCurrentSundayCT();
  const participants = riverRaceData.clan.participants.map((p) => ({
    tag: p.tag,
    warPoints: p.fame || 0,
    battlesPlayed: p.decksUsed || 0,
  }));

  return [
    {
      participants,
      createdDate: currentSunday.toISOString(),
      endDate: currentSunday.toISOString(),
      state: riverRaceData.state || 'unknown',
    },
  ];
}

module.exports = {
  CLAN_TAG,
  apiRequest,
  convertRiverRaceToWarLog,
};
