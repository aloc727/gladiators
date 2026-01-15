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

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json'
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
    
    // Calculate dates for the last 10 Sundays at 4:30am CT
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysSinceSunday = currentDay === 0 ? 0 : currentDay;
    
    // Get the most recent Sunday at 4:30am CT
    const mostRecentSunday = new Date(now);
    mostRecentSunday.setDate(now.getDate() - daysSinceSunday);
    mostRecentSunday.setHours(4, 30, 0, 0); // 4:30am CT
    
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
        
        // Calculate the Sunday date for this week (going back in time)
        const warDate = new Date(mostRecentSunday);
        warDate.setDate(mostRecentSunday.getDate() - (week * 7));
        
        weeks.push({
            participants: participants,
            createdDate: warDate.toISOString(),
            endDate: warDate.toISOString() // War ends on Sunday at 4:30am CT
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
    
    // Get current date (Sunday at 4:30am CT)
    const now = new Date();
    const currentDay = now.getDay();
    const daysSinceSunday = currentDay === 0 ? 0 : currentDay;
    const currentSunday = new Date(now);
    currentSunday.setDate(now.getDate() - daysSinceSunday);
    currentSunday.setHours(4, 30, 0, 0);
    
    // Convert participants to war log format
    const participants = riverRaceData.clan.participants.map(p => ({
        tag: p.tag,
        warPoints: p.fame || 0, // Fame is the war points in river race
        battlesPlayed: p.decksUsed || 0
    }));
    
    // Return as a single war entry (current week)
    return [{
        participants: participants,
        createdDate: currentSunday.toISOString(),
        endDate: currentSunday.toISOString(),
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
        const endpoint = `/v1/clans/%23${CLAN_TAG}`;
        makeAPIRequest(endpoint, (err, data) => {
            if (err) {
                if (API_KEY && isValidApiKey(API_KEY)) {
                    // Only show error if API key is set (otherwise we're in demo mode)
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                } else {
                    // No valid API key - return demo data
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ members: getDemoMembers() }));
                }
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ members: data.memberList || [] }));
            }
        });
        return;
    }
    
    if (pathname === '/api/clan/warlog') {
        // Try warlog endpoint first (may be disabled)
        const warlogEndpoint = `/v1/clans/%23${CLAN_TAG}/warlog`;
        makeAPIRequest(warlogEndpoint, (err, data) => {
            if (err) {
                // If warlog fails, try current river race as fallback
                if (err.message.includes('disabled') || err.message.includes('notFound')) {
                    console.log('War log endpoint disabled, trying current river race...');
                    const riverRaceEndpoint = `/v1/clans/%23${CLAN_TAG}/currentriverrace`;
                    makeAPIRequest(riverRaceEndpoint, (riverErr, riverData) => {
                        if (riverErr) {
                            if (API_KEY && isValidApiKey(API_KEY)) {
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ 
                                    error: 'War log endpoint is disabled. Current river race data unavailable.',
                                    note: 'The Clash Royale API has temporarily disabled the war log endpoint.'
                                }));
                            } else {
                                // No valid API key - return demo data
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ warLog: getDemoWarLog() }));
                            }
                        } else {
                            // Convert current river race to war log format
                            const warLog = convertRiverRaceToWarLog(riverData);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ warLog: warLog }));
                        }
                    });
                } else {
                    if (API_KEY && isValidApiKey(API_KEY)) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    } else {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ warLog: getDemoWarLog() }));
                    }
                }
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ warLog: data.items || [] }));
            }
        });
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
});
