#!/usr/bin/env node
/**
 * Archive all stored war history into _archive tables so current war data
 * is not mixed with past history. Main tables (war_weeks, war_participants,
 * war_snapshots) are cleared after copy. You can load past history later
 * from the archive or from a separate import.
 *
 * Usage: node scripts/archive-war-history.js
 */

const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
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

const db = require('../db');

async function ensureArchiveTables() {
    const schemaPath = path.join(__dirname, '..', 'db', 'schema-archive.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
    for (const statement of statements) {
        try {
            await db.pool.query(statement);
        } catch (e) {
            if (!e.message.includes('already exists') && !e.message.includes('does not exist')) {
                console.warn('Schema statement warning:', e.message);
            }
        }
    }
}

async function run() {
    try {
        await db.initializeSchema();
        await ensureArchiveTables();

        const countWeeks = await db.pool.query('SELECT COUNT(*) FROM war_weeks');
        const countParticipants = await db.pool.query('SELECT COUNT(*) FROM war_participants');
        const countSnapshots = await db.pool.query('SELECT COUNT(*) FROM war_snapshots');

        const nw = parseInt(countWeeks.rows[0].count, 10);
        const np = parseInt(countParticipants.rows[0].count, 10);
        const ns = parseInt(countSnapshots.rows[0].count, 10);

        console.log('📊 Current main tables: war_weeks=%d, war_participants=%d, war_snapshots=%d', nw, np, ns);

        if (nw === 0 && np === 0 && ns === 0) {
            console.log('✅ Nothing to archive; main tables are already empty.');
            process.exit(0);
            return;
        }

        console.log('📦 Copying to _archive tables...');

        await db.pool.query('INSERT INTO war_weeks_archive SELECT * FROM war_weeks');
        await db.pool.query('INSERT INTO war_participants_archive SELECT * FROM war_participants');
        await db.pool.query('INSERT INTO war_snapshots_archive SELECT * FROM war_snapshots');

        const archW = await db.pool.query('SELECT COUNT(*) FROM war_weeks_archive');
        const archP = await db.pool.query('SELECT COUNT(*) FROM war_participants_archive');
        const archS = await db.pool.query('SELECT COUNT(*) FROM war_snapshots_archive');
        console.log('   Archive now has: war_weeks_archive=%s, war_participants_archive=%s, war_snapshots_archive=%s',
            archW.rows[0].count, archP.rows[0].count, archS.rows[0].count);

        console.log('🗑️  Clearing main tables...');
        await db.pool.query('DELETE FROM war_snapshots');
        await db.pool.query('DELETE FROM war_participants');
        await db.pool.query('DELETE FROM war_weeks');

        console.log('✅ Done. All historical data is in _archive; main tables are empty for current war only.');
    } catch (err) {
        console.error('❌ Archive failed:', err);
        process.exit(1);
    } finally {
        await db.close();
    }
}

run();
