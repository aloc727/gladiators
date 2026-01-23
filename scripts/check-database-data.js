#!/usr/bin/env node

/**
 * Diagnostic script to check what data is in the database
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

const db = require('../db');

async function checkDatabase() {
    try {
        console.log('🔍 Checking database contents...\n');
        
        // Check war weeks
        const warWeeks = await db.getWarWeeks();
        console.log(`📊 War Weeks: ${warWeeks.length} total`);
        
        if (warWeeks.length > 0) {
            console.log('\n📅 Most recent war weeks:');
            warWeeks.slice(0, 10).forEach((week, index) => {
                console.log(`  ${index + 1}. Season ${week.seasonId || 'N/A'} Week ${week.periodIndex || 'N/A'} - End: ${week.endDate}`);
            });
            
            if (warWeeks.length > 10) {
                console.log(`  ... and ${warWeeks.length - 10} more`);
            }
            
            console.log('\n📅 Oldest war weeks:');
            const oldest = warWeeks.slice(-5);
            oldest.forEach((week, index) => {
                console.log(`  ${index + 1}. Season ${week.seasonId || 'N/A'} Week ${week.periodIndex || 'N/A'} - End: ${week.endDate}`);
            });
        } else {
            console.log('⚠️  No war weeks found in database!');
        }
        
        // Check participants
        if (warWeeks.length > 0) {
            console.log('\n👥 Checking participants...');
            let totalParticipants = 0;
            for (const week of warWeeks.slice(0, 5)) {
                const participants = await db.getParticipantsByWarWeek(week.id);
                totalParticipants += participants.length;
                console.log(`  Week ${week.id} (${week.endDate}): ${participants.length} participants`);
            }
            console.log(`\n  Total participants in first 5 weeks: ${totalParticipants}`);
        }
        
        // Check members
        const members = await db.getMembers(true);
        console.log(`\n👤 Members: ${members.length} total`);
        const currentMembers = members.filter(m => m.isCurrent);
        console.log(`  Current: ${currentMembers.length}`);
        console.log(`  Former: ${members.length - currentMembers.length}`);
        
        console.log('\n✅ Database check complete!');
        
    } catch (error) {
        console.error('❌ Error checking database:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

checkDatabase();
