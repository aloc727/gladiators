const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// SECURITY: Load environment variables from .env file if it exists
// NEVER commit .env to version control!
if (fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf8');
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                const value = valueParts.join('=').replace(/^["']|["']$/g, '');
                process.env[key.trim()] = value.trim();
            }
        }
    });
}

const PORT = process.env.PORT || 3000;
const CLAN_TAG = '2CPPJLJ';
const API_BASE_URL = 'api.clashroyale.com';

// Local storage for war history (simple JSON file, no external service)
const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'war-history.json');
const HISTORY_MAX_WEEKS = 260;
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json');
const SNAPSHOTS_FILE = path.join(DATA_DIR, 'war-snapshots.json');
const WARLOG_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily check

// SECURITY: API Key MUST be set via environment variable only
// NEVER hardcode API keys in source code!
const API_KEY = process.env.CLASH_ROYALE_API_KEY || '';

// SECURITY: Validate API key format (should be a non-empty string)
// Clash Royale API keys are typically long alphanumeric strings
function isValidApiKey(key) {
    return key && typeof key === 'string' && key.length > 10 && key.trim().length === key.length;
}

if (!API_KEY || !isValidApiKey(API_KEY)) {
    console.warn('⚠️  WARNING: CLASH_ROYALE_API_KEY not set or invalid.');
    console.warn('   Create a .env file with: CLASH_ROYALE_API_KEY=your-key-here');
    console.warn('   Or set environment variable: export CLASH_ROYALE_API_KEY=your-key-here');
    console.warn('   Using DEMO MODE with sample data.\n');
}

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function loadWarHistory() {
    try {
        if (!fs.existsSync(HISTORY_FILE)) {
            return [];
        }
        const content = fs.readFileSync(HISTORY_FILE, 'utf8');
        const data = JSON.parse(content);
        return Array.isArray(data.items) ? data.items : [];
    } catch (error) {
        console.warn('⚠️  Failed to load war history. Starting fresh.');
        return [];
    }
}

function saveWarHistory(items) {
    try {
        ensureDataDir();
        fs.writeFileSync(HISTORY_FILE, JSON.stringify({ items }, null, 2), 'utf8');
    } catch (error) {
        console.warn('⚠️  Failed to save war history.');
    }
}

function loadMemberHistory() {
    try {
        if (!fs.existsSync(MEMBERS_FILE)) {
            return { items: [], seededAt: null };
        }
        const content = fs.readFileSync(MEMBERS_FILE, 'utf8');
        const data = JSON.parse(content);
        if (Array.isArray(data)) {
            return { items: data, seededAt: null };
        }
        return {
            items: Array.isArray(data.items) ? data.items : [],
            seededAt: data.seededAt || null
        };
    } catch (error) {
        console.warn('⚠️  Failed to load member history. Starting fresh.');
        return { items: [], seededAt: null };
    }
}

function saveMemberHistory(items, seededAt) {
    try {
        ensureDataDir();
        fs.writeFileSync(MEMBERS_FILE, JSON.stringify({ seededAt, items }, null, 2), 'utf8');
    } catch (error) {
        console.warn('⚠️  Failed to save member history.');
    }
}

function loadSnapshots() {
    try {
        if (!fs.existsSync(SNAPSHOTS_FILE)) {
            return { weeks: {} };
        }
        const content = fs.readFileSync(SNAPSHOTS_FILE, 'utf8');
        const data = JSON.parse(content);
        return data && typeof data === 'object' ? data : { weeks: {} };
    } catch (error) {
        console.warn('⚠️  Failed to load snapshots. Starting fresh.');
        return { weeks: {} };
    }
}

function saveSnapshots(data) {
    try {
        ensureDataDir();
        fs.writeFileSync(SNAPSHOTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.warn('⚠️  Failed to save snapshots.');
    }
}

function getCentralTimeParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const parts = formatter.formatToParts(date);
    const weekday = parts.find(p => p.type === 'weekday')?.value || 'Sun';
    const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { day: weekdayMap[weekday] ?? 0, hour, minute };
}

function getCurrentWarEndKey() {
    const now = new Date();
    const currentDay = now.getDay();
    const daysUntilMonday = (1 - currentDay + 7) % 7;
    const endMonday = new Date(now);
    endMonday.setDate(now.getDate() + daysUntilMonday);
    endMonday.setHours(4, 30, 0, 0);
    return endMonday.toISOString();
}

function normalizeParticipants(participants = []) {
    return participants.map(p => ({
        tag: p.tag,
        warPoints: p.warPoints ?? p.fame ?? 0,
        battlesPlayed: p.battlesPlayed ?? p.decksUsed ?? 0,
        decksUsed: p.decksUsed ?? p.battlesPlayed ?? 0
    }));
}

function attachMemberHistory(memberList) {
    const now = new Date().toISOString();
    const historyData = loadMemberHistory();
    const history = historyData.items;
    const historyMap = new Map(history.map(item => [item.tag, item]));
    const isFirstRun = history.length === 0 && !historyData.seededAt;
    const seededAt = historyData.seededAt || (isFirstRun ? now : null);

    const enriched = memberList.map(member => {
        const existing = historyMap.get(member.tag);
        const firstSeen = existing?.firstSeen || now;
        const tenureKnown = existing?.tenureKnown ?? !isFirstRun;
        historyMap.set(member.tag, {
            tag: member.tag,
            firstSeen,
            lastSeen: now,
            name: member.name,
            role: member.role,
            tenureKnown
        });
        return { ...member, firstSeen, tenureKnown, isCurrent: true };
    });

    saveMemberHistory(Array.from(historyMap.values()), seededAt);
    return enriched;
}

function getMemberHistoryList(currentMembers) {
    const historyData = loadMemberHistory();
    const history = historyData.items;
    const currentMap = new Map(currentMembers.map(member => [member.tag, member]));

    const formerMembers = history
        .filter(item => !currentMap.has(item.tag))
        .map(item => ({
            tag: item.tag,
            name: item.name || item.tag,
            role: item.role || 'member',
            firstSeen: item.firstSeen,
            tenureKnown: item.tenureKnown ?? false,
            isCurrent: false
        }));

    return currentMembers.concat(formerMembers);
}

function getWarEntryKey(entry) {
    return entry.endDate || entry.createdDate || '';
}

function upsertWarEntry(entry, history) {
    const key = getWarEntryKey(entry);
    if (!key) return history;

    const existingIndex = history.findIndex(item => getWarEntryKey(item) === key);
    if (existingIndex >= 0) {
        history[existingIndex] = entry;
    } else {
        history.push(entry);
    }

    // Sort newest first
    history.sort((a, b) => new Date(b.endDate || b.createdDate) - new Date(a.endDate || a.createdDate));

    // Keep a maximum of HISTORY_MAX_WEEKS entries
    const trimmed = history.slice(0, HISTORY_MAX_WEEKS);
    saveWarHistory(trimmed);
    return trimmed;
}

function mergeWarLogs(primary, secondary) {
    const combined = [...primary];
    secondary.forEach(entry => {
        const key = getWarEntryKey(entry);
        if (!combined.find(item => getWarEntryKey(item) === key)) {
            combined.push(entry);
        }
    });
    combined.sort((a, b) => new Date(b.endDate || b.createdDate) - new Date(a.endDate || a.createdDate));
    return combined;
}

let warHistoryCache = loadWarHistory();
let warLogAvailable = false;
let memberCache = { current: [], all: [] };
let warLogCache = [];
let lastCacheRefresh = null;

const SERVER_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes on the dot

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Serve static files
function serveStaticFile(filePath, res) {
    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 - File Not Found</h1>');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}

// Generate demo data for testing without API key
function getDemoMembers() {
    return [
        { tag: '#DEMO001', name: 'GladiatorMax' },
        { tag: '#DEMO002', name: 'WarriorKing' },
        { tag: '#DEMO003', name: 'BattleMaster' },
        { tag: '#DEMO004', name: 'ChampionElite' },
        { tag: '#DEMO005', name: 'SpartanWarrior' },
        { tag: '#DEMO006', name: 'ArenaLegend' },
        { tag: '#DEMO007', name: 'TrophyHunter' },
        { tag: '#DEMO008', name: 'ClashVeteran' },
        { tag: '#DEMO009', name: 'RoyalGuard' },
        { tag: '#DEMO010', name: 'EliteFighter' }
    ];
}

function getDemoWarLog() {
    // Generate 10 weeks of demo war data
    const members = getDemoMembers();
    const weeks = [];
    
    // Calculate dates for the last 10 Mondays at 4:30am CT
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysUntilMonday = (1 - currentDay + 7) % 7;
    
    // Get the most recent Monday at 4:30am CT
    const mostRecentMonday = new Date(now);
    mostRecentMonday.setDate(now.getDate() + daysUntilMonday);
    mostRecentMonday.setHours(4, 30, 0, 0); // 4:30am CT
    
    for (let week = 0; week < 10; week++) {
        const participants = [];
        // Randomly include 6-9 players each week (some missing to show 0 scores)
        const numParticipants = 6 + Math.floor(Math.random() * 4);
        const shuffled = [...members].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < numParticipants; i++) {
            participants.push({
                tag: shuffled[i].tag,
                warPoints: 100 + Math.floor(Math.random() * 400) // Random points between 100-500
            });
        }
        
        // Calculate the Monday date for this week (going back in time)
        const warDate = new Date(mostRecentMonday);
        warDate.setDate(mostRecentMonday.getDate() - (week * 7));
        
        weeks.push({
            participants: participants,
            createdDate: warDate.toISOString(),
            endDate: warDate.toISOString() // War ends on Monday at 4:30am CT
        });
    }
    
    // Return in reverse order (oldest first) to match API behavior
    return weeks.reverse();
}

// Convert current river race data to war log format
function convertRiverRaceToWarLog(riverRaceData) {
    if (!riverRaceData || !riverRaceData.clan || !riverRaceData.clan.participants) {
        return [];
    }
    
    // Get current date (Monday at 4:30am CT)
    const now = new Date();
    const currentDay = now.getDay();
    const daysUntilMonday = (1 - currentDay + 7) % 7;
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() + daysUntilMonday);
    currentMonday.setHours(4, 30, 0, 0);
    
    // Convert participants to war log format
    const participants = normalizeParticipants(riverRaceData.clan.participants);
    
    // Return as a single war entry (current week)
    return [{
        participants: participants,
        createdDate: currentMonday.toISOString(),
        endDate: currentMonday.toISOString(),
        state: riverRaceData.state || 'unknown'
    }];
}

// SECURITY: Make API request to Clash Royale API
// Never log or expose the API key in any way
function makeAPIRequest(endpoint, callback) {
    // SECURITY: Validate API key before making request
    if (!API_KEY || !isValidApiKey(API_KEY)) {
        // Return demo data if no valid API key
        if (endpoint.includes('/warlog')) {
            callback(null, { items: getDemoWarLog() });
        } else {
            callback(null, { memberList: getDemoMembers() });
        }
        return;
    }
    
    // SECURITY: Validate endpoint to prevent SSRF attacks
    if (!endpoint.startsWith('/v1/clans/')) {
        callback(new Error('Invalid endpoint'), null);
        return;
    }
    
    // Log the endpoint being called (for debugging, but not the full URL with key)
    console.log(`Making API request to: ${endpoint.substring(0, 20)}...`);
    
    const options = {
        hostname: API_BASE_URL,
        path: endpoint,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
            'User-Agent': 'Gladiators-War-Stats/1.0'
        },
        // SECURITY: Set timeout to prevent hanging requests
        timeout: 10000
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
                    callback(null, jsonData);
                } catch (e) {
                    // SECURITY: Don't expose internal errors
                    callback(new Error('Failed to parse API response'), null);
                }
            } else if (res.statusCode === 403) {
                // Try to get more specific error info
                let errorMsg = 'API authentication failed. Please check your API key.';
                try {
                    const errorData = JSON.parse(data);
                    if (errorData.reason === 'accessDenied' || errorData.message?.includes('authorization')) {
                        errorMsg = 'API authentication failed. This could be due to:\n' +
                                  '1. Invalid or expired API key\n' +
                                  '2. IP address restriction - your server IP may not match the whitelisted IP\n' +
                                  '3. API key permissions issue';
                    }
                } catch (e) {
                    // Use default message
                }
                callback(new Error(errorMsg), null);
            } else if (res.statusCode === 404) {
                // Try to parse the error message from API response
                let errorMsg = 'Clan not found. Please verify the clan tag.';
                try {
                    const errorData = JSON.parse(data);
                    if (errorData.reason) {
                        errorMsg = `Clan not found: ${errorData.reason}`;
                    }
                } catch (e) {
                    // Use default message if parsing fails
                }
                callback(new Error(errorMsg), null);
            } else if (res.statusCode === 429) {
                callback(new Error('Rate limit exceeded. Please try again later.'), null);
            } else {
                // SECURITY: Sanitize error messages - don't expose API responses that might contain sensitive data
                let errorMsg = `API returned status ${res.statusCode}`;
                try {
                    const errorData = JSON.parse(data);
                    if (errorData.reason && !errorData.reason.toLowerCase().includes('key')) {
                        errorMsg = `API error: ${errorData.reason}`;
                    }
                } catch (e) {
                    // Use default message if parsing fails
                }
                callback(new Error(errorMsg), null);
            }
        });
    });
    
    req.on('error', (error) => {
        // SECURITY: Don't expose network errors that might reveal infrastructure
        callback(new Error('Network error occurred'), null);
    });
    
    req.on('timeout', () => {
        req.destroy();
        callback(new Error('Request timeout'), null);
    });
    
    req.end();
}

function makeAPIRequestPromise(endpoint) {
    return new Promise((resolve, reject) => {
        makeAPIRequest(endpoint, (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(data);
        });
    });
}

async function refreshServerCache() {
    const now = new Date();

    if (!API_KEY || !isValidApiKey(API_KEY)) {
        memberCache.current = getDemoMembers();
        memberCache.all = memberCache.current;
        warLogCache = getDemoWarLog();
        lastCacheRefresh = now.toISOString();
        return;
    }

    try {
        const clanData = await makeAPIRequestPromise(`/v1/clans/%23${CLAN_TAG}`);
        const enriched = attachMemberHistory(clanData.memberList || []);
        memberCache.current = enriched;
        memberCache.all = getMemberHistoryList(enriched);
    } catch (error) {
        console.warn('⚠️  Cache refresh failed for members.');
    }

    try {
        const warlogEndpoint = `/v1/clans/%23${CLAN_TAG}/warlog`;
        const data = await makeAPIRequestPromise(warlogEndpoint);
        const items = (data.items || []).map(item => {
            if (item.participants) {
                item.participants = normalizeParticipants(item.participants);
            }
            return item;
        });
        items.forEach(entry => {
            warHistoryCache = upsertWarEntry(entry, warHistoryCache);
        });
        warLogAvailable = true;
        const combined = mergeWarLogs(items, warHistoryCache);
        warLogCache = combined.slice(0, HISTORY_MAX_WEEKS);
    } catch (error) {
        warLogAvailable = false;
        if (error.message.includes('disabled') || error.message.includes('notFound')) {
            try {
                const riverRaceEndpoint = `/v1/clans/%23${CLAN_TAG}/currentriverrace`;
                const riverData = await makeAPIRequestPromise(riverRaceEndpoint);
                const currentEntries = convertRiverRaceToWarLog(riverData);
                currentEntries.forEach(entry => {
                    if (entry.participants) {
                        entry.participants = normalizeParticipants(entry.participants);
                    }
                    warHistoryCache = upsertWarEntry(entry, warHistoryCache);
                });
                const combined = mergeWarLogs(currentEntries, warHistoryCache);
                warLogCache = combined.slice(0, HISTORY_MAX_WEEKS);
            } catch (riverError) {
                console.warn('⚠️  Cache refresh failed for river race.');
            }
        } else {
            console.warn('⚠️  Cache refresh failed for war log.');
        }
    }

    if (!warLogCache.length) {
        warLogCache = getDemoWarLog();
    }

    lastCacheRefresh = now.toISOString();
}

function scheduleCacheRefresh() {
    const now = Date.now();
    const delay = SERVER_REFRESH_INTERVAL_MS - (now % SERVER_REFRESH_INTERVAL_MS);
    setTimeout(async () => {
        await refreshServerCache();
        scheduleCacheRefresh();
    }, delay);
}

// SECURITY: Set security headers
function setSecurityHeaders(res) {
    // CORS - restrict to localhost in production, or specific domain
    const origin = process.env.ALLOWED_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Don't expose server information
    res.removeHeader('X-Powered-By');
}

// Periodically capture current river race data to build history locally
const HISTORY_CAPTURE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function captureCurrentWeek() {
    if (!API_KEY || !isValidApiKey(API_KEY)) {
        return;
    }

    const riverRaceEndpoint = `/v1/clans/%23${CLAN_TAG}/currentriverrace`;
    makeAPIRequest(riverRaceEndpoint, (err, riverData) => {
        if (err) {
            console.warn('⚠️  Failed to capture current river race data.');
            return;
        }

            const currentEntries = convertRiverRaceToWarLog(riverData);
        currentEntries.forEach(entry => {
                if (entry.participants) {
                    entry.participants = normalizeParticipants(entry.participants);
                }
            warHistoryCache = upsertWarEntry(entry, warHistoryCache);
        });
    });
}

function captureWarSnapshotsWindow() {
    if (!API_KEY || !isValidApiKey(API_KEY)) {
        return;
    }

    const { day, hour, minute } = getCentralTimeParts();
    if (day !== 1 || hour !== 4 || minute < 25 || minute > 31) {
        return;
    }

    const riverRaceEndpoint = `/v1/clans/%23${CLAN_TAG}/currentriverrace`;
    makeAPIRequest(riverRaceEndpoint, (err, riverData) => {
        if (err || !riverData?.clan?.participants) {
            console.warn('⚠️  Snapshot capture failed.');
            return;
        }

        const participants = normalizeParticipants(riverData.clan.participants);
        const weekKey = getCurrentWarEndKey();
        const timestamp = new Date().toISOString();

        const snapshots = loadSnapshots();
        if (!snapshots.weeks[weekKey]) {
            snapshots.weeks[weekKey] = { samples: [], preReset: null };
        }

        const totalFame = participants.reduce((sum, p) => sum + (p.warPoints || 0), 0);
        const sample = { timestamp, totalFame, participants };
        snapshots.weeks[weekKey].samples.push(sample);

        // If data resets to zero, keep the last non-zero sample as preReset
        if (totalFame === 0) {
            const previous = snapshots.weeks[weekKey].samples.slice(-2, -1)[0];
            if (previous && previous.totalFame > 0) {
                snapshots.weeks[weekKey].preReset = previous;
            }
        }

        saveSnapshots(snapshots);
    });
}

function checkWarLogAvailability() {
    if (!API_KEY || !isValidApiKey(API_KEY)) {
        return;
    }

    const warlogEndpoint = `/v1/clans/%23${CLAN_TAG}/warlog`;
    makeAPIRequest(warlogEndpoint, (err, data) => {
        if (!err && data && Array.isArray(data.items)) {
            if (!warLogAvailable) {
                console.log('✅ War log endpoint is available again.');
            }
            warLogAvailable = true;
            data.items.forEach(entry => {
                if (entry.participants) {
                    entry.participants = normalizeParticipants(entry.participants);
                }
                warHistoryCache = upsertWarEntry(entry, warHistoryCache);
            });
            return;
        }

        const wasAvailable = warLogAvailable;
        warLogAvailable = false;
        if (wasAvailable) {
            console.log('⚠️  War log endpoint appears unavailable. Will keep checking daily.');
        }
    });
}

// Create server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // SECURITY: Set security headers on all responses
    setSecurityHeaders(res);
    
    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // API endpoints
    if (pathname === '/api/clan/members') {
        const query = parsedUrl.query || {};
        const includeFormer = query.includeFormer === '1';
        const output = includeFormer ? memberCache.all : memberCache.current;
        const fallback = getDemoMembers();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ members: output.length ? output : fallback }));
        return;
    }
    
    if (pathname === '/api/clan/warlog') {
        const output = warLogCache.length ? warLogCache : getDemoWarLog();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ warLog: output }));
        return;
    }
    
    // Serve static files
    let filePath = '.' + pathname;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    serveStaticFile(filePath, res);
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Clan Tag: #${CLAN_TAG}`);
    
    // SECURITY: Never log the API key, only confirm if it's set
    if (!API_KEY || !isValidApiKey(API_KEY)) {
        console.log('\n📊 DEMO MODE: Using sample data (no API key required)');
        console.log('   To use real data, create a .env file with:');
        console.log('   CLASH_ROYALE_API_KEY=your-key-here\n');
    } else {
        // SECURITY: Only log that key is set, never the actual key
        const keyPreview = API_KEY.substring(0, 4) + '...' + API_KEY.substring(API_KEY.length - 4);
        console.log(`✅ API key configured: ${keyPreview}`);
        console.log('   Using Clash Royale API\n');
    }
    
    // SECURITY: Warn if running in production without proper security
    if (process.env.NODE_ENV === 'production') {
        console.log('⚠️  PRODUCTION MODE: Ensure proper security measures are in place');
        console.log('   - Use HTTPS');
        console.log('   - Restrict CORS origins');
        console.log('   - Use environment variables for all secrets');
        console.log('   - Enable rate limiting\n');
    }

    // Refresh cached data on 5-minute boundaries (not per user request)
    refreshServerCache();
    scheduleCacheRefresh();

    // Start background capture to build local history
    captureCurrentWeek();
    setInterval(captureCurrentWeek, HISTORY_CAPTURE_INTERVAL_MS);

    // Check once per day if war log endpoint is back
    checkWarLogAvailability();
    setInterval(checkWarLogAvailability, WARLOG_CHECK_INTERVAL_MS);

    // Capture minute-by-minute snapshots around week rollover (Monday 4:25–4:31am CT)
    captureWarSnapshotsWindow();
    setInterval(captureWarSnapshotsWindow, 60 * 1000);
});
