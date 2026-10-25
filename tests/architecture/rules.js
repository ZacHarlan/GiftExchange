// Architecture rules for the Gift Exchange app.
//
// script.js is a single file with four layers, in this dependency order:
//   Person (model) <- GiftExchangeService (domain) <- AnimationService / UIManager (presentation)
//
// Each rule scans source text and returns violation counts keyed by class (or file).
// tests/architecture/architecture.test.js fails when a count goes ABOVE the committed
// baseline (tests/architecture/baseline.json). `node tests/architecture/rules.js --stale`
// lists baseline entries that can now be lowered — quality-sweep.sh runs it.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Split script.js into top-level class bodies. Classes start at column 0 with `class X`
// and end at the first column-0 `}` after them.
function classBodies(src) {
    const lines = src.split('\n');
    const out = {};
    let current = null;
    for (const line of lines) {
        const m = /^class (\w+)/.exec(line);
        if (m) {
            current = m[1];
            out[current] = [];
            continue;
        }
        if (current && /^}/.test(line)) {
            current = null;
            continue;
        }
        if (current) out[current].push(line);
    }
    // Strip line comments so prose doesn't trip rules.
    for (const k of Object.keys(out)) {
        out[k] = out[k].map(l => l.replace(/^\s*\/\/.*$/, '')).join('\n');
    }
    return out;
}

const count = (text, re) => (text.match(new RegExp(re.source, 'g')) || []).length;

const DOMAIN = ['Person', 'GiftExchangeService', 'BadSantaGame'];
// App source files scanned by every rule (script.js must come first).
const SOURCES = ['script.js', 'bad-santa.js'];
const BROWSER_GLOBALS = /\b(document|window|localStorage|sessionStorage|navigator|alert|confirm|setTimeout|setInterval)\b/;
const STORAGE = /\b(localStorage|sessionStorage)\b/;
const NETWORK = /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import\s*\()/;

const RULES = [
    {
        id: 'domain-no-browser-apis',
        why: 'Person, GiftExchangeService and BadSantaGame hold the game rules. They must run in plain Node so they stay unit-testable and reusable without a DOM.',
        fix: 'Move the browser call into UIManager (or AnimationService) and pass the result into the service as an argument.',
        scan: bodies => Object.fromEntries(DOMAIN.map(c => [c, count(bodies[c] || '', BROWSER_GLOBALS)])),
    },
    {
        id: 'storage-only-in-uimanager',
        why: 'Persistence (saved core families, theme) has one owner so storage keys and formats live in one place.',
        fix: 'Read/write localStorage only inside UIManager; expose a method there if another class needs the value.',
        scan: bodies =>
            Object.fromEntries(Object.keys(bodies).filter(c => c !== 'UIManager').map(c => [c, count(bodies[c], STORAGE)])),
    },
    {
        id: 'no-network-calls',
        why: 'Participant names and wishlists never leave the browser. The app is deliberately offline; any network call is a privacy change that needs a human decision.',
        fix: 'Remove the network call. If a feature truly needs one, get explicit approval and update this rule first.',
        scan: (bodies, src, files = { 'script.js': src }) =>
            Object.fromEntries(Object.entries(files).map(([f, text]) => [f, count(text.replace(/^\s*\/\/.*$/gm, ''), NETWORK)])),
    },
    {
        id: 'animation-independent-of-domain',
        why: 'AnimationService is purely visual. If it knows about people or assignments, theme changes start breaking matching.',
        fix: 'Have UIManager pass AnimationService only what it needs to draw (theme, callback).',
        scan: bodies => ({ AnimationService: count(bodies.AnimationService || '', /\b(exchangeService|GiftExchangeService|Person|shuffleAndAssign)\b/) }),
    },
    {
        id: 'randomness-injected',
        why: 'Shuffling should take an injectable random source so tests can force exact assignments (Dependency Inversion).',
        fix: 'Accept a `random` function in the GiftExchangeService constructor (default Math.random) and use this.random().',
        scan: bodies => Object.fromEntries(DOMAIN.map(c => [c, count(bodies[c] || '', /Math\.random/)])),
    },
    {
        id: 'no-html-interpolation',
        why: 'Names and wishlists are user input. Interpolating them into innerHTML lets a name like <img onerror=...> run script.',
        fix: 'Build elements with document.createElement and set .textContent for user data (or escape it first).',
        scan: bodies =>
            Object.fromEntries(
                Object.keys(bodies).map(c => [c, count(bodies[c], /(innerHTML|outerHTML|insertAdjacentHTML)[^;]*?(=|\()\s*`[^`]*\$\{/)])
            ),
    },
    {
        id: 'no-window-globals',
        why: 'Globals on window (for inline onclick=) couple HTML to JS and block a strict Content-Security-Policy.',
        fix: 'Attach listeners with addEventListener (event delegation on the list) instead of window.x = ... and onclick="...".',
        scan: bodies => Object.fromEntries(Object.keys(bodies).map(c => [c, count(bodies[c], /\bwindow\.\w+\s*=[^=]/)])),
    },
    {
        id: 'index-html-local-scripts-only',
        why: 'All code must be the reviewed local script.js. A third-party <script> could read every name entered.',
        fix: 'Vendor the code into the repo, or remove it. Only Google Fonts stylesheets are allowed as external links.',
        scan: () => {
            const html = read('index.html');
            const extScripts = count(html, /<script[^>]+src=["']https?:/);
            const extLinks = (html.match(/<link[^>]+href=["']https?:\/\/[^"']+/g) || []).filter(
                l => !/fonts\.(googleapis|gstatic)\.com/.test(l)
            ).length;
            return { 'index.html': extScripts + extLinks };
        },
    },
    {
        id: 'exports-contract',
        why: 'Unit tests require these classes from script.js; dropping one silently disables its tests.',
        fix: 'Keep Person, GiftExchangeService, UIManager and AnimationService in the module.exports block at the end of script.js.',
        scan: (bodies, src) => {
            const block = (/module\.exports\s*=\s*\{([^}]*)\}/.exec(src) || [, ''])[1];
            const missing = ['Person', 'GiftExchangeService', 'UIManager', 'AnimationService'].filter(n => !new RegExp(`\\b${n}\\b`).test(block));
            return { 'script.js': missing.length };
        },
    },
];

function computeViolations() {
    const files = Object.fromEntries(SOURCES.filter(f => fs.existsSync(path.join(ROOT, f))).map(f => [f, read(f)]));
    const src = files['script.js'];
    const bodies = Object.assign({}, ...Object.values(files).map(classBodies));
    const result = {};
    for (const rule of RULES) {
        const counts = rule.scan(bodies, src, files);
        result[rule.id] = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
    }
    return result;
}

function loadBaseline() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline.json'), 'utf8'));
}

// Entries in the baseline whose real count is now lower — they should be trimmed.
function staleBaseline(current = computeViolations(), baseline = loadBaseline()) {
    const stale = [];
    for (const [ruleId, entries] of Object.entries(baseline)) {
        if (ruleId.startsWith('_')) continue;
        for (const [key, allowed] of Object.entries(entries)) {
            const now = (current[ruleId] || {})[key] || 0;
            if (now < allowed) stale.push({ ruleId, key, allowed, now });
        }
    }
    return stale;
}

module.exports = { RULES, SOURCES, classBodies, computeViolations, loadBaseline, staleBaseline };

if (require.main === module && process.argv.includes('--stale')) {
    const stale = staleBaseline();
    if (stale.length === 0) {
        process.stdout.write('Baseline is tight — no entries to trim.\n');
        process.exit(0);
    }
    for (const s of stale) {
        process.stdout.write(`STALE  ${s.ruleId} / ${s.key}: baseline allows ${s.allowed}, code now has ${s.now}\n`);
    }
    process.stdout.write('Fix: lower (or delete) those entries in tests/architecture/baseline.json.\n');
    process.exit(1);
}
