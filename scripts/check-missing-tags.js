#!/usr/bin/env node
/**
 * Check which player tags from the provided list are missing from members.json
 * Run on EC2: node scripts/check-missing-tags.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEMBERS_FILE = path.join(DATA_DIR, 'members.json');

// All tags you provided
const providedTags = [
    '#JPRY8GGJY', '#2V2CCUYU8', '#8P8PJGGC9', '#2G9YGVP8U', '#UUJU0YRV0',
    '#Y9082UV9J', '#CPLU9GRLR', '#2RUCPR0PP', '#UYPQP2RJJ', '#CV9VYC8VY',
    '#2ULPVVJPP', '#GULP28RUQ', '#YUGPJC2YU', '#LPJJYCQLV', '#YRVLPCPQ',
    '#8VYP88U8C', '#V2LRQQCY0', '#9RY9G9UG', '#QYCYPP2UR', '#V0UJ0Q8R',
    '#J0CP9GR80', '#88RYYJQUG', '#GJLVVV00U', '#2YVYLCL29', '#9R8U80YC',
    '#998URGYRP', '#V9V9PVJGV', '#2QR9GLY20', '#20PPJRRJV9', '#PJJG0929',
    '#VV29R02QG', '#8QLG2UQ0G', '#QQCLPQCJ', '#QCLLU80J', '#8JR9J2R9',
    '#PJUL2U8JC', '#Y2G9UQG89', '#2GG2VUGCR', '#UPYGQYQLG', '#V8Y9RP0J',
    '#9R2PUGG2', '#820QU9GL', '#PPCVYUCRR', '#PP2828VUQ', '#80UC2P0GL',
    '#CLR29PY2V', '#JRRCPGLL', '#VLUYLV2', '#U9GPV0U28', '#9C0Y0YUR8',
    '#PQ2J9828', '#U00992C29', '#9PP9URLCR', '#9RRRVUYY', '#YYQGUYC0L',
    '#UVGC99PR2', '#CRLL8V0YY', '#JJ2L0LGPY', '#JGYCJCGL', '#20RLLG8Y92',
    '#V0JRYC809', '#URQCGRLUR', '#98UUYJRU', '#CG9CL2RV9', '#C8RC0C8P',
    '#20YL8PG2UY', '#U08RV9UGJ', '#UU0V0UP2P', '#LQJPQLJ9U', '#PPVRVUC9P',
    '#CUJGYC90C'
];

function loadMemberHistory() {
    try {
        if (!fs.existsSync(MEMBERS_FILE)) {
            return { items: [] };
        }
        const content = fs.readFileSync(MEMBERS_FILE, 'utf8');
        const data = JSON.parse(content);
        return {
            items: Array.isArray(data.items) ? data.items : []
        };
    } catch (error) {
        console.error('Failed to load members.json:', error.message);
        return { items: [] };
    }
}

const memberData = loadMemberHistory();
const existingTags = new Set(memberData.items.map(m => m.tag));

console.log(`\n📊 Tag Analysis:\n`);
console.log(`Total provided tags: ${providedTags.length}`);
console.log(`Tags in members.json: ${existingTags.size}`);
console.log(`Missing tags: ${providedTags.length - providedTags.filter(t => existingTags.has(t)).length}\n`);

const missing = providedTags.filter(tag => !existingTags.has(tag));
const found = providedTags.filter(tag => existingTags.has(tag));

if (missing.length > 0) {
    console.log(`❌ Missing tags (${missing.length}):`);
    missing.forEach(tag => console.log(`   ${tag}`));
} else {
    console.log('✅ All provided tags are in members.json!');
}

if (found.length > 0) {
    console.log(`\n✅ Found tags (${found.length}):`);
    found.slice(0, 10).forEach(tag => console.log(`   ${tag}`));
    if (found.length > 10) {
        console.log(`   ... and ${found.length - 10} more`);
    }
}

console.log('\n');
