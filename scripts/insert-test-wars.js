/**
 * Script to insert fake test war data for debugging
 * This creates 2 historical wars with 2 participants each
 * Marked as fake data so it can be deleted later
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

async function insertTestWars() {
    try {
        console.log('🧪 Inserting test war data...');
        
        // Get Tidal Owl and Mister member tags
        const tidalOwl = await db.getMemberByTag('#TIDALOWL_TAG'); // We'll need to find the actual tag
        const mister = await db.getMemberByTag('#MISTER_TAG'); // We'll need to find the actual tag
        
        // First, let's find these members by name
        const allMembers = await db.getMembers(true);
        const tidalOwlMember = allMembers.find(m => m.name && (m.name.toLowerCase().includes('tidal') || m.name.toLowerCase().includes('owl')));
        const misterMember = allMembers.find(m => m.name && m.name.toLowerCase().includes('mister'));
        
        if (!tidalOwlMember) {
            console.log('⚠️  Could not find Tidal Owl by name, trying to find by tag or creating placeholder...');
            // Try to find any member or use a placeholder
            const firstMember = allMembers[0];
            if (!firstMember) {
                console.error('❌ No members found in database');
                return;
            }
            console.log(`   Using ${firstMember.name} (${firstMember.tag}) as placeholder for Tidal Owl`);
            // We'll use the first member as a placeholder
        }
        if (!misterMember) {
            console.log('⚠️  Could not find Mister by name, trying to find by tag...');
            const firstMember = allMembers[0];
            if (!firstMember) {
                console.error('❌ No members found in database');
                return;
            }
            console.log(`   Using ${firstMember.name} (${firstMember.tag}) as placeholder for Mister`);
        }
        
        // Use found members or placeholders
        const tidalOwl = tidalOwlMember || allMembers[0];
        const mister = misterMember || allMembers[1] || allMembers[0];
        
        console.log(`Using members: ${tidalOwl.name} (${tidalOwl.tag}), ${mister.name} (${mister.tag})`);
        
        // War 1: Season 126 Week 3, Nov 12-17, 2025
        // Thursday 4:30 AM CT = 10:30 AM UTC (CT is UTC-6 in November)
        const war1Start = new Date('2025-11-12T10:30:00.000Z'); // Thursday 4:30 AM CT
        const war1End = new Date('2025-11-17T10:30:00.000Z'); // Monday 4:30 AM CT
        
        const war1 = await db.upsertWarWeek({
            seasonId: 126,
            sectionIndex: null,
            periodIndex: 3,
            startDate: war1Start.toISOString(),
            endDate: war1End.toISOString(),
            createdDate: war1Start.toISOString(),
            dataSource: 'test_fake_data' // Mark as fake
        });
        
        console.log(`✅ Created war week 1: id=${war1.id}, endDate=${war1End.toISOString()}`);
        
        // Insert participants for war 1
        await db.upsertParticipant({
            warWeekId: war1.id,
            memberTag: tidalOwl.tag,
            rank: 1,
            warPoints: 1600,
            decksUsed: 16,
            boatAttacks: null,
            trophies: null,
            rawData: { testData: true, note: 'Fake test data - delete later' }
        });
        
        await db.upsertParticipant({
            warWeekId: war1.id,
            memberTag: mister.tag,
            rank: 2,
            warPoints: 1500,
            decksUsed: 15,
            boatAttacks: null,
            trophies: null,
            rawData: { testData: true, note: 'Fake test data - delete later' }
        });
        
        console.log(`✅ Added 2 participants to war 1`);
        
        // War 2: Season 126 Week 2, Nov 5-10, 2025 (one week earlier)
        const war2Start = new Date('2025-11-05T10:30:00.000Z'); // Thursday 4:30 AM CT
        const war2End = new Date('2025-11-10T10:30:00.000Z'); // Monday 4:30 AM CT
        
        const war2 = await db.upsertWarWeek({
            seasonId: 126,
            sectionIndex: null,
            periodIndex: 2,
            startDate: war2Start.toISOString(),
            endDate: war2End.toISOString(),
            createdDate: war2Start.toISOString(),
            dataSource: 'test_fake_data' // Mark as fake
        });
        
        console.log(`✅ Created war week 2: id=${war2.id}, endDate=${war2End.toISOString()}`);
        
        // Insert participants for war 2
        await db.upsertParticipant({
            warWeekId: war2.id,
            memberTag: mister.tag,
            rank: 1,
            warPoints: 1600,
            decksUsed: 16,
            boatAttacks: null,
            trophies: null,
            rawData: { testData: true, note: 'Fake test data - delete later' }
        });
        
        await db.upsertParticipant({
            warWeekId: war2.id,
            memberTag: tidalOwl.tag,
            rank: 2,
            warPoints: 1500,
            decksUsed: 15,
            boatAttacks: null,
            trophies: null,
            rawData: { testData: true, note: 'Fake test data - delete later' }
        });
        
        console.log(`✅ Added 2 participants to war 2`);
        
        console.log('\n✅ Test wars inserted successfully!');
        console.log('   War 1: Season 126 Week 3 (Nov 12-17, 2025)');
        console.log('   War 2: Season 126 Week 2 (Nov 5-10, 2025)');
        console.log('\n⚠️  These are marked as fake data (data_source="test_fake_data")');
        console.log('   You can delete them later with:');
        console.log('   DELETE FROM war_weeks WHERE data_source = \'test_fake_data\';');
        
    } catch (error) {
        console.error('❌ Error inserting test wars:', error);
    } finally {
        await db.close();
    }
}

insertTestWars();
