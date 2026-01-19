#!/usr/bin/env node
/**
 * Quick test to check if database connection works
 */

const fs = require('fs');

// Load .env file
if (fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf8');
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

console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD type:', typeof process.env.DB_PASSWORD);
console.log('DB_PASSWORD length:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 'undefined');
console.log('DB_PASSWORD first char:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD[0] : 'undefined');
console.log('DB_PASSWORD last char:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD[process.env.DB_PASSWORD.length - 1] : 'undefined');

// Try to connect
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'gladiators',
    user: process.env.DB_USER || 'gladiators_user',
    password: process.env.DB_PASSWORD || '',
});

pool.query('SELECT 1')
    .then(() => {
        console.log('✅ Connection successful!');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ Connection failed:', error.message);
        process.exit(1);
    });
