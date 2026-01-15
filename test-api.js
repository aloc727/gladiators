#!/usr/bin/env node

// Quick test script to verify API key and clan tag
const https = require('https');
const fs = require('fs');

// Load .env file if it exists
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

const API_KEY = process.env.CLASH_ROYALE_API_KEY;
const CLAN_TAG = '2CPPJLJ';

if (!API_KEY) {
    console.error('❌ ERROR: CLASH_ROYALE_API_KEY not found in .env file');
    process.exit(1);
}

console.log('Testing API connection...\n');
console.log(`Clan Tag: #${CLAN_TAG}`);
console.log(`API Key: ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 4)}\n`);

const options = {
    hostname: 'api.clashroyale.com',
    path: `/v1/clans/%23${CLAN_TAG}`,
    method: 'GET',
    headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json'
    },
    timeout: 10000
};

const req = https.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log(`Status Code: ${res.statusCode}\n`);
        
        if (res.statusCode === 200) {
            try {
                const jsonData = JSON.parse(data);
                console.log('✅ SUCCESS! API key is working.\n');
                console.log(`Clan Name: ${jsonData.name || 'N/A'}`);
                console.log(`Members: ${jsonData.memberList?.length || 0}`);
                console.log(`\nFull response (first 500 chars):`);
                console.log(JSON.stringify(jsonData, null, 2).substring(0, 500));
            } catch (e) {
                console.error('❌ Failed to parse response');
                console.log(data);
            }
        } else {
            console.error(`❌ ERROR: API returned status ${res.statusCode}`);
            try {
                const errorData = JSON.parse(data);
                console.log('\nError details:');
                console.log(JSON.stringify(errorData, null, 2));
            } catch (e) {
                console.log('\nRaw response:');
                console.log(data);
            }
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Network error:', error.message);
});

req.on('timeout', () => {
    req.destroy();
    console.error('❌ Request timeout');
});

req.end();
