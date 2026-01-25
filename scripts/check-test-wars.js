/**
 * Quick script to check if test wars are in the database
 */

const fs = require('fs');
const path = require('path');
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

async function checkTestWars() {
    try {
        console.log('🔍 Checking for test wars in database...');
        
        // Get all war weeks, no limit
        const allWars = await db.getWarWeeks(null);
        console.log(`📊 Total war weeks in database: ${allWars.length}`);
        
        // Check for test wars
        const testWars = allWars.filter(w => w.dataSource === 'test_fake_data');
        console.log(`🧪 Test wars found: ${testWars.length}`);
        
        if (testWars.length > 0) {
            console.log('\n✅ Test wars:');
            testWars.forEach(w => {
                console.log(`  - ID: ${w.id}, EndDate: ${w.endDate}, Season: ${w.seasonId}, Period: ${w.periodIndex}`);
            });
        } else {
            console.log('\n❌ No test wars found!');
            console.log('   Checking for wars with IDs 1888 and 1889...');
            const war1888 = allWars.find(w => w.id === 1888);
            const war1889 = allWars.find(w => w.id === 1889);
            if (war1888) {
                console.log(`   Found war 1888: dataSource="${war1888.dataSource}", endDate="${war1888.endDate}"`);
            } else {
                console.log('   War 1888 not found');
            }
            if (war1889) {
                console.log(`   Found war 1889: dataSource="${war1889.dataSource}", endDate="${war1889.endDate}"`);
            } else {
                console.log('   War 1889 not found');
            }
        }
        
        // Show first 5 wars to see what we're getting
        console.log('\n📋 First 5 war weeks (most recent):');
        allWars.slice(0, 5).forEach(w => {
            console.log(`  - ID: ${w.id}, EndDate: ${w.endDate}, DataSource: ${w.dataSource || 'null'}, Season: ${w.seasonId}, Period: ${w.periodIndex}`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await db.close();
    }
}

checkTestWars();
