#!/usr/bin/env node
// index.js
const { spawn } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'missing-translation.py');

const args = process.argv.slice(2);
const python = spawn('python3', [scriptPath, ...args]);

python.stdout.on('data', (data) => {
    process.stdout.write(data);
});

python.stderr.on('data', (data) => {
    process.stderr.write(data);
});

python.on('close', (code) => {
    process.exit(code);
});
