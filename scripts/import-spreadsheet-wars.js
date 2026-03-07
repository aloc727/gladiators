#!/usr/bin/env node
/**
 * Import past war data from a spreadsheet exported as CSV.
 *
 * Expected columns: Season, Week, Rank, Player Name, Decks Used, Boat Attacks, Points
 * "Player Name" can be "DisplayName #TAG" or have junk like "<c3>Name #TAG" – we parse out the tag and clean the name.
 *
 * Usage:
 *   node scripts/import-spreadsheet-wars.js [path/to/file.csv]
 *   node scripts/import-spreadsheet-wars.js data/past-wars.csv --dry-run   # parse only, print JSON
 *
 * Default file: ~/Downloads/2026.03.06 - Gladiators Historic Data Upload.csv
 */

const fs = require('fs');
const path = require('path');

// Load .env if present (same directory as package.json)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const eq = trimmed.indexOf('=');
            if (eq > 0) {
                const key = trimmed.slice(0, eq).trim();
                const value = trimmed.slice(eq + 1).replace(/^["']|["']$/g, '').trim();
                process.env[key] = value;
            }
        }
    });
}

const db = require('../db');

const DEFAULT_CSV = path.join(process.env.HOME || process.env.USERPROFILE || '', 'Downloads', '2026.03.06 - Gladiators Historic Data Upload.csv');

// Tag: # followed by 8–9 alphanumeric (Clash Royale), or same pattern without # in the string
const TAG_REGEX = /#?([A-Z0-9]{8,9})\b/i;
// Strip HTML-like tags and extra spaces
function cleanName(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/#?[A-Z0-9]{8,9}\b/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function parsePlayerName(cell) {
    const raw = (cell || '').trim();
    const tagMatch = raw.match(TAG_REGEX);
    const tag = tagMatch ? (tagMatch[0].startsWith('#') ? tagMatch[0].toUpperCase() : '#' + tagMatch[1].toUpperCase()) : null;
    const name = cleanName(raw);
    return { name, tag };
}

/**
 * Parse a CSV line respecting quoted fields (simple: if line starts with " or contains ", split carefully).
 */
function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            inQuotes = !inQuotes;
        } else if ((c === ',' && !inQuotes) || (c === '\n' && !inQuotes)) {
            result.push(current.trim());
            current = '';
            if (c === '\n') break;
        } else {
            current += c;
        }
    }
    if (current !== '' || inQuotes) result.push(current.trim());
    return result;
}

function parseCsv(content) {
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const headerLine = lines[0];
    const headers = parseCsvLine(headerLine).map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCsvLine(lines[i]);
        const row = {};
        headers.forEach((h, j) => { row[h] = values[j] ?? ''; });
        rows.push(row);
    }
    return { headers, rows };
}

/** Normalize header to handle slight variations */
function getCol(row, ...names) {
    const keys = Object.keys(row);
    for (const want of names) {
        const key = keys.find(k => String(k).toLowerCase().replace(/\s+/g, '') === String(want).toLowerCase().replace(/\s+/g, ''));
        if (key !== undefined && row[key] !== undefined && row[key] !== '') return row[key];
    }
    return undefined;
}

/** Get tag from a dedicated column (Tag, Player Tag, or empty-headed column) */
function getTagFromColumn(row) {
    const tagVal = getCol(row, 'Tag', 'Player Tag', 'tag', 'Player Tag');
    if (tagVal && TAG_REGEX.test(String(tagVal).trim())) {
        const m = String(tagVal).trim().match(TAG_REGEX);
        return m[0].startsWith('#') ? m[0].toUpperCase() : '#' + m[1].toUpperCase();
    }
    const keys = Object.keys(row);
    const emptyKey = keys.find(k => String(k).trim() === '');
    if (emptyKey !== undefined && row[emptyKey] !== undefined && row[emptyKey] !== '') {
        const v = String(row[emptyKey]).trim();
        if (TAG_REGEX.test(v)) {
            const m = v.match(TAG_REGEX);
            return m[0].startsWith('#') ? m[0].toUpperCase() : '#' + m[1].toUpperCase();
        }
    }
    return null;
}

function toInt(val) {
    if (val === undefined || val === null || val === '') return null;
    const n = parseInt(String(val).replace(/\s/g, ''), 10);
    return Number.isNaN(n) ? null : n;
}

/**
 * Compute a plausible Monday end_date for (season, week) so we can key war_weeks.
 * Season 127 ≈ 2024, 128 ≈ 2025; week 1 = first Monday of that year, etc.
 */
function endDateForSeasonWeek(season, week) {
    const year = 2024 + (season - 127);
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const dayOfWeek = jan1.getUTCDay();
    const firstMondayOffset = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    const firstMonday = new Date(Date.UTC(year, 0, 1 + firstMondayOffset + (week - 1) * 7));
    firstMonday.setUTCHours(9, 30, 0, 0);
    return firstMonday.toISOString();
}

async function run() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const filePath = args.find(a => !a.startsWith('--')) || DEFAULT_CSV;

    if (!fs.existsSync(filePath)) {
        console.error('File not found:', filePath);
        console.error('Expected: ~/Downloads/2026.03.06 - Gladiators Historic Data Upload.csv (or pass a path as first argument).');
        process.exit(1);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const { headers, rows } = parseCsv(content);
    console.log('Headers:', headers.join(', '));
    console.log('Rows:', rows.length);

    const records = [];
    const skipped = [];
    for (const row of rows) {
        const season = toInt(getCol(row, 'Season', 'season'));
        const week = toInt(getCol(row, 'Week', 'week'));
        const rank = toInt(getCol(row, 'Rank', 'rank'));
        const playerNameRaw = getCol(row, 'Player Name', 'PlayerName', 'player name');
        const decksUsed = toInt(getCol(row, 'Decks Used', 'DecksUsed', 'decks used'));
        const boatAttacks = toInt(getCol(row, 'Boat Attacks', 'BoatAttacks', 'boat attacks'));
        const points = toInt(getCol(row, 'Points', 'points'));

        if (season == null || week == null) {
            skipped.push({ row, reason: 'missing season or week' });
            continue;
        }
        let tag = getTagFromColumn(row) || (parsePlayerName(playerNameRaw || '').tag);
        let name = (parsePlayerName(playerNameRaw || '').name) || '';
        if (!tag) {
            skipped.push({ row, reason: 'no player tag (#XXXXXXXX) in Player Name or tag column' });
            continue;
        }
        if (!name) name = tag;

        records.push({
            season,
            week,
            rank,
            name: name || tag,
            tag,
            decksUsed,
            boatAttacks,
            points
        });
    }

    if (skipped.length) {
        console.log('Skipped', skipped.length, 'rows:', skipped.slice(0, 3).map(s => s.reason));
        const sampleRaw = skipped.slice(0, 2).map(s => s.row && getCol(s.row, 'Player Name', 'PlayerName', 'player name'));
        if (sampleRaw.length) console.log('Sample "Player Name" values from skipped rows:', sampleRaw);
    }

    if (dryRun) {
        console.log('Parsed', records.length, 'rows (no DB write). Sample:', JSON.stringify(records.slice(0, 3), null, 2));
        if (records.length > 3) console.log('... and', records.length - 3, 'more.');
        process.exit(0);
    }

    await db.initializeSchema();
    const warWeekCache = new Map();
    const getOrCreateWarWeek = async (season, week) => {
        const key = `${season}-${week}`;
        if (warWeekCache.has(key)) return warWeekCache.get(key);
        const endDate = endDateForSeasonWeek(season, week);
        let warWeek = await db.getWarWeekByEndDate(endDate);
        if (!warWeek) {
            warWeek = await db.upsertWarWeek({
                seasonId: season,
                sectionIndex: 0,
                periodIndex: week,
                startDate: endDate,
                endDate,
                createdDate: endDate,
                dataSource: 'spreadsheet_import'
            });
        }
        warWeekCache.set(key, warWeek);
        return warWeek;
    };

    let membersCreated = 0;
    let participantsCreated = 0;
    for (const r of records) {
        const warWeek = await getOrCreateWarWeek(r.season, r.week);
        await db.upsertMember({
            tag: r.tag,
            name: r.name,
            role: 'member',
            lastSeen: new Date().toISOString(),
            isCurrent: false
        });
        membersCreated++;
        await db.upsertParticipant({
            warWeekId: warWeek.id,
            memberTag: r.tag,
            rank: r.rank,
            warPoints: r.points,
            decksUsed: r.decksUsed,
            boatAttacks: r.boatAttacks,
            trophies: null,
            rawData: { source: 'spreadsheet_import', name: r.name }
        });
        participantsCreated++;
    }

    console.log('Done. Members upserted:', membersCreated, 'Participant rows upserted:', participantsCreated);
    await db.close();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
