/**
 * @jest-environment node
 */

const http = require('http');
const { createServer, resolveRequest } = require('../../scripts/serve.js');

function get(port, urlPath, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: urlPath, method }, res => {
            let body = '';
            res.on('data', c => (body += c));
            res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
        });
        req.on('error', reject);
        req.end();
    });
}

describe('dev server (scripts/serve.js)', () => {
    let server;
    let port;

    beforeAll(done => {
        server = createServer().listen(0, '127.0.0.1', () => {
            port = server.address().port;
            done();
        });
    });

    afterAll(done => {
        server.closeAllConnections();
        server.close(() => done());
    });

    test('GET /health returns {status:"ok"}', async () => {
        const res = await get(port, '/health');
        expect(res.status).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
    });

    test('GET / serves index.html', async () => {
        const res = await get(port, '/');
        expect(res.status).toBe(200);
        expect(res.type).toMatch(/text\/html/);
        expect(res.body).toContain('<script src="script.js"></script>');
    });

    test('serves script.js, bad-santa.js and style.css with correct types', async () => {
        expect((await get(port, '/script.js')).type).toMatch(/javascript/);
        expect((await get(port, '/bad-santa.js')).type).toMatch(/javascript/);
        expect((await get(port, '/style.css')).type).toMatch(/text\/css/);
    });

    test('serves rendered art from assets/ as image/webp', async () => {
        const res = await get(port, '/assets/gift.webp');
        expect(res.status).toBe(200);
        expect(res.type).toBe('image/webp');
    });

    test('serves background music from assets/ as audio/mpeg', async () => {
        const res = await get(port, '/assets/music-christmas.mp3');
        expect(res.status).toBe(200);
        expect(res.type).toBe('audio/mpeg');
    });

    test.each(['/assets/../package.json', '/assets/nope.png', '/assets/sub/x.webp', '/art/post.py'])(
        'refuses non-asset path %s',
        async urlPath => {
            expect((await get(port, urlPath)).status).toBe(404);
        }
    );

    test.each(['/package.json', '/scripts/serve.js', '/../etc/passwd', '/%2e%2e/package.json', '/.git/config', '/node_modules/jest/package.json'])(
        'refuses non-app path %s',
        async urlPath => {
            expect((await get(port, urlPath)).status).toBe(404);
        }
    );

    test('rejects non-GET methods', async () => {
        expect((await get(port, '/', 'POST')).status).toBe(405);
    });

    test('resolveRequest ignores query strings and rejects unknown files', () => {
        expect(resolveRequest('/index.html?x=1')).toMatch(/index\.html$/);
        expect(resolveRequest('/secret.txt')).toBeNull();
    });
});
