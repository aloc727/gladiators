#!/usr/bin/env node
/**
 * Export war_weeks and war_participants to a SQL file with UPSERTs.
 * Run on EC2 (where the DB lives): node scripts/export-war-data-upsert.js [output.sql]
 * Default output: scripts/war-data-backup-YYYY-MM-DD.sql
 *
 * To restore: psql -U gladiators_user -d gladiators -h localhost -f scripts/war-data-backup-YYYY-MM-DD.sql
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');
if (require('fs').existsSync(envPath)) {
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

const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'gladiators',
    user: process.env.DB_USER || 'gladiators_user',
    password: process.env.DB_PASSWORD || '',
});

function sqlEscape(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number' && Number.isInteger(val)) return String(val);
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    const s = String(val).replace(/'/g, "''");
    return `'${s}'`;
}

function sqlTimestamp(val) {
    if (val === null || val === undefined) return 'NULL';
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return 'NULL';
    return `'${d.toISOString().replace('T', ' ').replace('Z', '+00')}'`;
}

function sqlJsonb(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'object') return sqlEscape(JSON.stringify(val));
    return sqlEscape(val);
}

async function run() {
    const outPath = process.argv[2] || path.join(__dirname, `war-data-backup-${new Date().toISOString().slice(0, 10)}.sql`);
    const lines = [];

    lines.push('-- Gladiators war_weeks + war_participants backup (upsert)');
    lines.push(`-- Generated ${new Date().toISOString()}`);
    lines.push('-- Restore: psql -U gladiators_user -d gladiators -h localhost -f ' + path.basename(outPath));
    lines.push('');

    const client = await pool.connect();

    try {
        const weeks = (await client.query('SELECT * FROM war_weeks ORDER BY id')).rows;
        lines.push(`-- war_weeks (${weeks.length} rows)`);
        lines.push('INSERT INTO war_weeks (id, season_id, section_index, period_index, start_date, end_date, created_date, data_source, created_at)');
        lines.push('VALUES');
        const weekVals = weeks.map((r, i) => {
            const start = sqlTimestamp(r.start_date);
            const end = sqlTimestamp(r.end_date);
            const created = sqlTimestamp(r.created_date);
            const source = sqlEscape(r.data_source);
            const at = sqlTimestamp(r.created_at);
            const sid = r.season_id == null ? 'NULL' : Number(r.season_id);
            const six = r.section_index == null ? 'NULL' : Number(r.section_index);
            const pix = r.period_index == null ? 'NULL' : Number(r.period_index);
            return `  (${r.id}, ${sid}, ${six}, ${pix}, ${start}, ${end}, ${created}, ${source}, ${at})`;
        });
        lines.push(weekVals.join(',\n'));
        lines.push('ON CONFLICT (id) DO UPDATE SET');
        lines.push('  season_id = EXCLUDED.season_id, section_index = EXCLUDED.section_index, period_index = EXCLUDED.period_index,');
        lines.push('  start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date, created_date = EXCLUDED.created_date,');
        lines.push('  data_source = EXCLUDED.data_source, created_at = EXCLUDED.created_at;');
        lines.push('');

        const participants = (await client.query('SELECT * FROM war_participants ORDER BY id')).rows;
        lines.push(`-- war_participants (${participants.length} rows)`);
        lines.push('INSERT INTO war_participants (id, war_week_id, member_tag, rank, war_points, decks_used, boat_attacks, trophies, raw_data, created_at)');
        lines.push('VALUES');
        const partVals = participants.map((r) => {
            const tag = sqlEscape(r.member_tag);
            const rank = r.rank == null ? 'NULL' : Number(r.rank);
            const pts = r.war_points == null ? 'NULL' : Number(r.war_points);
            const decks = r.decks_used == null ? 'NULL' : Number(r.decks_used);
            const boat = r.boat_attacks == null ? 'NULL' : Number(r.boat_attacks);
            const troph = r.trophies == null ? 'NULL' : Number(r.trophies);
            const raw = sqlJsonb(r.raw_data);
            const at = sqlTimestamp(r.created_at);
            return `  (${r.id}, ${r.war_week_id}, ${tag}, ${rank}, ${pts}, ${decks}, ${boat}, ${troph}, ${raw}, ${at})`;
        });
        lines.push(partVals.join(',\n'));
        lines.push('ON CONFLICT (id) DO UPDATE SET');
        lines.push('  war_week_id = EXCLUDED.war_week_id, member_tag = EXCLUDED.member_tag, rank = EXCLUDED.rank,');
        lines.push('  war_points = EXCLUDED.war_points, decks_used = EXCLUDED.decks_used, boat_attacks = EXCLUDED.boat_attacks,');
        lines.push('  trophies = EXCLUDED.trophies, raw_data = EXCLUDED.raw_data, created_at = EXCLUDED.created_at;');
        lines.push('');
        lines.push('-- Reset sequences so future inserts get new ids');
        lines.push("SELECT setval(pg_get_serial_sequence('war_weeks', 'id'), (SELECT COALESCE(MAX(id), 1) FROM war_weeks));");
        lines.push("SELECT setval(pg_get_serial_sequence('war_participants', 'id'), (SELECT COALESCE(MAX(id), 1) FROM war_participants));");
        lines.push('');
    } finally {
        client.release();
        await pool.end();
    }

    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
    console.log('Wrote', outPath);
    console.log('Restore with: psql -U gladiators_user -d gladiators -h localhost -f', path.basename(outPath));
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
