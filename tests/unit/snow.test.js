/**
 * @jest-environment jsdom
 */

const { SnowField } = require('../../script.js');

// A canvas context that records what was drawn.
function fakeContext() {
    const calls = { arc: 0, drawImage: 0, clearRect: 0, fill: 0 };
    return {
        calls,
        beginPath() { }, moveTo() { }, closePath() { },
        arc() { calls.arc++; },
        fill() { calls.fill++; },
        drawImage() { calls.drawImage++; },
        clearRect() { calls.clearRect++; },
        setTransform() { },
        fillRect() { },
        createRadialGradient: () => ({ addColorStop() { } }),
        set fillStyle(v) { }, set globalAlpha(v) { },
    };
}

const fakeCanvas = ctx => ({ width: 0, height: 0, getContext: () => ctx });

describe('SnowField', () => {
    test('draws a quarter of its flakes at the lightest and all of them at the heaviest', () => {
        const snow = new SnowField();
        const flakes = new Array(400).fill({});
        expect(snow.falling(flakes)).toBe(100);
        snow.setLevel(0.5);
        expect(snow.falling(flakes)).toBe(250);
        snow.setLevel(1);
        expect(snow.falling(flakes)).toBe(400);
        snow.setLevel(7);
        expect(snow.falling(flakes)).toBe(400);
        snow.setLevel(-1);
        expect(snow.falling(flakes)).toBe(100);
        snow.setLevel(undefined);
        expect(snow.falling(flakes)).toBe(100);
    });

    test('lays out three depths of flakes, the same way every time', () => {
        const a = new SnowField();
        const b = new SnowField();
        a.layout(1280, 720);
        b.layout(1280, 720);
        expect(a.layers.map(l => l.flakes.length)).toEqual([440, 270, 95]);
        expect(a.layers[1].flakes[7]).toEqual(b.layers[1].flakes[7]);
        a.layers.flatMap(l => l.flakes).forEach(f => {
            expect(f.x).toBeGreaterThanOrEqual(0);
            expect(f.x).toBeLessThanOrEqual(1280);
            expect(f.y).toBeLessThanOrEqual(720);
        });
        // Far flakes are small and slow, near ones large and fast.
        expect(Math.max(...a.layers[0].flakes.map(f => f.r))).toBeLessThan(Math.min(...a.layers[2].flakes.map(f => f.r)));
        expect(Math.max(...a.layers[0].flakes.map(f => f.v))).toBeLessThan(Math.min(...a.layers[2].flakes.map(f => f.v)));
    });

    test('a bigger screen gets more flakes, a small one fewer, within limits', () => {
        const phone = new SnowField();
        const tv = new SnowField();
        phone.layout(390, 844);
        tv.layout(3840, 2160);
        expect(phone.layers[0].flakes.length).toBeLessThan(440);
        expect(phone.layers[0].flakes.length).toBeGreaterThan(100);
        expect(tv.layers[0].flakes.length).toBe(Math.round(440 * 2.2));
    });

    test('paints more flakes the harder it snows', () => {
        const drawn = level => {
            const snow = new SnowField();
            snow.layout(1280, 720);
            snow.setLevel(level);
            snow.sprite = {};                 // jsdom has no canvas to build the soft flake from
            const ctx = fakeContext();
            snow.paint(ctx, 12.5);
            return ctx.calls.arc + ctx.calls.drawImage;
        };
        expect(drawn(0)).toBe(Math.round(440 * 0.25) + Math.round(270 * 0.25) + Math.round(95 * 0.25));
        expect(drawn(1)).toBe(440 + 270 + 95);
        expect(drawn(0.5)).toBeGreaterThan(drawn(0));
        expect(drawn(1)).toBeGreaterThan(drawn(0.5));
    });

    test('is harmless without a canvas', () => {
        const snow = new SnowField(null);
        snow.sprite = {};
        snow.layout(800, 600);
        expect(() => { snow.paint(null, 1); snow.drawOwn(1); snow.fit(window); snow.run(window); }).not.toThrow();
        expect(SnowField.context({ getContext: () => { throw new Error('no canvas'); } })).toBeNull();
    });

    test('runs behind the page, rests while paused, and follows the window size', () => {
        const ctx = fakeContext();
        const snow = new SnowField(fakeCanvas(ctx));
        snow.sprite = {};
        const frames = [];
        const listeners = {};
        const view = {
            innerWidth: 1000, innerHeight: 500, devicePixelRatio: 2,
            requestAnimationFrame: fn => frames.push(fn),
            addEventListener: (type, fn) => { listeners[type] = fn; },
            matchMedia: () => ({ matches: false }),
        };
        let paused = false;
        snow.run(view, () => paused);
        expect(snow.canvas.width).toBe(2000);
        expect(snow.canvas.height).toBe(1000);
        const first = ctx.calls.clearRect;
        frames.shift()(1000);
        expect(ctx.calls.clearRect).toBe(first + 1);
        paused = true;
        frames.shift()(2000);
        expect(ctx.calls.clearRect).toBe(first + 1);      // nothing drawn while the countdown covers the page
        expect(frames).toHaveLength(1);                   // but it keeps waiting
        view.innerWidth = 600;
        listeners.resize();
        expect(snow.canvas.width).toBe(1200);
    });

    test('stands still for visitors who ask for reduced motion', () => {
        const ctx = fakeContext();
        const snow = new SnowField(fakeCanvas(ctx));
        snow.sprite = {};
        const frames = [];
        snow.run({
            innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
            requestAnimationFrame: fn => frames.push(fn), addEventListener() { },
            matchMedia: () => ({ matches: true }),
        });
        expect(ctx.calls.clearRect).toBe(1);              // one still picture
        expect(frames).toHaveLength(0);
    });
});
