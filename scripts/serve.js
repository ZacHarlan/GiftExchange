#!/usr/bin/env node
// Zero-dependency static dev server for the Gift Exchange app.
// Serves index.html / script.js / style.css from the repo root, plus GET /health.
// The app itself has no backend; this exists so agents, init.sh and Playwright
// have a real URL and health check instead of file:// paths.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};
// Only app files are servable — never tests, configs, art sources, or node_modules.
const SERVABLE = new Set(['index.html', 'script.js', 'style.css']);
const ASSET = /^assets\/[a-z0-9-]+\.webp$/;

function resolveRequest(urlPath) {
    const clean = decodeURIComponent(urlPath.split('?')[0]);
    const name = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
    if (!SERVABLE.has(name) && !ASSET.test(name)) return null;
    return path.join(ROOT, name);
}

function createServer() {
    return http.createServer((req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405).end();
            return;
        }
        if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }
        let file;
        try {
            file = resolveRequest(req.url);
        } catch {
            file = null;
        }
        if (!file) {
            res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
            return;
        }
        fs.readFile(file, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
            res.end(req.method === 'HEAD' ? undefined : data);
        });
    });
}

if (require.main === module) {
    const port = Number(process.env.PORT || 8085);
    createServer().listen(port, '127.0.0.1', () => {
        process.stdout.write(`Gift Exchange dev server: http://localhost:${port}\n`);
    });
}

module.exports = { createServer, resolveRequest };
