#!/usr/bin/env node
/**
 * Update member names in the database
 * 
 * Usage: node scripts/update-member-names.js
 * 
 * This script updates member names for players who have tags but missing/incorrect names.
 */

const db = require('../db');

// Tag to name mapping
const nameUpdates = {
    '#20YL8PG2UY': 'womplex',
    '#JGYCJCGL': 'ShadowFang',
    '#PPVRVUC9P': 'Zeo2166',
    '#UYPQP2RJJ': 'BigXthaPlug',
    '#V9V9PVJGV': 'hi hi',
    '#2QR9GLY20': 'Irac',
    '#2RUCPR0PP': 'Berg',
    '#8P8PJGGC9': '3>Andrés',
    '#998URGYRP': 'GuDANTEGu',
    '#9C0Y0YUR8': 'OneShot OneXX',
    '#CG9CL2RV9': 'venom',
    '#CUJGYC90C': 'ᑭᖇOᒍᗴᑕTᘔOᑌᒪՏ',
    '#GJLVVV00U': 'Gearup22',
    '#GULP28RUQ': 'bryant',
    '#LQJPQLJ9U': 'you got wrecked',
    '#U9GPV0U28': 'Nytriz',
    '#UPYGQYQLG': 'koolbreeze91',
    '#UVGC99PR2': 'Ploompers',
    '#V0UJ0Q8R': 'freakypollito',
    '#V2LRQQCY0': 'davidgon555',
    '#VV29R02QG': 'jimbobthethird'
};

async function updateMemberNames() {
    console.log('🔄 Updating member names...\n');
    
    let updated = 0;
    let created = 0;
    let errors = 0;
    
    for (const [tag, name] of Object.entries(nameUpdates)) {
        try {
            const existing = await db.getMemberByTag(tag);
            
            if (existing) {
                // Update existing member
                await db.upsertMember({
                    tag: tag,
                    name: name,
                    role: existing.role || 'member',
                    firstSeen: existing.firstSeen,
                    joinedAt: existing.joinedAt,
                    lastSeen: existing.lastSeen,
                    tenureKnown: existing.tenureKnown,
                    isCurrent: existing.isCurrent
                });
                console.log(`✅ Updated: ${tag} → ${name}`);
                updated++;
            } else {
                // Create new member if doesn't exist
                const now = new Date().toISOString();
                await db.upsertMember({
                    tag: tag,
                    name: name,
                    role: 'member',
                    firstSeen: now,
                    joinedAt: now,
                    lastSeen: now,
                    tenureKnown: false,
                    isCurrent: false // Assume not current if we're just adding name
                });
                console.log(`➕ Created: ${tag} → ${name}`);
                created++;
            }
        } catch (error) {
            console.error(`❌ Error updating ${tag}:`, error.message);
            errors++;
        }
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Created: ${created}`);
    console.log(`   Errors: ${errors}`);
    console.log(`\n✅ Done!`);
}

// Run update
if (require.main === module) {
    updateMemberNames()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('❌ Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { updateMemberNames };
