/**
 * @jest-environment jsdom
 */

const { SoundService, MusicService, AnimationService, GiftExchangeService, UIManager } = require('../../script.js');

// Fake <audio> element factory that records what the player asked for.
function fakeAudio({ rejectPlay = false } = {}) {
    const made = [];
    const factory = jest.fn(src => {
        const el = {
            src, loop: false, volume: 1, paused: true, preload: '',
            play: jest.fn(() => { el.paused = false; return rejectPlay ? Promise.reject(new Error('blocked')) : Promise.resolve(); }),
            pause: jest.fn(() => { el.paused = true; }),
        };
        made.push(el);
        return el;
    });
    return { factory, made };
}

describe('MusicService', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('start() quietly loops the current theme track, fading in', () => {
        const { factory, made } = fakeAudio();
        const music = new MusicService(factory);
        music.start();
        expect(made).toHaveLength(1);
        expect(made[0].src).toBe('assets/music-christmas.mp3');
        expect(made[0].loop).toBe(true);
        expect(made[0].play).toHaveBeenCalled();
        expect(made[0].volume).toBeLessThan(0.05);
        jest.advanceTimersByTime(5000);
        expect(made[0].volume).toBeCloseTo(MusicService.VOLUME, 5);
        expect(MusicService.VOLUME).toBeLessThanOrEqual(0.3); // background, not foreground
    });

    test('both themes share the one calm track, so switching theme keeps it playing', () => {
        const { factory, made } = fakeAudio();
        const music = new MusicService(factory);
        music.start();
        music.setTheme('hanukkah');
        jest.advanceTimersByTime(5000);
        expect(factory).toHaveBeenCalledTimes(1);
        expect(made[0].paused).toBe(false);
    });

    test('with a different track per theme, switching crossfades to the new one', () => {
        const { factory, made } = fakeAudio();
        const music = new MusicService(factory, { christmas: 'assets/a.mp3', hanukkah: 'assets/b.mp3' });
        music.start();
        music.setTheme('hanukkah');
        jest.advanceTimersByTime(5000);
        expect(made[0].paused).toBe(true);
        expect(made[made.length - 1].src).toBe('assets/b.mp3');
        expect(made[made.length - 1].paused).toBe(false);
    });

    test('setting the same theme again does not restart the song', () => {
        const { factory } = fakeAudio();
        const music = new MusicService(factory);
        music.start();
        music.setTheme('christmas');
        expect(factory).toHaveBeenCalledTimes(1);
    });

    test('disabled: never creates audio; turning off pauses, back on resumes', () => {
        const { factory, made } = fakeAudio();
        const music = new MusicService(factory);
        music.setEnabled(false);
        music.start();
        expect(factory).not.toHaveBeenCalled();

        music.setEnabled(true);
        music.start();
        expect(made[0].paused).toBe(false);
        music.setEnabled(false);
        jest.advanceTimersByTime(5000);
        expect(made[0].paused).toBe(true);
        expect(music.isEnabled()).toBe(false);
    });

    test('safe when the browser blocks playback, the file is missing, or audio is unsupported', () => {
        expect(() => new MusicService(fakeAudio({ rejectPlay: true }).factory).start()).not.toThrow();
        expect(() => new MusicService(() => null).start()).not.toThrow();
        expect(() => new MusicService(() => { throw new Error('no audio'); }).start()).not.toThrow();
    });
});

describe('SoundService mixing', () => {
    function fakeCtx({ convolver = true } = {}) {
        const toDestination = [];
        const param = () => ({ setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { }, setTargetAtTime() { }, value: 0 });
        const ctx = { currentTime: 0, sampleRate: 8000, state: 'running', destination: { name: 'destination' } };
        const node = kind => ({
            kind, gain: param(), frequency: param(), detune: param(), Q: param(), threshold: param(), ratio: param(), knee: param(), attack: param(), release: param(), type: '',
            connect(target) { if (target === ctx.destination) toDestination.push(kind); return target; },
            start() { }, stop() { },
        });
        Object.assign(ctx, {
            createGain: () => node('gain'),
            createBiquadFilter: () => node('filter'),
            createOscillator: () => node('osc'),
            createBufferSource: () => node('source'),
            createDynamicsCompressor: () => node('compressor'),
            createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
        });
        if (convolver) ctx.createConvolver = () => ({ ...node('reverb'), buffer: null });
        return { ctx, toDestination };
    }

    test('every effect goes through one master bus (nothing hits the speakers directly)', () => {
        const { ctx, toDestination } = fakeCtx();
        const sound = new SoundService(() => ctx);
        Object.keys(SoundService.EFFECTS).forEach(n => sound.play(n));
        expect(toDestination).toEqual(['compressor']);
    });

    test('works without reverb support', () => {
        const { ctx } = fakeCtx({ convolver: false });
        const sound = new SoundService(() => ctx);
        expect(() => Object.keys(SoundService.EFFECTS).forEach(n => sound.play(n))).not.toThrow();
    });
});

describe('UIManager music toggle', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = `
            <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><p id="loadingText"></p></div>
            <button id="soundToggle"></button><button id="musicToggle" aria-pressed="true"></button>
            <select id="themeSelect"><option value="christmas">c</option><option value="hanukkah">h</option></select>
            <input id="firstNameInput" /><input id="lastNameInput" /><input id="groupInput" /><input id="wishlistInput" />
            <button id="addBtn"></button><ul id="nameList"></ul>
            <button id="shuffleBtn"></button><button id="resetBtn" class="hidden"></button>
            <div id="resultsSection" class="hidden"></div><div id="resultsList"></div><p id="errorMsg"></p>`;
    });
    afterEach(() => localStorage.clear());

    const store = () => ({ load: () => [], save() { }, clear() { } });
    const make = music => {
        const sound = new SoundService(() => null);
        return new UIManager(new GiftExchangeService(), new AnimationService(sound), store(), undefined, sound, undefined, undefined, music);
    };

    test('music starts on the first click or key press (browsers block autoplay)', () => {
        const music = { start: jest.fn(), setTheme: jest.fn(), setEnabled: jest.fn(), isEnabled: () => true };
        make(music);
        expect(music.start).not.toHaveBeenCalled();
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(music.start).toHaveBeenCalledTimes(1);
        document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
        expect(music.start).toHaveBeenCalledTimes(1);
    });

    test('follows the theme picker', () => {
        const music = { start: jest.fn(), setTheme: jest.fn(), setEnabled: jest.fn(), isEnabled: () => true };
        make(music);
        expect(music.setTheme).toHaveBeenLastCalledWith('christmas');
        const sel = document.getElementById('themeSelect');
        sel.value = 'hanukkah';
        sel.dispatchEvent(new Event('change'));
        expect(music.setTheme).toHaveBeenLastCalledWith('hanukkah');
    });

    test('clicking the music button first does not start the music (it turns it off)', () => {
        const music = new MusicService(fakeAudio().factory);
        const start = jest.spyOn(music, 'start');
        make(music);
        const btn = document.getElementById('musicToggle');
        btn.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        btn.click();
        expect(start).not.toHaveBeenCalled();
        expect(music.isEnabled()).toBe(false);
    });

    test('turning music back on starts it', () => {
        localStorage.setItem('giftExchange.music', 'off');
        const music = new MusicService(fakeAudio().factory);
        const start = jest.spyOn(music, 'start');
        make(music);
        document.getElementById('musicToggle').click();
        expect(music.isEnabled()).toBe(true);
        expect(start).toHaveBeenCalled();
        expect(localStorage.getItem('giftExchange.music')).toBe('on');
    });

    test('toggle button turns music off and on, and remembers it', () => {
        const music = new MusicService(fakeAudio().factory);
        make(music);
        const btn = document.getElementById('musicToggle');
        expect(btn.getAttribute('aria-pressed')).toBe('true');
        btn.click();
        expect(music.isEnabled()).toBe(false);
        expect(btn.getAttribute('aria-pressed')).toBe('false');
        expect(localStorage.getItem('giftExchange.music')).toBe('off');

        const music2 = new MusicService(fakeAudio().factory);
        make(music2);
        expect(music2.isEnabled()).toBe(false);
    });
});
