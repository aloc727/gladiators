const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// SECURITY: Load environment variables from .env file if it exists
// NEVER commit .env to version control!
// MUST load .env BEFORE requiring db.js so database connection has credentials
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

// Load db.js AFTER .env is loaded
const db = require('./db');

const PORT = process.env.PORT || 3000;
const CLAN_TAG = '2CPPJLJ';
const API_BASE_URL = 'api.clashroyale.com';

// Database storage (PostgreSQL)
const HISTORY_MAX_WEEKS = 260;
const WARLOG_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily check

// Fallback: Keep JSON file paths for migration/backup purposes
const DATA_DIR = path.join(__dirname, 'data');

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

// Database helper functions (replacing JSON file operations)
async function loadWarHistory() {
    try {
        const warWeeks = await db.getWarWeeks(HISTORY_MAX_WEEKS);
        console.log(`📊 Loaded ${warWeeks.length} war weeks from database`);
        
        // Log first 5 to see what we're getting
        if (warWeeks.length > 0) {
            console.log('Sample war weeks from DB:', warWeeks.slice(0, 5).map(w => ({
                id: w.id,
                endDate: w.endDate,
                startDate: w.startDate,
                seasonId: w.seasonId,
                sectionIndex: w.sectionIndex,
                periodIndex: w.periodIndex
            })));
        }
        
        const warLog = [];
        const seenIds = new Set();
        
        for (const week of warWeeks) {
            // Skip duplicates
            if (seenIds.has(week.id)) {
                console.warn(`⚠️  Skipping duplicate war week id: ${week.id}`);
                continue;
            }
            seenIds.add(week.id);
            
            const participants = await db.getParticipantsByWarWeek(week.id);
            
            // Get member names for participants
            const participantData = await Promise.all(participants.map(async (p) => {
                const member = await db.getMemberByTag(p.memberTag);
                const rawData = typeof p.rawData === 'object' ? p.rawData : (p.rawData ? JSON.parse(p.rawData) : {});
                return {
                    tag: p.memberTag,
                    name: member?.name || p.memberTag,
                    rank: p.rank,
                    warPoints: p.warPoints,
                    fame: p.warPoints, // Alias for compatibility
                    decksUsed: p.decksUsed,
                    battlesPlayed: p.decksUsed, // Alias for compatibility
                    boatAttacks: p.boatAttacks,
                    trophies: p.trophies,
                    ...rawData // Merge any additional fields from raw data
                };
            }));
            
            // Preserve the date as-is from database (don't normalize)
            warLog.push({
                id: week.id,
                seasonId: week.seasonId,
                sectionIndex: week.sectionIndex,
                periodIndex: week.periodIndex,
                startDate: week.startDate,
                endDate: week.endDate, // Use as-is from database
                createdDate: week.createdDate,
                dataSource: week.dataSource,
                participants: participantData
            });
        }
        
        console.log(`✅ Processed ${warLog.length} unique war weeks into war log`);
        return warLog;
    } catch (error) {
        console.warn('⚠️  Failed to load war history from database:', error.message);
        console.error(error);
        return [];
    }
}

async function loadMemberHistory() {
    try {
        const members = await db.getMembers(true); // Include former members
        return {
            items: members.map(m => ({
                tag: m.tag,
                name: m.name,
                role: m.role,
                firstSeen: m.firstSeen,
                joinedAt: m.joinedAt,
                lastSeen: m.lastSeen,
                tenureKnown: m.tenureKnown,
                isCurrent: m.isCurrent
            })),
            seededAt: null // Not stored in DB, but kept for compatibility
        };
    } catch (error) {
        console.warn('⚠️  Failed to load member history from database:', error.message);
        return { items: [], seededAt: null };
    }
}

async function loadSnapshots() {
    try {
        const warWeeks = await db.getWarWeeks();
        const snapshots = { weeks: {} };
        
        for (const week of warWeeks) {
            const weekSnapshots = await db.getSnapshotsByWarWeek(week.id);
            if (weekSnapshots.length > 0) {
                // Convert to old format for compatibility
                const samples = weekSnapshots.map(s => {
                    const data = typeof s.snapshotData === 'object' ? s.snapshotData : JSON.parse(s.snapshotData || '{}');
                    return {
                        timestamp: s.snapshotTime,
                        totalFame: data.totalFame || 0,
                        participants: data.participants || []
                    };
                });
                snapshots.weeks[week.endDate] = {
                    samples,
                    preReset: samples.find(s => s.totalFame > 0) || null
                };
            }
        }
        
        return snapshots;
    } catch (error) {
        console.warn('⚠️  Failed to load snapshots from database:', error.message);
        return { weeks: {} };
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
        ...p,
        tag: p.tag,
        name: p.name,
        warPoints: p.warPoints ?? p.fame ?? 0,
        battlesPlayed: p.battlesPlayed ?? p.decksUsed ?? 0,
        decksUsed: p.decksUsed ?? p.battlesPlayed ?? 0
    }));
}

function mergeParticipantLists(primary = [], secondary = []) {
    const mergedMap = new Map();
    const addParticipant = (participant, preferExisting = false) => {
        const key = participant.tag || participant.name;
        if (!key) return;
        if (!mergedMap.has(key)) {
            mergedMap.set(key, { ...participant });
            return;
        }
        const existing = mergedMap.get(key);
        const existingPoints = existing.warPoints ?? existing.fame ?? 0;
        const incomingPoints = participant.warPoints ?? participant.fame ?? 0;
        const winner = incomingPoints > existingPoints ? { ...existing, ...participant } : { ...participant, ...existing };
        const existingDecks = existing.decksUsed ?? existing.battlesPlayed ?? 0;
        const incomingDecks = participant.decksUsed ?? participant.battlesPlayed ?? 0;
        if (incomingDecks > existingDecks) {
            winner.decksUsed = participant.decksUsed ?? participant.battlesPlayed ?? winner.decksUsed;
        }
        mergedMap.set(key, preferExisting ? { ...winner, ...existing } : winner);
    };

    primary.forEach(p => addParticipant(p, true));
    secondary.forEach(p => addParticipant(p, false));
    return Array.from(mergedMap.values());
}

function enrichWarEntry(entry, source) {
    const rawEntry = { ...entry };
    if (entry.participants) {
        entry.rawParticipants = entry.participants.map(p => ({ ...p }));
        rawEntry.participants = entry.participants.map(p => ({ ...p }));
        entry.participants = normalizeParticipants(entry.participants);
    }
    entry.rawEntry = rawEntry;
    entry.source = source;
    return entry;
}

async function attachMemberHistory(memberList) {
    const now = new Date().toISOString();
    
    try {
        const allMembers = await db.getMembers(true); // Get all members (current + former)
        const historyMap = new Map(allMembers.map(item => [item.tag, item]));
        const isFirstRun = allMembers.length === 0;

        const enriched = [];
        for (const member of memberList) {
            const existing = historyMap.get(member.tag);
            const firstSeen = existing?.firstSeen || now;
            const joinedAt = existing?.joinedAt || now;
            const tenureKnown = existing?.tenureKnown ?? !isFirstRun;

            // Upsert member in database
            await db.upsertMember({
                tag: member.tag,
                name: member.name,
                role: member.role,
                firstSeen: existing?.firstSeen || now,
                joinedAt: existing?.joinedAt || now,
                lastSeen: now,
                tenureKnown,
                isCurrent: true
            });

            enriched.push({ ...member, firstSeen, joinedAt, tenureKnown, isCurrent: true });
        }

        // Mark former members as not current
        const currentTags = new Set(memberList.map(m => m.tag));
        for (const [tag, member] of historyMap) {
            if (!currentTags.has(tag) && member.isCurrent) {
                await db.updateMemberCurrentStatus(tag, false);
            }
        }

        return enriched;
    } catch (error) {
        console.warn('⚠️  Failed to attach member history from database:', error.message);
        // Fallback: return members without history
        return memberList.map(m => ({
            ...m,
            firstSeen: now,
            joinedAt: now,
            tenureKnown: false,
            isCurrent: true
        }));
    }
}

async function getMemberHistoryList(currentMembers) {
    try {
        const allMembers = await db.getMembers(true); // Include former members
        const currentMap = new Map(currentMembers.map(member => [member.tag, member]));

        const formerMembers = allMembers
            .filter(item => !currentMap.has(item.tag))
            .map(item => ({
                tag: item.tag,
                name: item.name || item.tag,
                role: item.role || 'member',
                firstSeen: item.firstSeen,
                joinedAt: item.joinedAt || item.firstSeen,
                tenureKnown: item.tenureKnown ?? false,
                isCurrent: false
            }));

        return currentMembers.concat(formerMembers);
    } catch (error) {
        console.warn('⚠️  Failed to get member history list from database:', error.message);
        return currentMembers; // Fallback to current members only
    }
}

function getWarEntryKey(entry) {
    return entry.endDate || entry.createdDate || '';
}

async function upsertWarEntry(entry, history) {
    const key = getWarEntryKey(entry);
    if (!key) return history;

    try {
        // Calculate start date if not provided (Thursday 4:30am CT, 4 days before Monday end)
        let startDate = entry.startDate;
        if (!startDate && entry.endDate) {
            const endDateObj = new Date(entry.endDate);
            startDate = new Date(endDateObj);
            startDate.setDate(endDateObj.getDate() - 4);
            startDate.setHours(4, 30, 0, 0);
            startDate = startDate.toISOString();
        } else if (!startDate && entry.createdDate) {
            // Fallback: calculate from createdDate
            const endDateObj = new Date(entry.createdDate);
            startDate = new Date(endDateObj);
            startDate.setDate(endDateObj.getDate() - 4);
            startDate.setHours(4, 30, 0, 0);
            startDate = startDate.toISOString();
        }
        
        // Upsert war week
        const warWeek = await db.upsertWarWeek({
            seasonId: entry.seasonId || null,
            sectionIndex: entry.sectionIndex || null,
            periodIndex: entry.periodIndex || null,
            startDate: startDate || entry.createdDate,
            endDate: entry.endDate || entry.createdDate,
            createdDate: entry.createdDate || null,
            dataSource: entry.dataSource || entry.source || 'riverrace'
        });

        // Upsert participants
        if (entry.participants && Array.isArray(entry.participants)) {
            for (const participant of entry.participants) {
                await db.upsertParticipant({
                    warWeekId: warWeek.id,
                    memberTag: participant.tag,
                    rank: participant.rank || null,
                    warPoints: participant.warPoints || participant.fame || null,
                    decksUsed: participant.decksUsed || participant.battlesPlayed || null,
                    boatAttacks: participant.boatAttacks || null,
                    trophies: participant.trophies || null,
                    rawData: participant // Store full participant object
                });
            }
        }

        // Update in-memory cache
        const existingIndex = history.findIndex(item => getWarEntryKey(item) === key);
        if (existingIndex >= 0) {
            const existing = history[existingIndex];
            const mergedEntry = { ...existing, ...entry };
            if (existing.rawParticipants || entry.rawParticipants) {
                mergedEntry.rawParticipants = mergeParticipantLists(entry.rawParticipants || [], existing.rawParticipants || []);
            }
            if (existing.participants || entry.participants) {
                mergedEntry.participants = mergeParticipantLists(entry.participants || [], existing.participants || []);
            }
            history[existingIndex] = mergedEntry;
        } else {
            history.push(entry);
        }

        // Sort newest first
        history.sort((a, b) => new Date(b.endDate || b.createdDate) - new Date(a.endDate || a.createdDate));

        // Keep a maximum of HISTORY_MAX_WEEKS entries
        return history.slice(0, HISTORY_MAX_WEEKS);
    } catch (error) {
        console.warn('⚠️  Failed to upsert war entry to database:', error.message);
        return history; // Return unchanged history on error
    }
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

let warHistoryCache = [];
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
    
    // Wars start Thursday 4:30am CT and end Monday 4:30am CT
    // Calculate current week's Monday end date
    const now = new Date();
    const currentDay = now.getDay();
    const daysUntilMonday = (1 - currentDay + 7) % 7;
    const currentMonday = new Date(now);
    currentMonday.setDate(now.getDate() + daysUntilMonday);
    currentMonday.setHours(4, 30, 0, 0);
    
    // Calculate Thursday start date (4 days before Monday)
    const startThursday = new Date(currentMonday);
    startThursday.setDate(currentMonday.getDate() - 4);
    startThursday.setHours(4, 30, 0, 0);
    
    // Convert participants to war log format (keep raw fields)
    const participants = riverRaceData.clan.participants;
    
    // Return as a single war entry (current week)
    return [{
        participants: participants,
        createdDate: currentMonday.toISOString(),
        startDate: startThursday.toISOString(),
        endDate: currentMonday.toISOString(),
        state: riverRaceData.state || 'unknown',
        seasonId: riverRaceData.seasonId,
        sectionIndex: riverRaceData.sectionIndex,
        periodIndex: riverRaceData.periodIndex
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
        const enriched = await attachMemberHistory(clanData.memberList || []);
        memberCache.current = enriched;
        memberCache.all = await getMemberHistoryList(enriched);
    } catch (error) {
        console.warn('⚠️  Cache refresh failed for members.');
    }

    try {
        // Load existing war history from database FIRST
        warHistoryCache = await loadWarHistory();
        console.log(`📊 Loaded ${warHistoryCache.length} wars from database into cache`);
        
        const warlogEndpoint = `/v1/clans/%23${CLAN_TAG}/warlog`;
        const data = await makeAPIRequestPromise(warlogEndpoint);
        const items = (data.items || []).map(item => enrichWarEntry(item, 'warlog'));
        for (const entry of items) {
            warHistoryCache = await upsertWarEntry(entry, warHistoryCache);
        }
        warLogAvailable = true;
        const combined = mergeWarLogs(items, warHistoryCache);
        warLogCache = combined.slice(0, HISTORY_MAX_WEEKS);
        console.log(`✅ War log cache updated: ${warLogCache.length} wars (from ${combined.length} total)`);
    } catch (error) {
        warLogAvailable = false;
        if (error.message.includes('disabled') || error.message.includes('notFound')) {
            try {
                // Load existing war history from database
                warHistoryCache = await loadWarHistory();
                console.log(`📊 Loaded ${warHistoryCache.length} wars from database (warlog API disabled)`);
                
                const riverRaceEndpoint = `/v1/clans/%23${CLAN_TAG}/currentriverrace`;
                const riverData = await makeAPIRequestPromise(riverRaceEndpoint);
                const currentEntries = convertRiverRaceToWarLog(riverData);
                for (const entry of currentEntries) {
                    warHistoryCache = await upsertWarEntry(enrichWarEntry(entry, 'riverrace'), warHistoryCache);
                }
                const combined = mergeWarLogs(currentEntries, warHistoryCache);
                warLogCache = combined.slice(0, HISTORY_MAX_WEEKS);
                console.log(`✅ War log cache updated: ${warLogCache.length} wars (from ${combined.length} total, warlog disabled)`);
            } catch (riverError) {
                console.warn('⚠️  Cache refresh failed for river race.');
                // Fallback: just use what we have from database
                warLogCache = warHistoryCache.slice(0, HISTORY_MAX_WEEKS);
                console.log(`📊 Using database-only cache: ${warLogCache.length} wars`);
            }
        } else {
            console.warn('⚠️  Cache refresh failed for war log.');
            // Fallback: use database cache
            warLogCache = warHistoryCache.slice(0, HISTORY_MAX_WEEKS);
            console.log(`📊 Using database-only cache after error: ${warLogCache.length} wars`);
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

// Capture current week data every 5 minutes and OVERWRITE the existing entry
// This keeps the current week data fresh throughout the war
async function captureCurrentWeek() {
    if (!API_KEY || !isValidApiKey(API_KEY)) {
        return;
    }

    const riverRaceEndpoint = `/v1/clans/%23${CLAN_TAG}/currentriverrace`;
    makeAPIRequest(riverRaceEndpoint, async (err, riverData) => {
        if (err) {
            console.warn('⚠️  Failed to capture current river race data.');
            return;
        }

        // Convert to war log format and upsert (will overwrite existing current week entry)
        const currentEntries = convertRiverRaceToWarLog(riverData);
        for (const entry of currentEntries) {
            // Upsert will update existing entry if it exists (same end_date)
            warHistoryCache = await upsertWarEntry(enrichWarEntry(entry, 'riverrace'), warHistoryCache);
        }
    });
}

async function captureWarSnapshotsWindow() {
    if (!API_KEY || !isValidApiKey(API_KEY)) {
        return;
    }

    const { day, hour, minute } = getCentralTimeParts();
    // Only capture during war end window: Monday 4:25-4:31am CT
    if (day !== 1 || hour !== 4 || minute < 25 || minute > 31) {
        return;
    }

    const riverRaceEndpoint = `/v1/clans/%23${CLAN_TAG}/currentriverrace`;
    makeAPIRequest(riverRaceEndpoint, async (err, riverData) => {
        if (err || !riverData?.clan?.participants) {
            console.warn('⚠️  Snapshot capture failed.');
            return;
        }

        const participants = normalizeParticipants(riverData.clan.participants);
        const totalFame = participants.reduce((sum, p) => sum + (p.warPoints || 0), 0);
        
        // Only save snapshot if values haven't reset to 0 (war hasn't ended yet)
        if (totalFame === 0) {
            return; // War has ended, don't save snapshot
        }

        const weekKey = getCurrentWarEndKey();
        const timestamp = new Date().toISOString();

        try {
            // Get or create war week for this snapshot
            let warWeek = await db.getWarWeekByEndDate(weekKey);
            if (!warWeek) {
                warWeek = await db.upsertWarWeek({
                    endDate: weekKey,
                    startDate: weekKey, // Will be updated later
                    dataSource: 'snapshot'
                });
            }

            const snapshotData = {
                timestamp,
                totalFame,
                participants,
                rawData: riverData
            };

            await db.saveSnapshot(warWeek.id, timestamp, snapshotData);
        } catch (error) {
            console.warn('⚠️  Failed to save snapshot to database:', error.message);
        }
    });
}

async function checkWarLogAvailability() {
    if (!API_KEY || !isValidApiKey(API_KEY)) {
        return;
    }

    const warlogEndpoint = `/v1/clans/%23${CLAN_TAG}/warlog`;
    makeAPIRequest(warlogEndpoint, async (err, data) => {
        if (!err && data && Array.isArray(data.items)) {
            if (!warLogAvailable) {
                console.log('✅ War log endpoint is available again.');
            }
            warLogAvailable = true;
            // Load existing cache first
            warHistoryCache = await loadWarHistory();
            for (const entry of data.items) {
                warHistoryCache = await upsertWarEntry(enrichWarEntry(entry, 'warlog'), warHistoryCache);
            }
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
        // Return historical wars only (exclude current week which updates every 5 min)
        const output = warLogCache.length ? warLogCache : getDemoWarLog();
        console.log(`📤 Sending ${output.length} wars to frontend via /api/clan/warlog`);
        if (output.length > 0 && output.length <= 5) {
            console.log('📤 Sample of wars being sent:', output.slice(0, 3).map(w => ({
                id: w.id,
                endDate: w.endDate,
                seasonId: w.seasonId,
                participants: w.participants?.length || 0
            })));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ warLog: output }));
        return;
    }
    
    if (pathname === '/api/clan/current-war') {
        // Return current week from riverrace API (separate from historical)
        if (!API_KEY || !isValidApiKey(API_KEY)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ currentWar: null }));
            return;
        }
        
        // Set a timeout for the response
        const timeout = setTimeout(() => {
            if (!res.headersSent) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ currentWar: null, error: 'API timeout' }));
            }
        }, 8000); // 8 second timeout
        
        const riverRaceEndpoint = `/v1/clans/%23${CLAN_TAG}/currentriverrace`;
        makeAPIRequest(riverRaceEndpoint, (err, riverData) => {
            clearTimeout(timeout);
            if (!res.headersSent) {
                if (err) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ currentWar: null }));
                    return;
                }
                
                const currentEntries = convertRiverRaceToWarLog(riverData);
                const enriched = currentEntries.map(entry => enrichWarEntry(entry, 'riverrace'));
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ currentWar: enriched[0] || null }));
            }
        });
        return;
    }
    
    // Serve static files
    let filePath = '.' + pathname;
    if (filePath === './' || pathname === '/summary' || pathname === '/players') {
        filePath = './index.html';
    }
    
    serveStaticFile(filePath, res);
});

server.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log(`Clan Tag: #${CLAN_TAG}`);
    
    // Initialize database schema
    try {
        await db.initializeSchema();
        console.log('✅ Database initialized\n');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error.message);
        console.error('   Server will continue but database operations may fail.\n');
    }
    
    // Load initial cache from database
    try {
        warHistoryCache = await loadWarHistory();
        console.log(`📊 Loaded ${warHistoryCache.length} war weeks from database`);
    } catch (error) {
        console.warn('⚠️  Failed to load initial war history:', error.message);
    }
    
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

    // Capture current week data only when war ends (Monday 4:30am CT)
    // Check once per hour, but only capture if it's a new war week
    // This prevents repetitive hourly captures
    const checkAndCaptureCurrentWeek = () => {
        const { day, hour, minute } = getCentralTimeParts();
        // Only capture around war end time (Monday 4:25-4:35am CT) to get final data
        if (day === 1 && hour === 4 && minute >= 25 && minute <= 35) {
            captureCurrentWeek();
        }
    };
    checkAndCaptureCurrentWeek();
    setInterval(checkAndCaptureCurrentWeek, 60 * 60 * 1000); // Check every hour

    // Check once per day if war log endpoint is back
    checkWarLogAvailability();
    setInterval(checkWarLogAvailability, WARLOG_CHECK_INTERVAL_MS);

    // Capture minute-by-minute snapshots around week rollover (Monday 4:25–4:31am CT)
    // Only saves if values haven't reset to 0 (war hasn't ended yet)
    captureWarSnapshotsWindow();
    setInterval(captureWarSnapshotsWindow, 60 * 1000); // Every 1 minute
});
