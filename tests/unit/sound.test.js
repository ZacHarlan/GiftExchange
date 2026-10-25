/**
 * @jest-environment jsdom
 */

const { SoundService, AnimationService, GiftExchangeService, UIManager } = require('../../script.js');

// Minimal fake Web Audio graph that records what was scheduled.
function fakeAudio() {
    const log = { oscillators: 0, noises: 0, created: 0 };
    const param = () => ({ setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { }, value: 0 });
    const node = () => ({ connect() { return this; }, gain: param(), frequency: param(), Q: param(), type: '' });
    const ctx = {
        currentTime: 0,
        sampleRate: 8000,
        state: 'running',
        resume: jest.fn(() => Promise.resolve()),
        destination: {},
        createGain: () => node(),
        createBiquadFilter: () => node(),
        createOscillator: () => ({ ...node(), start() { log.oscillators++; }, stop() { } }),
        createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
        createBufferSource: () => ({ ...node(), buffer: null, start() { log.noises++; }, stop() { } }),
    };
    const factory = jest.fn(() => {
        log.created++;
        return ctx;
    });
    return { factory, log, ctx };
}

describe('SoundService', () => {
    test('plays every named effect through Web Audio', () => {
        const { factory, log } = fakeAudio();
        const sound = new SoundService(factory);
        for (const name of ['jingle', 'whoosh', 'chime', 'sizzle', 'coins', 'tada', 'tick', 'drumroll']) {
            expect(() => sound.play(name)).not.toThrow();
        }
        expect(log.oscillators + log.noises).toBeGreaterThan(8);
        expect(factory).toHaveBeenCalledTimes(1); // one shared AudioContext, created lazily
    });

    test('when disabled it does nothing (and never creates an AudioContext)', () => {
        const { factory } = fakeAudio();
        const sound = new SoundService(factory);
        sound.setEnabled(false);
        sound.play('jingle');
        expect(factory).not.toHaveBeenCalled();
        expect(sound.isEnabled()).toBe(false);
    });

    test('is silent and safe without Web Audio (old browsers, tests)', () => {
        expect(() => new SoundService(() => null).play('chime')).not.toThrow();
        expect(() => new SoundService(() => { throw new Error('no audio'); }).play('chime')).not.toThrow();
        expect(() => new SoundService().play('nope')).not.toThrow();
    });
});

describe('AnimationService plays sounds at each step', () => {
    function setupDOM() {
        document.body.innerHTML = `
            <div id="loadingOverlay" class="hidden">
                <img id="giftIcon"><img id="giftOpenIcon" class="hidden">
                <div id="hanukkahContainer" class="hidden">
                    <div id="hanukkahIcon"></div><div id="menorahIcon" class="hidden"><span class="menorah-flames hidden"></span></div>
                    <div id="latkeIcon" style="opacity:0"></div><div id="geltIcon" style="opacity:0"></div>
                </div>
                <p id="loadingText"></p>
            </div>`;
    }

    beforeEach(() => {
        jest.useFakeTimers();
        setupDOM();
    });
    afterEach(() => jest.useRealTimers());

    const run = (theme) => {
        const sound = { play: jest.fn() };
        new AnimationService(sound).play(theme, () => { });
        jest.advanceTimersByTime(800 * 4 + 500);
        return sound.play.mock.calls.map(c => c[0]);
    };

    test('christmas: bells, ticks, chime on opening, ta-da at the end', () => {
        expect(run('christmas')).toEqual(['jingle', 'tick', 'tick', 'chime', 'tada']);
    });

    test('hanukkah: whoosh, chime for the menorah, sizzle, coins, ta-da', () => {
        expect(run('hanukkah')).toEqual(['whoosh', 'chime', 'sizzle', 'coins', 'tada']);
    });

    test('works without a sound service (existing callers)', () => {
        expect(() => {
            new AnimationService().play('christmas', () => { });
            jest.advanceTimersByTime(800 * 4 + 500);
        }).not.toThrow();
    });
});

describe('UIManager sound toggle', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = `
            <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><p id="loadingText"></p></div>
            <button id="soundToggle" aria-pressed="true"></button>
            <input id="firstNameInput" /><input id="lastNameInput" /><input id="groupInput" /><input id="wishlistInput" />
            <button id="addBtn"></button><ul id="nameList"></ul>
            <button id="shuffleBtn"></button><button id="resetBtn" class="hidden"></button>
            <div id="resultsSection" class="hidden"></div><div id="resultsList"></div><p id="errorMsg"></p>`;
    });
    afterEach(() => localStorage.clear());

    const store = () => ({ load: () => [], save() { }, clear() { } });

    test('toggles sound, reflects it on the button, and remembers it', () => {
        const sound = new SoundService(() => null);
        new UIManager(new GiftExchangeService(), new AnimationService(sound), store(), undefined, sound);
        const btn = document.getElementById('soundToggle');
        expect(sound.isEnabled()).toBe(true);
        expect(btn.getAttribute('aria-pressed')).toBe('true');

        btn.click();
        expect(sound.isEnabled()).toBe(false);
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(localStorage.getItem('giftExchange.sound')).toBe('off');

        const sound2 = new SoundService(() => null);
        new UIManager(new GiftExchangeService(), new AnimationService(sound2), store(), undefined, sound2);
        expect(sound2.isEnabled()).toBe(false);
    });
});
