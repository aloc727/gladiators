#!/usr/bin/env node
/**
 * Migration script: JSON files → PostgreSQL database
 * 
 * Usage: node scripts/migrate-to-postgres.js
 * 
 * This script:
 * 1. Reads existing JSON files (members.json, war-history.json, war-snapshots.json)
 * 2. Creates database schema if needed
 * 3. Migrates all data to PostgreSQL
 * 4. Creates backups of JSON files
 * 5. Verifies data integrity
 */

const fs = require('fs');
const path = require('path');

// Load .env file before requiring db.js
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

// Debug: Check if password is loaded
console.log('🔍 Debug: DB_PASSWORD loaded:', process.env.DB_PASSWORD ? `Yes (length: ${process.env.DB_PASSWORD.length})` : 'No');

const db = require('../db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json');
const HISTORY_FILE = path.join(DATA_DIR, 'war-history.json');
const SNAPSHOTS_FILE = path.join(DATA_DIR, 'war-snapshots.json');

async function loadJSONFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            console.log(`⚠️  File not found: ${filePath}`);
            return null;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`❌ Error loading ${filePath}:`, error.message);
        return null;
    }
}

function backupFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    
    const backupPath = `${filePath}.backup`;
    fs.copyFileSync(filePath, backupPath);
    console.log(`✅ Backed up: ${path.basename(filePath)} → ${path.basename(backupPath)}`);
}

async function migrateMembers() {
    console.log('\n📋 Migrating members...');
    
    const data = await loadJSONFile(MEMBERS_FILE);
    if (!data || !data.items || !Array.isArray(data.items)) {
        console.log('⚠️  No members data to migrate');
        return 0;
    }
    
    let migrated = 0;
    for (const member of data.items) {
        try {
            await db.upsertMember({
                tag: member.tag,
                name: member.name,
                role: member.role,
                firstSeen: member.firstSeen || null,
                joinedAt: member.joinedAt || null,
                lastSeen: member.lastSeen || null,
                tenureKnown: member.tenureKnown || false,
                isCurrent: member.isCurrent !== undefined ? member.isCurrent : true
            });
            migrated++;
        } catch (error) {
            console.error(`❌ Error migrating member ${member.tag}:`, error.message);
        }
    }
    
    console.log(`✅ Migrated ${migrated} members`);
    return migrated;
}

async function migrateWarHistory() {
    console.log('\n📋 Migrating war history...');
    
    const data = await loadJSONFile(HISTORY_FILE);
    if (!data || !data.items || !Array.isArray(data.items)) {
        console.log('⚠️  No war history data to migrate');
        return { weeks: 0, participants: 0 };
    }
    
    let weeksMigrated = 0;
    let participantsMigrated = 0;
    
    for (const war of data.items) {
        try {
            // Insert or update war week
            const warWeek = await db.upsertWarWeek({
                seasonId: war.seasonId || null,
                sectionIndex: war.sectionIndex || null,
                periodIndex: war.periodIndex || null,
                startDate: war.startDate || war.createdDate,
                endDate: war.endDate || war.createdDate,
                createdDate: war.createdDate || null,
                dataSource: war.dataSource || 'riverrace'
            });
            
            weeksMigrated++;
            
            // Migrate participants
            if (war.participants && Array.isArray(war.participants)) {
                for (const participant of war.participants) {
                    try {
                        await db.upsertParticipant({
                            warWeekId: warWeek.id,
                            memberTag: participant.tag,
                            rank: participant.rank || null,
                            warPoints: participant.warPoints || participant.fame || null,
                            decksUsed: participant.decksUsed || participant.decksUsed || null,
                            boatAttacks: participant.boatAttacks || null,
                            trophies: participant.trophies || null,
                            rawData: participant // Store full object
                        });
                        participantsMigrated++;
                    } catch (error) {
                        console.error(`❌ Error migrating participant ${participant.tag} for war ${war.endDate}:`, error.message);
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Error migrating war ${war.endDate}:`, error.message);
        }
    }
    
    console.log(`✅ Migrated ${weeksMigrated} war weeks and ${participantsMigrated} participants`);
    return { weeks: weeksMigrated, participants: participantsMigrated };
}

async function migrateSnapshots() {
    console.log('\n📋 Migrating war snapshots...');
    
    const data = await loadJSONFile(SNAPSHOTS_FILE);
    if (!data || !data.weeks || typeof data.weeks !== 'object') {
        console.log('⚠️  No snapshot data to migrate');
        return 0;
    }
    
    let snapshotsMigrated = 0;
    
    for (const [weekKey, snapshots] of Object.entries(data.weeks)) {
        if (!Array.isArray(snapshots)) continue;
        
        // Find or create war week for this snapshot
        // Week key format: "2026-01-12T10:30:00.000Z" (end date)
        const endDate = weekKey;
        let warWeek = await db.getWarWeekByEndDate(endDate);
        
        if (!warWeek) {
            // Create a placeholder war week if it doesn't exist
            warWeek = await db.upsertWarWeek({
                endDate: endDate,
                startDate: endDate, // Will be updated later
                dataSource: 'snapshot'
            });
        }
        
        for (const snapshot of snapshots) {
            try {
                await db.saveSnapshot(
                    warWeek.id,
                    snapshot.snapshotTime || snapshot.time || new Date().toISOString(),
                    snapshot.snapshotData || snapshot.data || snapshot
                );
                snapshotsMigrated++;
            } catch (error) {
                console.error(`❌ Error migrating snapshot for week ${weekKey}:`, error.message);
            }
        }
    }
    
    console.log(`✅ Migrated ${snapshotsMigrated} snapshots`);
    return snapshotsMigrated;
}

async function verifyMigration() {
    console.log('\n🔍 Verifying migration...');
    
    try {
        const memberCount = await db.pool.query('SELECT COUNT(*) FROM members');
        const weekCount = await db.pool.query('SELECT COUNT(*) FROM war_weeks');
        const participantCount = await db.pool.query('SELECT COUNT(*) FROM war_participants');
        const snapshotCount = await db.pool.query('SELECT COUNT(*) FROM war_snapshots');
        
        console.log(`   Members: ${memberCount.rows[0].count}`);
        console.log(`   War weeks: ${weekCount.rows[0].count}`);
        console.log(`   Participants: ${participantCount.rows[0].count}`);
        console.log(`   Snapshots: ${snapshotCount.rows[0].count}`);
        
        return true;
    } catch (error) {
        console.error('❌ Verification failed:', error.message);
        return false;
    }
}

async function main() {
    console.log('🚀 Starting PostgreSQL migration...\n');
    
    try {
        // Initialize schema
        console.log('📐 Initializing database schema...');
        await db.initializeSchema();
        
        // Create backups
        console.log('\n💾 Creating backups...');
        backupFile(MEMBERS_FILE);
        backupFile(HISTORY_FILE);
        backupFile(SNAPSHOTS_FILE);
        
        // Migrate data
        await migrateMembers();
        await migrateWarHistory();
        await migrateSnapshots();
        
        // Verify
        await verifyMigration();
        
        console.log('\n✅ Migration complete!');
        console.log('\n📝 Next steps:');
        console.log('   1. Update server.js to use db.js instead of JSON files');
        console.log('   2. Test the application');
        console.log('   3. Keep JSON backups as safety net');
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await db.close();
    }
}

// Run migration
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
