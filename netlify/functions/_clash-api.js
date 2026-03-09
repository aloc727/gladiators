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

const CENTRAL_TZ = 'America/Chicago';

/** War ends Monday 4:30am Central. Returns ISO string for that moment. */
function getCurrentWarEndKey() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CENTRAL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10);
  const day = parseInt(get('day'), 10);
  const weekday = get('weekday');
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const weekdayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  const dayOfWeek = weekdayMap[weekday] ?? 0;
  let targetMonday = new Date(year, month - 1, day);
  if (!(dayOfWeek === 1 && (hour < 4 || (hour === 4 && minute < 30)))) {
    const daysToAdd = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7;
    targetMonday.setDate(targetMonday.getDate() + daysToAdd);
  }
  const y = targetMonday.getFullYear();
  const m = targetMonday.getMonth() + 1;
  const mondayDay = targetMonday.getDate();
  const utcOffset = getCentralOffsetMinutes(y, m, mondayDay);
  const utcMinutes = 4 * 60 + 30 - utcOffset;
  const utcHours = Math.floor(utcMinutes / 60);
  const utcMins = utcMinutes % 60;
  const utcDate = new Date(Date.UTC(y, m - 1, mondayDay, utcHours, utcMins, 0, 0));
  return utcDate.toISOString();
}

function getCentralOffsetMinutes(year, month, day) {
  const marchSecondSunday = 8 + (7 - new Date(year, 2, 8).getDay()) % 7;
  const novFirstSunday = 1 + (7 - new Date(year, 10, 1).getDay()) % 7;
  const isDST =
    (month > 3 || (month === 3 && day >= marchSecondSunday)) &&
    (month < 11 || (month === 11 && day < novFirstSunday));
  return isDST ? -300 : -360;
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

/** Convert currentriverrace response to one war entry (same shape as server.js for /api/clan/current-war). */
function convertRiverRaceToWarLog(riverRaceData) {
  if (!riverRaceData || !riverRaceData.clan || !riverRaceData.clan.participants) {
    return [];
  }

  const endDateISO = getCurrentWarEndKey();
  const endDate = new Date(endDateISO);
  const startThursday = new Date(endDate);
  startThursday.setUTCDate(endDate.getUTCDate() - 4);

  const participants = riverRaceData.clan.participants.map((p) => ({
    tag: p.tag,
    name: p.name,
    fame: p.fame ?? 0,
    warPoints: p.fame ?? 0,
    decksUsed: p.decksUsed ?? 0,
    battlesPlayed: p.decksUsed ?? 0,
  }));

  return [
    {
      participants,
      createdDate: endDateISO,
      startDate: startThursday.toISOString(),
      endDate: endDateISO,
      state: riverRaceData.state || 'unknown',
      seasonId: riverRaceData.seasonId ?? null,
      sectionIndex: riverRaceData.sectionIndex ?? 0,
      periodIndex: riverRaceData.periodIndex ?? null,
    },
  ];
}

/** For clan-warlog fallback when warlog is disabled: same end date logic as above but single war. */
function convertRiverRaceToWarLogLegacy(riverRaceData) {
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
  convertRiverRaceToWarLogLegacy,
};
