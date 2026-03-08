/**
 * PostgreSQL Database Helper Module
 * Handles all database operations for the Gladiators war stats app
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Load database connection from environment variables
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'gladiators',
    user: process.env.DB_USER || 'gladiators_user',
    password: process.env.DB_PASSWORD || '',
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle PostgreSQL client', err);
    process.exit(-1);
});

/**
 * Members Operations
 */

async function getMembers(includeFormer = false) {
    const query = includeFormer
        ? 'SELECT * FROM members ORDER BY name'
        : 'SELECT * FROM members WHERE is_current = true ORDER BY name';
    
    const result = await pool.query(query);
    return result.rows.map(row => ({
        tag: row.tag,
        name: row.name,
        role: row.role,
        firstSeen: row.first_seen,
        joinedAt: row.joined_at,
        lastSeen: row.last_seen,
        tenureKnown: row.tenure_known,
        isCurrent: row.is_current
    }));
}

async function getMemberByTag(tag) {
    const result = await pool.query('SELECT * FROM members WHERE tag = $1', [tag]);
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
        tag: row.tag,
        name: row.name,
        role: row.role,
        firstSeen: row.first_seen,
        joinedAt: row.joined_at,
        lastSeen: row.last_seen,
        tenureKnown: row.tenure_known,
        isCurrent: row.is_current
    };
}

async function upsertMember(member) {
    const query = `
        INSERT INTO members (tag, name, role, first_seen, joined_at, last_seen, tenure_known, is_current, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        ON CONFLICT (tag) DO UPDATE SET
            name = EXCLUDED.name,
            role = EXCLUDED.role,
            first_seen = COALESCE(EXCLUDED.first_seen, members.first_seen),
            joined_at = COALESCE(EXCLUDED.joined_at, members.joined_at),
            last_seen = GREATEST(EXCLUDED.last_seen, members.last_seen),
            tenure_known = EXCLUDED.tenure_known,
            is_current = EXCLUDED.is_current,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    
    const values = [
        member.tag,
        member.name,
        member.role,
        member.firstSeen || null,
        member.joinedAt || null,
        member.lastSeen || new Date().toISOString(),
        member.tenureKnown || false,
        member.isCurrent !== undefined ? member.isCurrent : true
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
}

async function updateMemberCurrentStatus(tag, isCurrent) {
    await pool.query(
        'UPDATE members SET is_current = $1, updated_at = CURRENT_TIMESTAMP WHERE tag = $2',
        [isCurrent, tag]
    );
}

/**
 * War Weeks Operations
 */

async function getWarWeeks(limit = null) {
    const query = limit
        ? 'SELECT * FROM war_weeks ORDER BY end_date DESC LIMIT $1'
        : 'SELECT * FROM war_weeks ORDER BY end_date DESC';
    
    const params = limit ? [limit] : [];
    const result = await pool.query(query, params);

    return result.rows.map(row => {
        // Convert Date objects to ISO strings to preserve the exact date
        // PostgreSQL TIMESTAMP is returned as Date object by pg library
        // We need to convert to string to preserve the date value
        const endDate = row.end_date instanceof Date ? row.end_date.toISOString() : row.end_date;
        const startDate = row.start_date instanceof Date ? row.start_date.toISOString() : row.start_date;
        const createdDate = row.created_date instanceof Date ? row.created_date.toISOString() : row.created_date;
        
        return {
            id: row.id,
            seasonId: row.season_id,
            sectionIndex: row.section_index,
            periodIndex: row.period_index,
            startDate: startDate,
            endDate: endDate, // Keep as ISO string to preserve date
            createdDate: createdDate,
            dataSource: row.data_source
        };
    });
}

async function getWarWeekByEndDate(endDate) {
    // Convert endDate to proper format for comparison
    // PostgreSQL TIMESTAMP comparison needs to handle timezone correctly
    let dateValue = endDate;
    if (endDate instanceof Date) {
        dateValue = endDate.toISOString();
    } else if (typeof endDate === 'string') {
        // Ensure it's in ISO format
        dateValue = new Date(endDate).toISOString();
    }
    
    // Use date_trunc to compare dates at the day level (ignore time differences)
    // This prevents timezone issues from causing mismatches
    const result = await pool.query(
        `SELECT * FROM war_weeks 
         WHERE DATE_TRUNC('day', end_date) = DATE_TRUNC('day', $1::timestamp)
         ORDER BY end_date DESC
         LIMIT 1`,
        [dateValue]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
        id: row.id,
        seasonId: row.season_id,
        sectionIndex: row.section_index,
        periodIndex: row.period_index,
        startDate: row.start_date,
        endDate: row.end_date,
        createdDate: row.created_date,
        dataSource: row.data_source
    };
}

async function upsertWarWeek(warWeek) {
    // First try to find existing war week by unique constraint (season_id, section_index, period_index, end_date)
    // This is more reliable than just end_date which might match multiple weeks
    let existing = null;
    
    if (warWeek.seasonId !== null && warWeek.sectionIndex !== null && warWeek.periodIndex !== null) {
        // Try to find by unique constraint first
        const result = await pool.query(
            `SELECT * FROM war_weeks 
             WHERE season_id = $1 AND section_index = $2 AND period_index = $3 AND end_date = $4
             LIMIT 1`,
            [warWeek.seasonId, warWeek.sectionIndex, warWeek.periodIndex, warWeek.endDate]
        );
        if (result.rows.length > 0) {
            existing = result.rows[0];
        }
    }
    
    // Fallback to end_date match if unique constraint didn't work
    if (!existing) {
        existing = await getWarWeekByEndDate(warWeek.endDate);
    }
    
    if (existing) {
        // Update existing record, preserving season info if it exists
        const query = `
            UPDATE war_weeks 
            SET 
                season_id = COALESCE($1, season_id),
                section_index = COALESCE($2, section_index),
                period_index = COALESCE($3, period_index),
                start_date = COALESCE($4, start_date),
                created_date = COALESCE($5, created_date),
                data_source = $6
            WHERE id = $7
            RETURNING *
        `;
        
        const values = [
            warWeek.seasonId || null,
            warWeek.sectionIndex !== undefined ? warWeek.sectionIndex : null,
            warWeek.periodIndex !== undefined ? warWeek.periodIndex : null,
            warWeek.startDate || null,
            warWeek.createdDate || null,
            warWeek.dataSource || 'riverrace',
            existing.id
        ];
        
        const result = await pool.query(query, values);
        return result.rows[0];
    } else {
        // Insert new record
        const query = `
            INSERT INTO war_weeks (season_id, section_index, period_index, start_date, end_date, created_date, data_source)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        
        const values = [
            warWeek.seasonId || null,
            warWeek.sectionIndex !== undefined ? warWeek.sectionIndex : null,
            warWeek.periodIndex !== undefined ? warWeek.periodIndex : null,
            warWeek.startDate,
            warWeek.endDate,
            warWeek.createdDate || null,
            warWeek.dataSource || 'riverrace'
        ];
        
        const result = await pool.query(query, values);
        return result.rows[0];
    }
}

/**
 * War Participants Operations
 */

async function getParticipantsByWarWeek(warWeekId) {
    const result = await pool.query(
        'SELECT * FROM war_participants WHERE war_week_id = $1 ORDER BY rank ASC NULLS LAST',
        [warWeekId]
    );
    
    return result.rows.map(row => ({
        id: row.id,
        warWeekId: row.war_week_id,
        memberTag: row.member_tag,
        rank: row.rank,
        warPoints: row.war_points,
        decksUsed: row.decks_used,
        boatAttacks: row.boat_attacks,
        trophies: row.trophies,
        rawData: row.raw_data
    }));
}

async function upsertParticipant(participant) {
    const query = `
        INSERT INTO war_participants (war_week_id, member_tag, rank, war_points, decks_used, boat_attacks, trophies, raw_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (war_week_id, member_tag) DO UPDATE SET
            rank = EXCLUDED.rank,
            war_points = EXCLUDED.war_points,
            decks_used = EXCLUDED.decks_used,
            boat_attacks = EXCLUDED.boat_attacks,
            trophies = EXCLUDED.trophies,
            raw_data = EXCLUDED.raw_data
        RETURNING *
    `;
    
    const values = [
        participant.warWeekId,
        participant.memberTag,
        participant.rank || null,
        participant.warPoints || null,
        participant.decksUsed || null,
        participant.boatAttacks || null,
        participant.trophies || null,
        participant.rawData ? JSON.stringify(participant.rawData) : null
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
}

/**
 * War Snapshots Operations
 */

async function saveSnapshot(warWeekId, snapshotTime, snapshotData) {
    const query = `
        INSERT INTO war_snapshots (war_week_id, snapshot_time, snapshot_data)
        VALUES ($1, $2, $3)
        RETURNING *
    `;
    
    const values = [
        warWeekId,
        snapshotTime,
        JSON.stringify(snapshotData)
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
}

async function getSnapshotsByWarWeek(warWeekId) {
    const result = await pool.query(
        'SELECT * FROM war_snapshots WHERE war_week_id = $1 ORDER BY snapshot_time ASC',
        [warWeekId]
    );
    
    return result.rows.map(row => ({
        id: row.id,
        warWeekId: row.war_week_id,
        snapshotTime: row.snapshot_time,
        snapshotData: row.snapshot_data
    }));
}

/**
 * Promotion History (Member -> Elder -> Co-Leader)
 */
const ROLE_RANK = { member: 1, elder: 2, coleader: 3, leader: 4 };

function isPromotion(fromRole, toRole) {
    const from = ROLE_RANK[(fromRole || '').toLowerCase()] || 0;
    const to = ROLE_RANK[(toRole || '').toLowerCase()] || 0;
    return to > from && from >= 1 && to <= 4;
}

async function recordPromotion(memberTag, fromRole, toRole) {
    if (!memberTag || !fromRole || !toRole || !isPromotion(fromRole, toRole)) return null;
    const result = await pool.query(
        `INSERT INTO promotion_history (member_tag, from_role, to_role)
         VALUES ($1, $2, $3) RETURNING *`,
        [memberTag, (fromRole || '').toLowerCase(), (toRole || '').toLowerCase()]
    );
    return result.rows[0] ? { id: result.rows[0].id, memberTag, fromRole, toRole, promotedAt: result.rows[0].promoted_at } : null;
}

async function getLastPromotion() {
    const result = await pool.query(
        `SELECT ph.*, m.name FROM promotion_history ph
         LEFT JOIN members m ON m.tag = ph.member_tag
         ORDER BY ph.promoted_at DESC LIMIT 1`
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return { tag: r.member_tag, name: r.name || r.member_tag, fromRole: r.from_role, toRole: r.to_role, promotedAt: r.promoted_at };
}

async function getRecentPromotions(limit = 10) {
    const result = await pool.query(
        `SELECT ph.*, m.name FROM promotion_history ph
         LEFT JOIN members m ON m.tag = ph.member_tag
         ORDER BY ph.promoted_at DESC LIMIT $1`,
        [limit]
    );
    return result.rows.map(r => ({ tag: r.member_tag, name: r.name || r.member_tag, fromRole: r.from_role, toRole: r.to_role, promotedAt: r.promoted_at }));
}

async function getPromotionsByMember(tag) {
    const result = await pool.query(
        'SELECT * FROM promotion_history WHERE member_tag = $1 ORDER BY promoted_at DESC LIMIT 1',
        [tag]
    );
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return { fromRole: r.from_role, toRole: r.to_role, promotedAt: r.promoted_at };
}

/**
 * Utility Functions
 */

async function initializeSchema() {
    const schemaPath = path.join(__dirname, 'db', 'schema-postgres.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Remove comments and split by semicolons
    const statements = schema
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('--'))
        .join('\n')
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    
    for (const statement of statements) {
        try {
            await pool.query(statement);
        } catch (error) {
            // Ignore "already exists" errors
            if (error.message.includes('already exists')) {
                // Table/index already exists, that's fine
                continue;
            }
            // For other errors, log but continue (might be dependency issues)
            if (!error.message.includes('does not exist')) {
                console.warn('Schema initialization warning:', error.message);
            }
        }
    }
    
    // Verify tables were created
    const tables = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('members', 'war_weeks', 'war_participants', 'war_snapshots', 'promotion_history')
    `);
    
    if (tables.rows.length >= 4) {
        console.log('✅ Database schema initialized (all tables created)');
    } else {
        console.log(`⚠️  Database schema initialized, but only ${tables.rows.length}/4 tables found`);
        console.log('   Found tables:', tables.rows.map(r => r.table_name).join(', '));
    }
}

async function close() {
    await pool.end();
}

module.exports = {
    // Members
    getMembers,
    getMemberByTag,
    upsertMember,
    updateMemberCurrentStatus,
    
    // War Weeks
    getWarWeeks,
    getWarWeekByEndDate,
    upsertWarWeek,
    
    // Participants
    getParticipantsByWarWeek,
    upsertParticipant,
    
    // Snapshots
    saveSnapshot,
    getSnapshotsByWarWeek,
    
    // Promotions
    isPromotion,
    recordPromotion,
    getLastPromotion,
    getRecentPromotions,
    getPromotionsByMember,
    
    // Utility
    initializeSchema,
    close,
    
    // Direct pool access (for custom queries)
    pool
};
