/**
 * @jest-environment node
 */

// Enforces the layer rules in tests/architecture/rules.js against the ratchet
// baseline. New violations fail; existing (baselined) ones are tolerated.

const fs = require('fs');
const path = require('path');
const { RULES, SOURCES, classBodies, computeViolations, loadBaseline } = require('./rules.js');

const current = computeViolations();
const baseline = loadBaseline();

describe('architecture rules (ratchet against baseline.json)', () => {
    test.each(RULES.map(r => [r.id, r]))('%s', (id, rule) => {
        const allowed = baseline[id] || {};
        const regressions = Object.entries(current[id] || {})
            .filter(([key, n]) => n > (allowed[key] || 0))
            .map(([key, n]) => `${key}: ${n} found, baseline allows ${allowed[key] || 0}`);

        if (regressions.length) {
            throw new Error(
                [
                    `FAIL  rule "${id}" has NEW violations:`,
                    ...regressions.map(r => `      - ${r}`),
                    `      Why: ${rule.why}`,
                    `      Fix: ${rule.fix}`,
                    '      Do NOT raise the baseline to make this pass.',
                ].join('\n')
            );
        }
    });

    test('baseline only names rules that exist', () => {
        const known = new Set(RULES.map(r => r.id));
        const unknown = Object.keys(baseline).filter(k => !k.startsWith('_') && !known.has(k));
        expect(unknown).toEqual([]);
    });
});

// Prove each class-scoped rule actually fires — a rule with a broken regex
// passes forever and enforces nothing.
describe('rules detect violations (self-test)', () => {
    const fake = `
class Person {
    x() { return document.title + Math.random(); }
}
class GiftExchangeService {
    y() { localStorage.getItem('k'); fetch('/x'); }
}
class AnimationService {
    z() { this.exchangeService.shuffleAndAssign(); }
}
class UIManager {
    w(p) { el.innerHTML = \`<b>\${p.name}</b>\`; window.foo = () => 1; }
}
module.exports = { Person };
`;
    const bodies = classBodies(fake);
    const run = id => RULES.find(r => r.id === id).scan(bodies, fake);

    test.each([
        ['domain-no-browser-apis', 'Person'],
        ['domain-no-browser-apis', 'GiftExchangeService'],
        ['storage-only-in-uimanager', 'GiftExchangeService'],
        ['no-network-calls', 'script.js'],
        ['animation-independent-of-domain', 'AnimationService'],
        ['randomness-injected', 'Person'],
        ['no-html-interpolation', 'UIManager'],
        ['no-window-globals', 'UIManager'],
        ['exports-contract', 'script.js'],
    ])('%s catches a violation in %s', (id, key) => {
        expect(run(id)[key]).toBeGreaterThan(0);
    });

    test('comments do not count as violations', () => {
        const b = classBodies('class Person {\n    // uses document and fetch( in prose\n}\n');
        expect(RULES.find(r => r.id === 'domain-no-browser-apis').scan(b, '').Person).toBe(0);
    });
});

describe('rule coverage', () => {
    test('every app script loaded by index.html is scanned', () => {
        const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
        const loaded = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m => m[1]);
        expect(loaded.length).toBeGreaterThan(0);
        for (const src of loaded) expect(SOURCES).toContain(src);
    });

    test('BadSantaGame is held to the domain rules', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'bad-santa.js'), 'utf8');
        expect(Object.keys(classBodies(src))).toContain('BadSantaGame');
        const rule = RULES.find(r => r.id === 'domain-no-browser-apis');
        const bodies = classBodies('class BadSantaGame {\n    x() { return document.title; }\n}\n');
        expect(rule.scan(bodies, '').BadSantaGame).toBe(1);
    });
});
