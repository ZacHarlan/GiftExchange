/**
 * @jest-environment jsdom
 */

const { ChristmasCountdown, CountdownScene, CountdownUI } = require('../../countdown.js');

const at = (...args) => ChristmasCountdown.at(new Date(...args));

describe('ChristmasCountdown', () => {
    test('counts days, hours, minutes and seconds to midnight on 25 December', () => {
        const s = at(2026, 10, 28, 8, 17, 30);           // 28 Nov 2026, 08:17:30
        expect(s).toMatchObject({ christmas: false, year: 2026, days: 26, hours: 15, minutes: 42, seconds: 30, sleeps: 27 });
        expect(s.target).toEqual(new Date(2026, 11, 25));
    });

    test('the last second before Christmas still shows 1, never 0', () => {
        const s = at(2026, 11, 24, 23, 59, 59, 400);
        expect(s).toMatchObject({ christmas: false, totalSeconds: 1, days: 0, hours: 0, minutes: 0, seconds: 1 });
    });

    test('all of 25 December is Christmas', () => {
        expect(at(2026, 11, 25, 0, 0, 0).christmas).toBe(true);
        expect(at(2026, 11, 25, 23, 59, 59).christmas).toBe(true);
    });

    test('from 26 December it counts to next year', () => {
        const s = at(2026, 11, 26, 0, 0, 0);
        expect(s).toMatchObject({ christmas: false, year: 2027, days: 364, sleeps: 364 });
        expect(at(2027, 0, 1, 12, 0, 0).year).toBe(2027);
    });

    test('sleeps are whole nights, whatever the time of day', () => {
        expect(at(2026, 11, 23, 0, 0, 1).sleeps).toBe(2);
        expect(at(2026, 11, 23, 23, 59, 59).sleeps).toBe(2);
        expect(at(2026, 11, 24, 9, 0, 0).sleeps).toBe(1);
        expect(at(2026, 2, 1, 9, 0, 0).sleeps).toBe(299);   // across the clock change
    });

    test('the line under the clock', () => {
        expect(ChristmasCountdown.sleepsLine(at(2026, 10, 28, 8, 0, 0))).toBe('27 sleeps to go');
        expect(ChristmasCountdown.sleepsLine(at(2026, 11, 24, 8, 0, 0))).toBe('Just 1 sleep to go — it’s Christmas Eve');
        expect(ChristmasCountdown.sleepsLine(at(2026, 11, 25, 8, 0, 0))).toBe('Merry Christmas!');
    });

    test('snow gets steadily heavier over the last 30 days', () => {
        const level = (...args) => ChristmasCountdown.snowLevel(at(...args));
        expect(level(2026, 6, 4, 12, 0, 0)).toBe(0);                 // summer: the lightest fall
        expect(level(2026, 10, 25, 0, 0, 0)).toBe(0);                // exactly 30 days out
        expect(level(2026, 11, 10, 0, 0, 0)).toBeCloseTo(0.5, 5);    // 15 days out
        expect(level(2026, 11, 24, 23, 59, 59)).toBeGreaterThan(0.999);
        expect(level(2026, 11, 25, 9, 0, 0)).toBe(1);                // Christmas Day
        expect(level(2026, 11, 26, 9, 0, 0)).toBe(0);                // and back to light for next year
        const days = [28, 21, 14, 7, 3, 1].map(d => level(2026, 11, 25 - d, 12, 0, 0));
        expect([...days].sort((a, b) => a - b)).toEqual(days);       // every step closer is heavier
        expect(level(2026, 11, 24, 12, 0, 0)).toBeGreaterThan(level(2026, 11, 24, 11, 59, 59));   // even second by second
    });

    test('what a screen reader hears', () => {
        expect(ChristmasCountdown.spoken(at(2026, 11, 23, 22, 57, 30))).toBe('1 day, 1 hour and 2 minutes until Christmas');
        expect(ChristmasCountdown.spoken(at(2026, 11, 25, 8, 0, 0))).toBe('It is Christmas Day');
    });
});

describe('CountdownScene', () => {
    test('does nothing, safely, where there is no canvas to draw on', () => {
        const scene = new CountdownScene(null);
        scene.resize(800, 600, 2);
        scene.setGlory(true);
        expect(() => scene.draw(1)).not.toThrow();
        expect(scene.ready()).toBe(false);
        expect(CountdownScene.context({ getContext: () => { throw new Error('no canvas'); } })).toBeNull();
    });

    test('has no snow: Bethlehem is shown as it was', () => {
        const scene = new CountdownScene(null);
        expect(scene.snow).toBeUndefined();
        expect(scene.setSnow).toBeUndefined();
    });

    test('on a wide screen the picture covers it and the star hangs high over the shelter', () => {
        const at = CountdownScene.place(1600, 900);
        expect(at).toMatchObject({ x: 0, y: 0, dw: 1600, dh: 900 });
        expect(at.roof.x).toBeCloseTo(0.705 * 1600, 0);
        expect(at.star.x).toBe(at.roof.x);                  // directly above the shelter
        expect(at.star.y).toBeLessThan(at.roof.y - 200);
        expect(at.star.y).toBeGreaterThan(900 * 0.12);      // never lost off the top
        expect(at.manger.y).toBeGreaterThan(at.roof.y);
    });

    test('on a phone the picture is smaller, the shelter is centred and the star sits just above it', () => {
        const at = CountdownScene.place(390, 844);
        expect(at.dh).toBeCloseTo(844 * 0.62, 3);           // leaves the top of the screen to the clock
        expect(at.y + at.dh).toBeCloseTo(844, 3);           // standing on the bottom edge
        expect(at.roof.x).toBeCloseTo(195, 3);
        expect(at.x).toBeLessThan(0);
        expect(at.x + at.dw).toBeGreaterThan(390);          // no gap at either side
        expect(at.star.y).toBeGreaterThan(844 * 0.5);       // below the clock
        expect(at.star.y).toBeLessThan(at.roof.y);
    });

    test('on a very wide screen the picture still spans the full width', () => {
        const at = CountdownScene.place(2560, 1080);
        expect(at.dw).toBe(2560);
        expect(at.y + at.dh).toBeCloseTo(1080, 3);
    });
});

describe('CountdownUI', () => {
    const DOM = `
        <button id="countdownBtn"><span class="countdown-btn-text"></span></button>
        <section id="countdownScreen" class="countdown hidden" tabindex="-1">
            <h2 id="countdownTitle"></h2>
            <div id="countdownClock"></div>
            <p id="countdownBig"></p>
            <p id="countdownSleeps"></p>
            <p id="countdownDate"></p>
            <p id="countdownVerse"></p>
            <button id="countdownFullscreen"></button>
            <button id="countdownClose"></button>
        </section>`;

    let clock;
    function make(start, extra = {}) {
        document.body.innerHTML = DOM;
        clock = new Date(...start);
        const sound = { play: jest.fn() };
        const onSnowLevel = jest.fn();
        const onOpen = jest.fn();
        const ui = new CountdownUI({
            root: document.getElementById('countdownScreen'),
            openers: [document.getElementById('countdownBtn')],
            sound, onOpen, onSnowLevel,
            now: () => new Date(clock.getTime()),
            ...extra,
        });
        return { ui, sound, onOpen, onSnowLevel, root: document.getElementById('countdownScreen'), btn: document.getElementById('countdownBtn') };
    }
    const advance = (ui, seconds) => { clock = new Date(clock.getTime() + seconds * 1000); ui.tick(false); };
    const shown = unit => document.querySelector(`[data-unit="${unit}"] .cd-digits`).dataset.value;
    const cardText = unit => [...document.querySelectorAll(`[data-unit="${unit}"] .cd-card`)].map(c => c.children[0].textContent).join('');

    beforeEach(() => {
        jest.useFakeTimers();
        window.history.replaceState(null, '', '/');
    });
    afterEach(() => {
        document.getElementById('countdownClose')?.click();
        jest.useRealTimers();
    });

    test('the button on the main page says how many sleeps are left, and the gift picker is told how hard to snow', () => {
        const { btn, onSnowLevel } = make([2026, 10, 28, 8, 17, 30]);
        expect(btn.textContent).toBe('27 sleeps until Christmas');
        expect(onSnowLevel).toHaveBeenLastCalledWith(expect.closeTo(1 - (26 * 86400 + 15 * 3600 + 42 * 60 + 30) / (30 * 86400), 6));
        clock = new Date(2026, 11, 20, 8, 0, 0);
        jest.advanceTimersByTime(60000);                 // refreshed every minute
        expect(btn.textContent).toBe('5 sleeps until Christmas');
        expect(onSnowLevel).toHaveBeenLastCalledWith(expect.closeTo(1 - (4 * 86400 + 16 * 3600) / (30 * 86400), 6));
        expect(make([2026, 11, 24, 8, 0, 0]).btn.textContent).toBe('1 sleep until Christmas');
        expect(make([2026, 11, 25, 8, 0, 0]).btn.textContent).toBe('Merry Christmas!');
    });

    test('opening shows the clock, rings a bell, reports the open and marks the address', () => {
        const { root, btn, sound, onOpen } = make([2026, 10, 28, 8, 17, 30]);
        expect(root.classList.contains('hidden')).toBe(true);
        btn.click();
        expect(root.classList.contains('hidden')).toBe(false);
        expect(document.body.classList.contains('countdown-open')).toBe(true);
        expect([shown('days'), shown('hours'), shown('minutes'), shown('seconds')]).toEqual(['26', '15', '42', '30']);
        expect(cardText('days')).toBe('26');
        expect(document.getElementById('countdownTitle').textContent).toBe('Christmas is coming');
        expect(document.getElementById('countdownSleeps').textContent).toBe('27 sleeps to go');
        expect(document.getElementById('countdownDate').textContent).toMatch(/2026/);
        expect(document.getElementById('countdownClock').getAttribute('aria-label')).toBe('26 days, 15 hours and 42 minutes until Christmas');
        expect(sound.play).toHaveBeenCalledWith('chime');
        expect(document.getElementById('countdownVerse').textContent).toMatch(/Glory to God in the highest.*Luke 2:14/);
        expect(onOpen).toHaveBeenCalledTimes(1);
        expect(window.location.hash).toBe('#countdown');
        expect(document.activeElement.id).toBe('countdownClose');
    });

    test('ticks down each second, flipping only the cards that change', () => {
        const { ui, btn } = make([2026, 10, 28, 8, 17, 30]);
        btn.click();
        const secondCards = document.querySelectorAll('[data-unit="seconds"] .cd-card');
        const tens = secondCards[0].className;
        advance(ui, 1);
        expect(shown('seconds')).toBe('29');
        expect(secondCards[1].className).toMatch(/flip-[ab]/);
        expect(secondCards[1].children[1].textContent).toBe('0');   // the old digit stays underneath while the new one folds over
        expect(secondCards[1].children[3].textContent).toBe('9');
        expect(secondCards[0].className).not.toBe(tens);            // 3 -> 2 flips too
        const before = secondCards[0].className;
        advance(ui, 1);
        expect(shown('seconds')).toBe('28');
        expect(secondCards[0].className).toBe(before);              // 2 stays put
        jest.advanceTimersByTime(1000);                             // the running timer finds nothing new
        expect(shown('seconds')).toBe('28');
    });

    test('labels are singular for 1, and the day cards shrink as days run out', () => {
        const { ui, btn } = make([2026, 11, 15, 0, 0, 0]);
        btn.click();
        expect(document.querySelectorAll('[data-unit="days"] .cd-card')).toHaveLength(2);
        clock = new Date(2026, 11, 23, 22, 58, 59);
        ui.tick(false);
        expect(document.querySelectorAll('[data-unit="days"] .cd-card')).toHaveLength(1);
        const labels = [...document.querySelectorAll('.cd-label')].map(l => l.textContent);
        expect(labels).toEqual(['day', 'hour', 'minute', 'second']);
    });

    test('chimes on the hour', () => {
        const { ui, btn, sound } = make([2026, 11, 1, 9, 59, 58]);
        btn.click();
        sound.play.mockClear();
        advance(ui, 1);
        expect(sound.play).not.toHaveBeenCalled();
        advance(ui, 1);     // 14:00:00 left on the clock
        expect(sound.play).toHaveBeenCalledWith('chime');
    });

    test('the last ten seconds become one big number, then Christmas arrives and the star shines its brightest', () => {
        const { ui, btn, sound, root } = make([2026, 11, 24, 23, 59, 48]);
        btn.click();
        expect(root.classList.contains('final-minute')).toBe(true);
        expect(root.classList.contains('final-ten')).toBe(false);
        sound.play.mockClear();
        advance(ui, 2);
        expect(root.classList.contains('final-ten')).toBe(true);
        expect(document.getElementById('countdownBig').textContent).toBe('10');
        expect(sound.play).toHaveBeenCalledWith('tick');
        advance(ui, 9);
        expect(document.getElementById('countdownBig').textContent).toBe('1');
        advance(ui, 1);
        expect(root.classList.contains('is-christmas')).toBe(true);
        expect(root.classList.contains('final-ten')).toBe(false);
        expect(document.getElementById('countdownTitle').textContent).toBe('Merry Christmas!');
        expect(document.getElementById('countdownBig').textContent).toBe('');
        expect(document.getElementById('countdownSleeps').textContent).toBe('Joy to the world, the Lord is come');
        expect(document.getElementById('countdownVerse').textContent).toMatch(/unto us a child is born.*Isaiah 9:6/);
        expect(ui.scene.glory).toBe(true);
        expect(sound.play).toHaveBeenCalledWith('tada');
    });

    test('opened on Christmas Day it says so straight away, without the fanfare', () => {
        const { btn, sound, root } = make([2026, 11, 25, 10, 0, 0]);
        btn.click();
        expect(root.classList.contains('is-christmas')).toBe(true);
        expect(document.getElementById('countdownSleeps').textContent).toMatch(/Joy to the world/);
        expect(sound.play).not.toHaveBeenCalledWith('tada');
    });

    test('Esc or ✕ closes it, stops the clock, clears the address and gives focus back', () => {
        const { ui, btn, root } = make([2026, 10, 28, 8, 17, 30]);
        btn.focus();
        btn.click();
        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(root.classList.contains('hidden')).toBe(true);
        expect(document.body.classList.contains('countdown-open')).toBe(false);
        expect(window.location.hash).toBe('');
        expect(document.activeElement).toBe(btn);
        expect(ui.timer).toBeNull();
        btn.click();
        document.getElementById('countdownClose').click();
        expect(ui.isOpen()).toBe(false);
    });

    test('a link ending in #countdown opens straight onto the screen', () => {
        window.history.replaceState(null, '', '/#countdown');
        const { root } = make([2026, 10, 28, 8, 17, 30]);
        expect(root.classList.contains('hidden')).toBe(false);
    });

    test('controls hide after a few still seconds and come back on movement', () => {
        const { btn, root } = make([2026, 10, 28, 8, 17, 30]);
        btn.click();
        expect(root.classList.contains('idle')).toBe(false);
        jest.advanceTimersByTime(4000);
        expect(root.classList.contains('idle')).toBe(true);
        root.dispatchEvent(new Event('pointermove'));
        expect(root.classList.contains('idle')).toBe(false);
    });

    test('the picture drifts slowly, except for visitors who ask for reduced motion', () => {
        const { ui } = make([2026, 10, 28, 8, 17, 30]);
        expect(ui.scene.drift).toBe(true);
        const calm = { ...window, matchMedia: () => ({ matches: true }), addEventListener() { }, setInterval: () => 0, location: window.location };
        const still = make([2026, 10, 28, 8, 17, 30], { view: calm });
        expect(still.ui.scene.drift).toBe(false);
    });

    test('full screen is asked for, and failures are ignored', () => {
        const { btn, root } = make([2026, 10, 28, 8, 17, 30]);
        btn.click();
        root.requestFullscreen = jest.fn(() => Promise.reject(new Error('denied')));
        document.getElementById('countdownFullscreen').click();
        root.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
        expect(root.requestFullscreen).toHaveBeenCalledTimes(2);
    });

    test('keeps the display awake while open, where the browser can', async () => {
        const release = jest.fn(() => Promise.resolve());
        const request = jest.fn(() => Promise.resolve({ release }));
        Object.defineProperty(window.navigator, 'wakeLock', { value: { request }, configurable: true });
        const { btn } = make([2026, 10, 28, 8, 17, 30]);
        btn.click();
        expect(request).toHaveBeenCalledWith('screen');
        await Promise.resolve();
        document.getElementById('countdownClose').click();
        expect(release).toHaveBeenCalled();
        delete window.navigator.wakeLock;
    });

    test('the #countdown=finale link previews the last 20 seconds; any other link uses the real clock', () => {
        const real = () => new Date(2026, 6, 4, 12, 0, 0);
        expect(CountdownUI.clockFor('#countdown', real)).toBe(real);
        expect(CountdownUI.clockFor('', real)).toBe(real);
        const preview = CountdownUI.clockFor('#countdown=finale', real);
        expect(ChristmasCountdown.at(preview())).toMatchObject({ christmas: false, totalSeconds: 20 });
    });
});
