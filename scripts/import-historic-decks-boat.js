#!/usr/bin/env node
/**
 * Import historic decks used and boat attacks from CSV.
 * Does NOT overwrite war_points or rank — only updates decks_used and boat_attacks.
 *
 * CSV columns: Season, Week, Player Name, Player Tag, Decks Used, Boat Attacks, Points Per Deck
 *
 * Usage: node scripts/import-historic-decks-boat.js <path-to-csv>
 * Example: node scripts/import-historic-decks-boat.js "historic Data gladiators upload - decks, boat attacks, points per deck.csv"
 */

const fs = require('fs');
const path = require('path');
const db = require('../db');

function normalizeTag(tag) {
    if (!tag || typeof tag !== 'string') return '';
    const t = tag.trim();
    return t.startsWith('#') ? t : '#' + t;
}

function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            inQuotes = !inQuotes;
        } else if (inQuotes) {
            current += c;
        } else if (c === ',') {
            result.push(current.trim());
            current = '';
        } else {
            current += c;
        }
    }
    result.push(current.trim());
    return result;
}

async function main() {
    const csvPath = process.argv[2];
    if (!csvPath) {
        console.error('Usage: node scripts/import-historic-decks-boat.js <path-to-csv>');
        process.exit(1);
    }
    const resolved = path.resolve(csvPath);
    if (!fs.existsSync(resolved)) {
        console.error('File not found:', resolved);
        process.exit(1);
    }

    const content = fs.readFileSync(resolved, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < lines.length; i++) {
        const row = parseCsvLine(lines[i]);
        const season = parseInt(row[0], 10);
        const week = parseInt(row[1], 10);
        if (isNaN(season) || isNaN(week)) continue; // skip header / non-data rows
        const playerName = row[2];
        const tag = normalizeTag(row[3]);
        const decksUsed = row[4] !== '' && row[4] !== undefined ? parseInt(row[4], 10) : null;
        const boatAttacks = row[5] !== '' && row[5] !== undefined ? parseInt(row[5], 10) : null;

        if (!tag) {
            skipped++;
            continue;
        }

        const weeks = await db.getWarWeeksBySeasonPeriod(season, week);
        if (!weeks.length) {
            console.warn(`No war week for S${season}W${week}, skipping ${playerName} (${tag})`);
            skipped++;
            continue;
        }
        const warWeekId = weeks[0].id;

        try {
            const ok = await db.updateParticipantDecksBoatOnly(warWeekId, tag, decksUsed, boatAttacks);
            if (ok) updated++;
            else skipped++;
        } catch (err) {
            console.warn(`Error updating ${tag} for S${season}W${week}:`, err.message);
            errors++;
        }
    }

    console.log('Done.');
    console.log('Updated:', updated, 'Skipped:', skipped, 'Errors:', errors);
    await db.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
