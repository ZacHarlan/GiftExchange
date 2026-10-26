/**
 * Gift Exchange Application
 * Refactored to follow SOLID principles
 */

// --- Domain Models ---

class Person {
    constructor(firstName, lastName, familyGroup, wishlist) {
        const { surname, family } = Person.splitSurname(lastName);
        this.firstName = firstName.trim();
        this.lastName = surname;
        // Default familyGroup to the surname — or to "Harlan 1" when entered as "Harlan 1".
        this.familyGroup = (familyGroup && familyGroup.trim()) ? familyGroup.trim() : family;
        this.wishlist = wishlist ? wishlist.trim() : '';
    }

    // "Harlan 1" -> surname "Harlan", family "Harlan 1". A trailing number tells apart
    // households that share a surname. Anything else is left as typed.
    static splitSurname(lastName) {
        const typed = String(lastName).trim().replace(/\s+/g, ' ');
        const m = /^(.*\S)\s+(\d+)$/.exec(typed);
        return m ? { surname: m[1], family: typed } : { surname: typed, family: typed };
    }

    getFullName() {
        return `${this.firstName} ${this.lastName}`;
    }

    getDisplayGroup() {
        return `[${this.familyGroup}]`;
    }
}

// --- Services ---

class GiftExchangeService {
    constructor(coreFamilies) {
        this.names = [];
        this.excludedPairs = new Set();
        this.setCoreFamilies(coreFamilies ?? []);
    }

    // Pairs ({giver, receiver} full names) that must not be drawn again, e.g. last year's.
    setExcludedPairs(pairs) {
        this.excludedPairs = new Set((Array.isArray(pairs) ? pairs : [])
            .filter(p => p && p.giver && p.receiver)
            .map(p => GiftExchangeService.pairKey(p.giver, p.receiver)));
    }

    static pairKey(giver, receiver) {
        return `${String(giver).trim().toLowerCase()}→${String(receiver).trim().toLowerCase()}`;
    }

    setCoreFamilies(coreFamilies) {
        const families = Array.isArray(coreFamilies) ? coreFamilies : [];
        const cleaned = families
            .map(f => (typeof f === 'string' ? f.trim() : ''))
            .filter(Boolean);

        // De-dupe (case-insensitive) but preserve first occurrence casing
        const seen = new Set();
        this.coreFamilies = [];
        for (const family of cleaned) {
            const key = family.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            this.coreFamilies.push(family);
        }
        this.coreFamilySet = new Set(this.coreFamilies.map(f => f.toLowerCase()));
    }

    getCoreFamilies() {
        return [...this.coreFamilies];
    }

    getCoreFamiliesDisplay() {
        if (!this.coreFamilies || this.coreFamilies.length === 0) return 'None';
        return this.coreFamilies.join(', ');
    }

    isCoreLastName(lastName) {
        if (!lastName) return false;
        return this.coreFamilySet.has(String(lastName).toLowerCase());
    }

    addPerson(firstName, lastName, familyGroup, wishlist) {
        if (this.isNameTaken(firstName, lastName)) {
            throw new Error(`"${firstName} ${lastName}" is already on the list.`);
        }
        const person = new Person(firstName, lastName, familyGroup, wishlist);
        this.names.push(person);
        return person;
    }

    removePerson(index) {
        if (index >= 0 && index < this.names.length) {
            this.names.splice(index, 1);
        }
    }

    getPeople() {
        return [...this.names];
    }

    clearPeople() {
        this.names = [];
    }

    // Plain data for saving / sharing with other features (e.g. Bad Santa).
    toRecords() {
        return this.names.map(p => ({
            firstName: p.firstName,
            lastName: p.lastName,
            familyGroup: p.familyGroup,
            wishlist: p.wishlist
        }));
    }

    // Adds valid, non-duplicate records; returns how many were added.
    loadRecords(records) {
        let added = 0;
        for (const r of Array.isArray(records) ? records : []) {
            if (!r || typeof r.firstName !== 'string' || typeof r.lastName !== 'string') continue;
            if (!r.firstName.trim() || !r.lastName.trim()) continue;
            if (this.isNameTaken(r.firstName, r.lastName)) continue;
            const group = typeof r.familyGroup === 'string' ? r.familyGroup : '';
            const wishlist = typeof r.wishlist === 'string' ? r.wishlist : '';
            this.addPerson(r.firstName, r.lastName, group, wishlist);
            added++;
        }
        return added;
    }

    isNameTaken(first, last) {
        const surname = Person.splitSurname(last).surname.toLowerCase();
        return this.names.some(entry =>
            entry.firstName.toLowerCase() === first.trim().toLowerCase() &&
            entry.lastName.toLowerCase() === surname
        );
    }

    shuffleAndAssign() {
        if (this.names.length < 2) {
            throw new Error('Please add at least 2 people.');
        }

        // Split into pools
        const corePool = this.names.filter(p => this.isCoreLastName(p.lastName));
        const otherPool = this.names.filter(p => !this.isCoreLastName(p.lastName));

        // Validate pools
        if (corePool.length === 1) {
            throw new Error(`Cannot match: Only 1 person in the Core families (${this.getCoreFamiliesDisplay()}).`);
        }
        if (otherPool.length === 1) {
            throw new Error('Cannot match: Only 1 person in the non-Core group.');
        }

        // Check matchability
        if (corePool.length > 0 && !this._isPoolMatchable(corePool)) {
            throw new Error('Cannot match Core families: All members are in the same family group. Please add people from different Core families.');
        }
        if (otherPool.length > 0 && !this._isPoolMatchable(otherPool)) {
            throw new Error('Cannot match non-Core group: All members are in the same family group. Please add people from different families.');
        }

        // Retry logic
        const maxRetries = 10;
        let allAssignments = null;

        for (let retry = 0; retry < maxRetries; retry++) {
            const coreAssignments = this._generateAssignments(corePool);
            const otherAssignments = this._generateAssignments(otherPool);

            if (coreAssignments && otherAssignments) {
                allAssignments = [...coreAssignments, ...otherAssignments];
                break;
            }
        }

        if (!allAssignments) {
            if (this.excludedPairs.size > 0) {
                throw new Error('Couldn’t avoid all of last year’s matches with this group. Turn off “Avoid last year’s matches” in Settings, or add more people.');
            }
            throw new Error('Could not find valid assignments after 10 attempts. Try adding more people or checking constraints.');
        }

        return allAssignments;
    }

    _isPoolMatchable(pool) {
        if (pool.length === 0) return true;
        if (pool.length === 1) return false;
        const uniqueGroups = new Set(pool.map(p => p.familyGroup.toLowerCase()));
        return uniqueGroups.size > 1;
    }

    _generateAssignments(pool) {
        if (pool.length === 0) return [];

        let givers = [...pool];
        let receivers = [...pool];
        let isValid = false;
        let attempts = 0;
        const maxAttempts = 2000;

        while (!isValid && attempts < maxAttempts) {
            // Fisher-Yates shuffle
            for (let i = receivers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [receivers[i], receivers[j]] = [receivers[j], receivers[i]];
            }

            // Validation
            isValid = true;
            for (let i = 0; i < givers.length; i++) {
                const giver = givers[i];
                const receiver = receivers[i];

                if (giver.firstName === receiver.firstName && giver.lastName === receiver.lastName) {
                    isValid = false;
                    break;
                }
                if (giver.familyGroup.toLowerCase() === receiver.familyGroup.toLowerCase()) {
                    isValid = false;
                    break;
                }
                if (this.excludedPairs.has(GiftExchangeService.pairKey(giver.getFullName(), receiver.getFullName()))) {
                    isValid = false;
                    break;
                }
            }
            attempts++;
        }

        if (!isValid) return null;

        return givers.map((giver, i) => ({
            giver: giver,
            receiver: receivers[i]
        }));
    }
}

// --- Persistence ---

// Saves the participant list so it survives reloads. Storage is injected
// (window.localStorage in the app, a fake in tests); every call is failure-safe.
class ParticipantStore {
    static get KEY() {
        return 'giftExchange.participants';
    }

    constructor(storage) {
        this.storage = storage;
    }

    load() {
        try {
            const raw = this.storage && this.storage.getItem(ParticipantStore.KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return parsed && Array.isArray(parsed.participants) ? parsed.participants : [];
        } catch (_) {
            return [];
        }
    }

    save(records) {
        try {
            if (this.storage) {
                this.storage.setItem(ParticipantStore.KEY, JSON.stringify({ version: 1, participants: records }));
            }
        } catch (_) { }
    }

    clear() {
        try {
            if (this.storage) this.storage.removeItem(ParticipantStore.KEY);
        } catch (_) { }
    }
}

// Remembers who gave to whom each year, so next year can avoid repeats.
class MatchHistory {
    static get KEY() {
        return 'giftExchange.history';
    }

    constructor(storage) {
        this.storage = storage;
    }

    read() {
        try {
            const raw = this.storage && this.storage.getItem(MatchHistory.KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && parsed.years && typeof parsed.years === 'object' ? parsed : { version: 1, years: {} };
        } catch (_) {
            return { version: 1, years: {} };
        }
    }

    getYear(year) {
        const pairs = this.read().years[String(year)];
        return Array.isArray(pairs) ? pairs : [];
    }

    saveYear(year, pairs) {
        try {
            if (!this.storage) return;
            const data = this.read();
            data.years[String(year)] = pairs;
            this.storage.setItem(MatchHistory.KEY, JSON.stringify(data));
        } catch (_) { }
    }
}

// "Ann A -> Ben B" (also →, =>, ":" or "gives to"), one per line. A trailing "(…)" note is ignored.
function parseMatchLines(text) {
    const pairs = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
        const line = raw.replace(/\(.*\)\s*$/, '').trim();
        const parts = line.split(/\s*(?:->|→|=>|:|\bgives to\b)\s*/i);
        if (parts.length === 2 && parts[0] && parts[1]) {
            pairs.push({ giver: parts[0].trim(), receiver: parts[1].trim() });
        }
    }
    return pairs;
}

// --- Sound ---

// Festive sound effects synthesised with Web Audio (no audio files to download).
// The AudioContext factory is injected so tests can use a fake; without Web Audio it's silent.
class SoundService {
    constructor(createContext) {
        this.createContext = createContext || SoundService.browserContext;
        this.enabled = true;
        this.ctx = undefined;
        this.master = null;
    }

    static browserContext() {
        const Ctor = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        return Ctor ? new Ctor() : null;
    }

    setEnabled(on) {
        this.enabled = Boolean(on);
    }

    isEnabled() {
        return this.enabled;
    }

    context() {
        if (this.ctx === undefined) {
            try {
                this.ctx = this.createContext() || null;
            } catch (_) {
                this.ctx = null;
            }
        }
        if (this.ctx && this.ctx.state === 'suspended' && this.ctx.resume) {
            this.ctx.resume().catch(() => { });
        }
        return this.ctx;
    }

    // One shared mix bus: every effect -> master -> (soft room reverb) -> gentle
    // low-pass -> compressor -> speakers. Keeps effects warm and never harsh or loud.
    bus() {
        if (this.master) return this.master;
        const ctx = this.ctx;
        let out = ctx.destination;
        if (ctx.createDynamicsCompressor) {
            const comp = ctx.createDynamicsCompressor();
            const set = (param, v) => { if (param) param.value = v; };
            set(comp.threshold, -20);
            set(comp.knee, 14);
            set(comp.ratio, 3);
            set(comp.attack, 0.004);
            set(comp.release, 0.25);
            comp.connect(ctx.destination);
            out = comp;
        }
        const warm = ctx.createBiquadFilter();
        warm.type = 'lowpass';
        warm.frequency.value = 6500;
        warm.Q.value = 0.5;
        warm.connect(out);

        const master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(warm);
        if (ctx.createConvolver) {
            const room = ctx.createConvolver();
            room.buffer = this.roomImpulse(1.8);
            const send = ctx.createGain();
            send.gain.value = 0.22;
            master.connect(send);
            send.connect(room);
            room.connect(warm);
        }
        this.master = master;
        return master;
    }

    // A decaying stereo noise tail: a small, soft room.
    roomImpulse(seconds) {
        const ctx = this.ctx;
        const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
        const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
        }
        return buffer;
    }

    play(name) {
        if (!this.enabled) return;
        const effect = SoundService.EFFECTS[name];
        if (!effect) return;
        const ctx = this.context();
        if (!ctx) return;
        try {
            this.bus();
            effect(this, ctx.currentTime);
        } catch (_) { }
    }

    // A single enveloped oscillator note with a soft attack.
    tone(t, { freq, endFreq, dur = 0.3, type = 'sine', gain = 0.1, attack = 0.012 }) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.linearRampToValueAtTime(gain, t + attack);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(amp).connect(this.bus());
        osc.start(t);
        osc.stop(t + dur + 0.05);
    }

    // A soft glockenspiel / music-box bell: a few sine partials, the higher ones fading faster.
    bell(t, freq, { gain = 0.06, dur = 1.6 } = {}) {
        [[1, 1, 1], [2, 0.3, 0.55], [3, 0.12, 0.35], [4.2, 0.05, 0.22]].forEach(([ratio, level, life]) =>
            this.tone(t, { freq: freq * ratio, dur: dur * life, gain: gain * level, attack: 0.006 }));
    }

    // Filtered white noise: bells' shimmer, sizzle, air, brushes.
    noise(t, { dur = 0.2, gain = 0.05, type = 'bandpass', freq = 4000, endFreq, q = 1, attack = 0.01 }) {
        const ctx = this.ctx;
        const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.setValueAtTime(freq, t);
        if (endFreq) filter.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
        filter.Q.value = q;
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.linearRampToValueAtTime(gain, t + attack);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(filter).connect(amp).connect(this.bus());
        src.start(t);
        src.stop(t + dur + 0.05);
    }

    static get EFFECTS() {
        // Notes (Hz) from C major, so every effect sits nicely over the background music.
        const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, D6 = 1174.66, E6 = 1318.51, G6 = 1567.98, C7 = 2093;
        return {
            // Sleigh bells: a light shimmer under a rising glockenspiel arpeggio.
            jingle: (s, t) => {
                for (let i = 0; i < 8; i++) {
                    s.noise(t + i * 0.12 + (i % 2) * 0.03, { dur: 0.08, gain: 0.018, freq: 6500, q: 1.6 });
                }
                [G5, C6, E6, G6].forEach((f, i) => s.bell(t + 0.05 + i * 0.15, f, { gain: 0.05, dur: 1.4 }));
            },
            // Spinning dreidel: a soft breath of air.
            whoosh: (s, t) => {
                s.noise(t, { dur: 0.8, gain: 0.05, freq: 300, endFreq: 1200, q: 0.8, attack: 0.25 });
            },
            // A warm two-note bell.
            chime: (s, t) => {
                s.bell(t, G5, { gain: 0.06, dur: 2.2 });
                s.bell(t + 0.12, D6, { gain: 0.035, dur: 2.0 });
            },
            // Latkes in the pan: a quiet, low sizzle.
            sizzle: (s, t) => {
                s.noise(t, { dur: 0.9, gain: 0.02, type: 'highpass', freq: 2500, attack: 0.15 });
                for (let i = 0; i < 5; i++) s.noise(t + 0.12 + i * 0.14, { dur: 0.03, gain: 0.012, freq: 4000, q: 2 });
            },
            // Gelt clinking: three small, rising bells.
            coins: (s, t) => {
                [C7, 2349.32, 2637.02].forEach((f, i) => s.bell(t + i * 0.11, f, { gain: 0.03, dur: 0.4 }));
            },
            // The reveal: a soft major chord that swells in, with a sparkle on top.
            tada: (s, t) => {
                [C5, E5, G5].forEach(f => s.tone(t, { freq: f, dur: 1.5, gain: 0.04, attack: 0.08 }));
                [C6, E6, G6, C7].forEach((f, i) => s.bell(t + 0.08 + i * 0.07, f, { gain: 0.03, dur: 1.2 }));
            },
            // A gentle wooden tap for button clicks.
            tick: (s, t) => {
                s.tone(t, { freq: 880, dur: 0.07, gain: 0.05, attack: 0.003 });
            },
            // Brushes on a snare, swelling softly (before each party-mode reveal).
            drumroll: (s, t) => {
                for (let i = 0; i < 26; i++) {
                    s.noise(t + i * 0.045, { dur: 0.06, gain: 0.012 + i * 0.0016, freq: 900, q: 0.6 });
                }
            },
        };
    }
}

// Quiet looping background music (an <audio> element, created on first use).
// Browsers only allow playback after the visitor clicks or presses a key, so
// UIManager calls start() then. Fades in and out instead of cutting.
class MusicService {
    static get VOLUME() {
        return 0.16;
    }

    static get TRACKS() {
        // One calm track suits both themes; give Hanukkah its own file here to switch per theme.
        return { christmas: 'assets/music-christmas.mp3', hanukkah: 'assets/music-christmas.mp3' };
    }

    constructor(createAudio, tracks) {
        this.createAudio = createAudio || MusicService.browserAudio;
        this.tracks = tracks || MusicService.TRACKS;
        this.enabled = true;
        this.started = false;
        this.theme = 'christmas';
        this.audio = null;
        this.src = null;
        this.fades = new Map();
    }

    static browserAudio(src) {
        return typeof Audio === 'function' ? new Audio(src) : null;
    }

    isEnabled() {
        return this.enabled;
    }

    setEnabled(on) {
        this.enabled = Boolean(on);
        if (!this.enabled) this.fadeOut(this.audio);
        else if (this.started) this.play();
    }

    start() {
        this.started = true;
        if (this.enabled) this.play();
    }

    setTheme(theme) {
        this.theme = theme === 'hanukkah' ? 'hanukkah' : 'christmas';
        if (!this.audio || this.src === this.tracks[this.theme]) return;
        this.fadeOut(this.audio);
        this.audio = null;
        if (this.started && this.enabled) this.play();
    }

    play() {
        const src = this.tracks[this.theme];
        if (!this.audio) {
            try {
                this.audio = this.createAudio(src) || null;
            } catch (_) {
                this.audio = null;
            }
            if (!this.audio) return;
            this.src = src;
            this.audio.loop = true;
            this.audio.preload = 'auto';
            this.audio.volume = 0.01;
        }
        try {
            const p = this.audio.play();
            if (p && typeof p.catch === 'function') p.catch(() => { });
        } catch (_) { }
        this.fade(this.audio, MusicService.VOLUME, 3000);
    }

    fadeOut(audio) {
        if (audio) this.fade(audio, 0, 1200, () => audio.pause());
    }

    fade(audio, to, ms, done) {
        clearInterval(this.fades.get(audio));
        const from = audio.volume;
        const steps = Math.max(1, Math.round(ms / 100));
        let i = 0;
        const id = setInterval(() => {
            i++;
            audio.volume = Math.min(1, Math.max(0, from + (to - from) * (i / steps)));
            if (i >= steps) {
                clearInterval(id);
                this.fades.delete(audio);
                if (done) done();
            }
        }, 100);
        this.fades.set(audio, id);
    }
}

class AnimationService {
    constructor(sound) {
        this.sound = sound || null;
        this.overlay = document.getElementById('loadingOverlay');
        this.loadingText = document.getElementById('loadingText');
        this.giftIcon = document.getElementById('giftIcon');
        this.giftOpenIcon = document.getElementById('giftOpenIcon');
        this.hanukkahContainer = document.getElementById('hanukkahContainer');
        this.hanukkahIcon = document.getElementById('hanukkahIcon');
        this.menorahIcon = document.getElementById('menorahIcon');
        this.menorahFlames = document.querySelector('.menorah-flames');
        this.latkeIcon = document.getElementById('latkeIcon');
        this.geltIcon = document.getElementById('geltIcon');
    }

    static get MESSAGES() {
        return {
            christmas: [
                'Checking the Naughty List...',
                'Checking it twice...',
                'Wrapping gifts...',
                'Here they come!'
            ],
            hanukkah: [
                'Spinning the Dreidel...',
                'Lighting the Menorah...',
                'Frying Latkes...',
                'Counting Gelt...'
            ]
        };
    }

    sfx(name) {
        if (this.sound) this.sound.play(name);
    }

    play(theme, callback) {
        const isHanukkah = theme === 'hanukkah';
        this.sfx(isHanukkah ? 'whoosh' : 'jingle');
        this.overlay.classList.remove('hidden');
        this.overlay.style.display = 'flex';

        this.resetChristmasState();
        this.resetHanukkahState();
        if (this.hanukkahContainer) this.hanukkahContainer.classList.remove('pop-out');

        if (isHanukkah) {
            this.giftIcon.classList.add('hidden');
            if (this.hanukkahContainer) this.hanukkahContainer.classList.remove('hidden');
            if (this.hanukkahIcon) this.hanukkahIcon.classList.add('spin');
        } else {
            if (this.hanukkahContainer) this.hanukkahContainer.classList.add('hidden');
            this.giftIcon.classList.remove('hidden');
        }

        const messages = AnimationService.MESSAGES[isHanukkah ? 'hanukkah' : 'christmas'];
        let step = 0;
        this.loadingText.textContent = messages[0];

        const interval = setInterval(() => {
            step++;
            if (step < messages.length) {
                this.loadingText.textContent = messages[step];
                if (isHanukkah) {
                    this.showHanukkahStep(step);
                    this.sfx(['', 'chime', 'sizzle', 'coins'][step]);
                } else if (step === messages.length - 1) {
                    this.openGift();
                    this.sfx('chime');
                } else {
                    this.sfx('tick');
                }
                return;
            }

            clearInterval(interval);
            this.sfx('tada');
            if (isHanukkah) {
                if (this.hanukkahContainer) this.hanukkahContainer.classList.add('pop-out');
            } else {
                this.giftIcon.classList.add('pop-out');
                if (this.giftOpenIcon) this.giftOpenIcon.classList.add('pop-out');
            }

            setTimeout(() => {
                this.overlay.classList.add('hidden');
                this.overlay.style.display = '';
                if (isHanukkah) this.resetHanukkahState();
                if (callback) callback();
            }, 500);
        }, 800);
    }

    openGift() {
        if (!this.giftOpenIcon) return;
        this.giftIcon.classList.add('hidden');
        this.giftOpenIcon.classList.remove('hidden');
    }

    showHanukkahStep(step) {
        if (step === 1) {
            if (this.hanukkahIcon) {
                this.hanukkahIcon.classList.add('hidden');
                this.hanukkahIcon.classList.remove('spin');
            }
            if (this.menorahIcon) this.menorahIcon.classList.remove('hidden');
            if (this.menorahFlames) this.menorahFlames.classList.remove('hidden');
        }
        if (step === 2) {
            if (this.menorahIcon) this.menorahIcon.classList.add('hidden');
            if (this.latkeIcon) {
                this.latkeIcon.style.opacity = '1';
                this.latkeIcon.classList.add('sizzle');
            }
        }
        if (step === 3) {
            if (this.latkeIcon) {
                this.latkeIcon.style.opacity = '0';
                this.latkeIcon.classList.remove('sizzle');
            }
            if (this.geltIcon) this.geltIcon.style.opacity = '1';
        }
    }

    resetChristmasState() {
        this.giftIcon.classList.remove('pop-out');
        if (this.giftOpenIcon) {
            this.giftOpenIcon.classList.remove('pop-out');
            this.giftOpenIcon.classList.add('hidden');
        }
    }

    resetHanukkahState() {
        if (this.latkeIcon) {
            this.latkeIcon.style.opacity = '0';
            this.latkeIcon.classList.remove('sizzle');
        }
        if (this.geltIcon) this.geltIcon.style.opacity = '0';
        if (this.menorahIcon) this.menorahIcon.classList.add('hidden');
        if (this.menorahFlames) this.menorahFlames.classList.add('hidden');
        if (this.hanukkahIcon) {
            this.hanukkahIcon.classList.remove('spin');
            this.hanukkahIcon.classList.remove('hidden');
        }
    }
}

// --- Event details (budget, date, countdown) ---

// Pure formatting helpers; "today" is always passed in so tests can pick the day.
class EventDetails {
    static formatBudget(raw) {
        const text = String(raw || '').trim();
        if (!text) return '';
        return /^\d+(\.\d+)?$/.test(text) ? `$${text}` : text;
    }

    static parseDate(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
        if (!m) return null;
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return Number.isNaN(d.getTime()) ? null : d;
    }

    static daysUntil(iso, today) {
        const target = EventDetails.parseDate(iso);
        if (!target) return null;
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        return Math.round((target - start) / 86400000);
    }

    static formatDate(iso) {
        const d = EventDetails.parseDate(iso);
        return d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    }

    static describe({ budget, date } = {}, today) {
        const budgetText = EventDetails.formatBudget(budget);
        const days = EventDetails.daysUntil(date, today);
        let countdown = '';
        let snow = 'normal';
        if (days !== null && days >= 0) {
            countdown = days === 0 ? "Today's the day! 🎉" : days === 1 ? 'Tomorrow!' : `${days} days to go`;
            snow = days <= 3 ? 'blizzard' : days <= 14 ? 'heavy' : 'normal';
        }
        return {
            budget: budgetText ? `${budgetText} limit` : '',
            date: EventDetails.formatDate(date),
            countdown,
            snow,
        };
    }

    static summaryLine({ budget, date } = {}) {
        const parts = [];
        const b = EventDetails.formatBudget(budget);
        const d = EventDetails.formatDate(date);
        if (b) parts.push(`Budget: ${b}`);
        if (d) parts.push(`Exchange: ${d}`);
        return parts.join(' · ');
    }
}

// --- Bulk import parsing ---

// Turns pasted text into people. People are separated by commas or new lines.
// Each person is "First [Middle] Last" with an optional [Family Group] and {Wishlist}.
// A [group] or {wishlist} on its own (e.g. "Ann Frost, [Frost 1],") belongs to the
// person just before it. A trailing number stays with the surname ("Zac Harlan 1").
function parseBulkList(text) {
    const people = [];
    let last = null;
    for (const raw of String(text).split(/[,\n\r]+/)) {
        let segment = raw.trim();
        if (!segment) continue;

        let group = '';
        const groupMatch = segment.match(/\[(.*?)\]/);
        if (groupMatch) {
            group = groupMatch[1].trim();
            segment = segment.replace(groupMatch[0], ' ');
        }
        let wishlist = '';
        const wishMatch = segment.match(/\{(.*?)\}/);
        if (wishMatch) {
            wishlist = wishMatch[1].trim();
            segment = segment.replace(wishMatch[0], ' ');
        }

        const parts = segment.split(/\s+/).filter(Boolean);
        if (parts.length === 0) {
            // A stand-alone [group] / {wishlist} belongs to the previous person.
            if (last) {
                if (group && !last.group) last.group = group;
                if (wishlist && !last.wishlist) last.wishlist = wishlist;
            }
            continue;
        }
        if (parts.length < 2) {
            last = null; // not a full name, so a following [group] must not attach to someone else
            continue;
        }
        const takesNumber = parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1]);
        const lastName = parts.splice(takesNumber ? -2 : -1).join(' ');
        last = { firstName: parts.join(' '), lastName, group, wishlist };
        people.push(last);
    }
    return people;
}

// --- Party reveal mode ---

// Full-screen, one-at-a-time reveal for showing on a TV at the party:
// giver -> drumroll while the gift shakes -> gift opens, receiver + confetti.
class PartyReveal {
    static get DRUMROLL_MS() {
        return 1300;
    }

    constructor(sound) {
        this.sound = sound || null;
        this.items = [];
        this.index = 0;
        this.revealed = false;
        this.finished = false;
        this.timer = null;
        const $ = (id) => document.getElementById(id);
        this.overlay = $('partyOverlay');
        if (!this.overlay) return;
        this.progress = $('partyProgress');
        this.card = $('partyCard');
        this.giver = $('partyGiver');
        this.giftClosed = $('partyGiftClosed');
        this.giftOpen = $('partyGiftOpen');
        this.receiver = $('partyReceiver');
        this.wishlist = $('partyWishlist');
        this.finale = $('partyFinale');
        this.confetti = $('partyConfetti');
        this.prevBtn = $('partyPrev');
        this.nextBtn = $('partyNext');
        this.closeBtn = $('partyClose');

        if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.next());
        if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.prev());
        if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());
        document.addEventListener('keydown', (e) => this.onKey(e));
    }

    isOpen() {
        return Boolean(this.overlay) && !this.overlay.classList.contains('hidden');
    }

    sfx(name) {
        if (this.sound) this.sound.play(name);
    }

    open(assignments) {
        if (!this.overlay || !Array.isArray(assignments) || assignments.length === 0) return;
        this.items = [...assignments];
        this.overlay.classList.remove('hidden');
        document.body.classList.add('party-mode');
        this.show(0);
        if (this.nextBtn) this.nextBtn.focus();
    }

    close() {
        this.cancel();
        if (!this.overlay) return;
        this.overlay.classList.add('hidden');
        document.body.classList.remove('party-mode');
    }

    cancel() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    onKey(e) {
        if (!this.isOpen()) return;
        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            this.next();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.prev();
        } else if (e.key === 'Escape') {
            this.close();
        }
    }

    show(i, { alreadyRevealed = false } = {}) {
        this.cancel();
        this.index = i;
        this.revealed = false;
        this.finished = false;
        const pair = this.items[i];
        this.card.classList.remove('hidden');
        this.finale.classList.add('hidden');
        this.progress.textContent = `${i + 1} of ${this.items.length}`;
        this.giver.textContent = pair.giver.getFullName();
        this.receiver.classList.add('hidden');
        this.wishlist.classList.add('hidden');
        this.giftOpen.classList.add('hidden');
        this.giftClosed.classList.remove('hidden');
        this.confetti.replaceChildren();
        if (this.prevBtn) this.prevBtn.disabled = i === 0;
        if (this.nextBtn) this.nextBtn.textContent = 'Reveal ▶';

        if (alreadyRevealed) {
            this.reveal({ quiet: true });
            return;
        }
        this.sfx('drumroll');
        this.timer = setTimeout(() => this.reveal(), PartyReveal.DRUMROLL_MS);
    }

    reveal({ quiet = false } = {}) {
        this.cancel();
        this.revealed = true;
        const pair = this.items[this.index];
        this.receiver.textContent = pair.receiver.getFullName();
        this.receiver.classList.remove('hidden');
        if (pair.receiver.wishlist) {
            this.wishlist.textContent = `🎁 Wishlist: ${pair.receiver.wishlist}`;
            this.wishlist.classList.remove('hidden');
        }
        this.giftClosed.classList.add('hidden');
        this.giftOpen.classList.remove('hidden');
        if (this.nextBtn) this.nextBtn.textContent = this.index === this.items.length - 1 ? 'Finish 🎉' : 'Next ▶';
        if (!quiet) {
            this.sfx('tada');
            this.burstConfetti();
        }
    }

    next() {
        if (!this.isOpen()) return;
        if (this.finished) {
            this.close();
            return;
        }
        if (!this.revealed) {
            this.reveal();
        } else if (this.index < this.items.length - 1) {
            this.show(this.index + 1);
        } else {
            this.showFinale();
        }
    }

    prev() {
        if (!this.isOpen()) return;
        if (this.finished) {
            this.show(this.items.length - 1, { alreadyRevealed: true });
        } else if (this.index > 0) {
            this.show(this.index - 1, { alreadyRevealed: true });
        }
    }

    showFinale() {
        this.cancel();
        this.finished = true;
        this.card.classList.add('hidden');
        this.finale.classList.remove('hidden');
        this.progress.textContent = `All ${this.items.length} revealed`;
        if (this.prevBtn) this.prevBtn.disabled = false;
        if (this.nextBtn) this.nextBtn.textContent = 'Done';
        this.sfx('chime');
        this.burstConfetti(80);
    }

    burstConfetti(count = 48) {
        const colors = ['#ff4d5e', '#ffd166', '#3ddc84', '#5fb4ff', '#ffffff', '#f5c45a'];
        const pieces = [];
        for (let i = 0; i < count; i++) {
            const piece = el('i', 'confetti-piece');
            piece.style.setProperty('--x', `${Math.round(Math.random() * 100)}vw`);
            piece.style.setProperty('--drift', `${Math.round(Math.random() * 30 - 15)}vw`);
            piece.style.setProperty('--delay', `${(Math.random() * 0.4).toFixed(2)}s`);
            piece.style.setProperty('--spin', `${Math.round(Math.random() * 720 - 360)}deg`);
            piece.style.setProperty('--c', colors[i % colors.length]);
            pieces.push(piece);
        }
        this.confetti.replaceChildren(...pieces);
    }
}

// --- Guided tour ---

// The walkthrough shown by "How it works". A step without a target (or whose target
// is hidden right now) is shown as a centered card.
const TOUR_STEPS = [
    {
        title: 'Welcome! 🎄',
        text: 'This quick tour shows you how to run your gift exchange. It takes about a minute. Use Next and Back, or the arrow keys.'
    },
    {
        target: '.input-group',
        title: 'Add everyone',
        text: 'Type a first and last name, then press + (or Enter). Family group and wishlist are optional.'
    },
    {
        target: '#groupInput',
        title: 'Keep families apart',
        text: 'People in the same family group never draw each other. Leave it blank and the last name is used. Two households with the same surname? Use “Smith 1” and “Smith 2”.'
    },
    {
        target: '#toggleBulkBtn',
        title: 'Got a long list?',
        text: 'Bulk import lets you paste everyone at once, one per line or separated by commas. Add [Family] or {wishlist} after a name.'
    },
    {
        target: '#toggleSettingsBtn',
        title: 'Settings',
        text: 'Pick a Christmas or Hanukkah theme, set a budget and exchange date (a countdown appears at the top), and avoid repeating last year’s matches.'
    },
    {
        target: '.list-section',
        title: 'Your list',
        text: 'Everyone you add appears here as a gift tag, coloured by family. Remove someone with ✕. The list is saved in this browser only, so names never leave your device.'
    },
    {
        target: '#shuffleBtn',
        title: 'Shuffle & assign',
        text: 'With at least two people on the list, press this. Everyone gets someone to buy for, never themselves or their own family.'
    },
    {
        target: '#resultsSection',
        title: 'Share the results',
        text: 'After the shuffle you can reveal matches one at a time on the TV (Party reveal), print gift tags, email or copy the list, or reshuffle.'
    },
    {
        target: '#modeSwitch',
        title: 'Playing white elephant?',
        text: 'Turn on “Show Bad Santa” in Settings and a switch appears here. In Bad Santa everyone draws a number, then opens a gift or steals one. The app keeps track of turns and steals.'
    },
    {
        target: '.audio-controls',
        title: 'Music & sound',
        text: 'Soft holiday music plays in the background, and gentle bells chime during the shuffle. Tap 🎵 to turn the music off, or the bell to mute the sound effects.'
    },
    {
        title: 'You’re all set! 🎁',
        text: 'Start by adding the first name. You can replay this tour any time with “How it works” at the top of the page.'
    }
];

// Spotlight walkthrough: dims the page, highlights one element per step and shows a
// card with Back / Next / Skip. Knows nothing about people; UIManager owns "seen" state.
class GuidedTour {
    static get PAD() {
        return 8; // space between the target and the spotlight edge
    }

    constructor(steps) {
        this.steps = Array.isArray(steps) ? steps : TOUR_STEPS;
        this.index = 0;
        this.onClose = null;
        this.returnFocus = null;
        const $ = (id) => document.getElementById(id);
        this.overlay = $('tourOverlay');
        if (!this.overlay) return;
        this.spotlight = $('tourSpotlight');
        this.card = $('tourCard');
        this.progress = $('tourProgress');
        this.title = $('tourTitle');
        this.text = $('tourText');
        this.prevBtn = $('tourPrev');
        this.nextBtn = $('tourNext');
        this.skipBtn = $('tourSkip');

        this.nextBtn.addEventListener('click', () => this.next());
        this.prevBtn.addEventListener('click', () => this.prev());
        this.skipBtn.addEventListener('click', () => this.close());
        document.addEventListener('keydown', (e) => this.onKey(e));
        const reposition = () => {
            if (this.isOpen()) this.place();
        };
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, { passive: true });
    }

    isOpen() {
        return Boolean(this.overlay) && !this.overlay.classList.contains('hidden');
    }

    start() {
        if (!this.overlay || this.steps.length === 0) return;
        this.returnFocus = document.activeElement;
        this.overlay.classList.remove('hidden');
        document.body.classList.add('tour-open');
        this.show(0);
    }

    close() {
        if (!this.isOpen()) return;
        const completed = this.index === this.steps.length - 1;
        this.overlay.classList.add('hidden');
        document.body.classList.remove('tour-open');
        if (this.returnFocus && typeof this.returnFocus.focus === 'function') this.returnFocus.focus();
        if (this.onClose) this.onClose({ completed });
    }

    next() {
        if (!this.isOpen()) return;
        if (this.index < this.steps.length - 1) this.show(this.index + 1);
        else this.close();
    }

    prev() {
        if (this.isOpen() && this.index > 0) this.show(this.index - 1);
    }

    onKey(e) {
        if (!this.isOpen()) return;
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.next();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.prev();
        } else if (e.key === 'Escape') {
            this.close();
        } else if (e.key === 'Tab') {
            this.trapFocus(e);
        }
    }

    // Keep keyboard focus on the card's buttons while the page behind is dimmed.
    trapFocus(e) {
        const buttons = [this.skipBtn, this.prevBtn, this.nextBtn].filter(b => !b.disabled);
        const at = buttons.indexOf(document.activeElement);
        const step = e.shiftKey ? -1 : 1;
        e.preventDefault();
        buttons[(at + step + buttons.length) % buttons.length].focus();
    }

    show(i) {
        this.index = i;
        const step = this.steps[i];
        this.progress.textContent = `${i + 1} of ${this.steps.length}`;
        this.title.textContent = step.title;
        this.text.textContent = step.text;
        this.prevBtn.disabled = i === 0;
        this.nextBtn.textContent = i === this.steps.length - 1 ? 'Let’s go!' : 'Next';

        const target = this.targetFor(step);
        if (target && typeof target.scrollIntoView === 'function') {
            const reduce = typeof window.matchMedia === 'function' &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        }
        this.place();
        this.nextBtn.focus();
    }

    // The step's element, if it is on the page and visible right now.
    targetFor(step) {
        if (!step.target) return null;
        const node = document.querySelector(step.target);
        if (!node) return null;
        const r = node.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? node : null;
    }

    place() {
        const target = this.targetFor(this.steps[this.index]);
        this.overlay.classList.toggle('tour-centered', !target);
        this.spotlight.classList.toggle('hidden', !target);
        if (!target) {
            this.card.style.top = '';
            this.card.style.left = '';
            return;
        }

        const pad = GuidedTour.PAD;
        const r = target.getBoundingClientRect();
        Object.assign(this.spotlight.style, {
            top: `${r.top - pad}px`,
            left: `${r.left - pad}px`,
            width: `${r.width + pad * 2}px`,
            height: `${r.height + pad * 2}px`
        });

        // Card goes below the spotlight if it fits, else above, else pinned to the bottom.
        const gap = 14;
        const margin = 12;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cardW = this.card.offsetWidth;
        const cardH = this.card.offsetHeight;
        const below = r.bottom + pad + gap;
        const above = r.top - pad - gap - cardH;
        let top;
        if (below + cardH <= vh - margin) top = below;
        else if (above >= margin) top = above;
        else top = vh - cardH - margin;
        const centre = r.left + r.width / 2 - cardW / 2;
        const left = Math.min(Math.max(centre, margin), Math.max(margin, vw - cardW - margin));
        this.card.style.top = `${Math.max(margin, top)}px`;
        this.card.style.left = `${left}px`;
    }
}

// Create an element with a class and (text-only) content.
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

class UIManager {
    constructor(exchangeService, animationService, participantStore, matchHistory, soundService, partyReveal, guidedTour, musicService) {
        this.exchangeService = exchangeService;
        this.music = musicService || null;
        this.tour = guidedTour || new GuidedTour(TOUR_STEPS);
        this.sound = soundService || null;
        this.partyReveal = partyReveal || new PartyReveal(this.sound);
        this.print = () => window.print();
        this.lastAssignments = [];
        this.animationService = animationService;
        this.participantStore = participantStore || new ParticipantStore(UIManager.browserStorage());
        this.matchHistory = matchHistory || new MatchHistory(UIManager.browserStorage());
        this.confirm = (message) => window.confirm(message);

        this.STORAGE_KEY_CORE_FAMILIES = 'giftExchange.coreFamilies';
        this.STORAGE_KEY_THEME = 'giftExchange.theme';
        this.STORAGE_KEY_BUDGET = 'giftExchange.budget';
        this.STORAGE_KEY_DATE = 'giftExchange.date';
        this.STORAGE_KEY_AVOID_REPEATS = 'giftExchange.avoidRepeats';
        this.STORAGE_KEY_SOUND = 'giftExchange.sound';
        this.STORAGE_KEY_TOUR_SEEN = 'giftExchange.tourSeen';
        this.STORAGE_KEY_SHOW_BAD_SANTA = 'giftExchange.showBadSanta';
        this.STORAGE_KEY_MUSIC = 'giftExchange.music';
        this.now = () => new Date();

        // Elements
        this.firstNameInput = document.getElementById('firstNameInput');
        this.lastNameInput = document.getElementById('lastNameInput');
        this.groupInput = document.getElementById('groupInput');
        this.wishlistInput = document.getElementById('wishlistInput');
        this.addBtn = document.getElementById('addBtn');
        this.nameList = document.getElementById('nameList');
        this.shuffleBtn = document.getElementById('shuffleBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.resultsSection = document.getElementById('resultsSection');
        this.resultsList = document.getElementById('resultsList');
        this.errorMsg = document.getElementById('errorMsg');

        // Bulk Import Elements
        this.toggleBulkBtn = document.getElementById('toggleBulkBtn');
        this.bulkSection = document.getElementById('bulkSection');
        this.bulkInput = document.getElementById('bulkInput');
        this.importBtn = document.getElementById('importBtn');

        // Settings Elements
        this.toggleSettingsBtn = document.getElementById('toggleSettingsBtn');
        this.settingsSection = document.getElementById('settingsSection');
        this.coreFamiliesInput = document.getElementById('coreFamiliesInput');
        this.saveCoreFamiliesBtn = document.getElementById('saveCoreFamiliesBtn');
        this.themeSelect = document.getElementById('themeSelect');
        this.budgetInput = document.getElementById('budgetInput');
        this.exchangeDateInput = document.getElementById('exchangeDateInput');
        this.eventBanner = document.getElementById('eventBanner');
        this.avoidRepeatsToggle = document.getElementById('avoidRepeatsToggle');
        this.showBadSantaToggle = document.getElementById('showBadSantaToggle');
        this.lastYearInput = document.getElementById('lastYearInput');
        this.repeatNote = document.getElementById('repeatNote');
        this.soundToggle = document.getElementById('soundToggle');
        this.musicToggle = document.getElementById('musicToggle');
        this.partyBtn = document.getElementById('partyBtn');
        this.printBtn = document.getElementById('printBtn');
        this.printSheet = document.getElementById('printSheet');

        // List chrome (optional elements)
        this.nameCount = document.getElementById('nameCount');
        this.emptyState = document.getElementById('emptyState');
        this.clearListBtn = document.getElementById('clearListBtn');

        this.initSettings();

        // Extra Buttons
        this.reshuffleBtn = document.getElementById('reshuffleBtn');
        this.emailBtn = document.getElementById('emailBtn');
        this.copyBtn = document.getElementById('copyBtn');

        this.initEventListeners();
        this.initTour();
        this.initMusic();
        this.restoreParticipants();
        this.updateButtons();
    }

    // "How it works" walkthrough. First-time visitors get an invite (never an
    // uninvited pop-up); finishing, skipping or declining it hides the invite for good.
    initTour() {
        this.tourBtn = document.getElementById('tourBtn');
        this.tourInvite = document.getElementById('tourInvite');
        const inviteStart = document.getElementById('tourInviteStart');
        const inviteDismiss = document.getElementById('tourInviteDismiss');

        this.tour.onClose = () => this.markTourSeen();
        if (this.tourBtn) this.tourBtn.addEventListener('click', () => this.startTour());
        if (inviteStart) inviteStart.addEventListener('click', () => this.startTour());
        if (inviteDismiss) inviteDismiss.addEventListener('click', () => this.markTourSeen());

        let seen = false;
        try {
            seen = localStorage.getItem(this.STORAGE_KEY_TOUR_SEEN) === '1';
        } catch (_) { }
        if (this.tourInvite) this.tourInvite.classList.toggle('hidden', seen);
    }

    startTour() {
        // The tour walks through Secret Santa, so leave Bad Santa mode first.
        if (document.body.dataset.mode === 'bad-santa') {
            const back = document.querySelector('#modeSwitch [data-mode="secret-santa"]');
            if (back) back.click();
        }
        if (this.tourInvite) this.tourInvite.classList.add('hidden');
        this.tour.start();
    }

    markTourSeen() {
        if (this.tourInvite) this.tourInvite.classList.add('hidden');
        try {
            localStorage.setItem(this.STORAGE_KEY_TOUR_SEEN, '1');
        } catch (_) { }
    }

    static browserStorage() {
        try {
            return window.localStorage;
        } catch (_) {
            return null;
        }
    }

    restoreParticipants() {
        this.exchangeService.loadRecords(this.participantStore.load());
        this.renderList();
    }

    saveParticipants() {
        this.participantStore.save(this.exchangeService.toRecords());
    }

    handleClearList() {
        const count = this.exchangeService.getPeople().length;
        if (count === 0) return;
        if (!this.confirm(`Remove all ${count} people from the list?`)) return;
        this.exchangeService.clearPeople();
        this.participantStore.clear();
        this.resetView();
        this.renderList();
        this.updateButtons();
    }

    initEventListeners() {
        // Add Name
        this.addBtn.addEventListener('click', () => this.handleAddName());

        // Inputs Enter Key
        this.firstNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.lastNameInput.focus();
        });
        this.lastNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.groupInput.focus();
        });
        this.groupInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.wishlistInput.focus();
        });
        this.wishlistInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleAddName();
        });

        // Shuffle
        this.shuffleBtn.addEventListener('click', () => this.handleShuffle());

        // Reset
        this.resetBtn.addEventListener('click', () => this.resetView());

        // Reshuffle
        if (this.reshuffleBtn) {
            this.reshuffleBtn.addEventListener('click', () => this.handleShuffle());
        }

        // Copy
        if (this.copyBtn) {
            this.copyBtn.addEventListener('click', () => this.handleCopy());
        }

        // Email
        if (this.emailBtn) {
            this.emailBtn.addEventListener('click', () => this.handleEmail());
        }

        // Bulk Import
        if (this.toggleBulkBtn) {
            this.toggleBulkBtn.addEventListener('click', () => {
                this.bulkSection.classList.toggle('hidden');
                if (!this.bulkSection.classList.contains('hidden')) {
                    this.bulkInput.focus();
                }
            });
        }
        if (this.importBtn) {
            this.importBtn.addEventListener('click', () => this.handleBulkImport());
        }

        // Settings
        if (this.toggleSettingsBtn) {
            this.toggleSettingsBtn.addEventListener('click', () => {
                this.settingsSection.classList.toggle('hidden');
                if (!this.settingsSection.classList.contains('hidden') && this.coreFamiliesInput) {
                    this.coreFamiliesInput.focus();
                }
            });
        }
        if (this.saveCoreFamiliesBtn) {
            this.saveCoreFamiliesBtn.addEventListener('click', () => this.handleSaveSettings());
        }

        if (this.clearListBtn) {
            this.clearListBtn.addEventListener('click', () => this.handleClearList());
        }

        if (this.printBtn) {
            this.printBtn.addEventListener('click', () => this.handlePrintTags());
        }

        if (this.partyBtn) {
            this.partyBtn.addEventListener('click', () => this.partyReveal.open(this.lastAssignments));
        }

        if (this.soundToggle && this.sound) {
            this.soundToggle.addEventListener('click', () => {
                this.sound.setEnabled(!this.sound.isEnabled());
                try {
                    localStorage.setItem(this.STORAGE_KEY_SOUND, this.sound.isEnabled() ? 'on' : 'off');
                } catch (_) { }
                this.renderSoundToggle();
                this.sound.play('tick');
            });
        }

        // Delete buttons (event delegation — no globals, no inline handlers)
        this.nameList.addEventListener('click', (e) => {
            const btn = e.target.closest('.delete-btn');
            if (btn && !btn.disabled) this.handleRemoveName(Number(btn.dataset.index));
        });

        // Show/hide Bad Santa applies (and saves) as soon as it's flipped
        if (this.showBadSantaToggle) {
            this.showBadSantaToggle.addEventListener('change', () => {
                const show = this.showBadSantaToggle.checked;
                this.applyBadSantaVisibility(show);
                try {
                    localStorage.setItem(this.STORAGE_KEY_SHOW_BAD_SANTA, show ? 'true' : 'false');
                } catch (_) { }
            });
        }

        // Theme applies as soon as it's picked
        if (this.themeSelect) {
            this.themeSelect.addEventListener('change', () => {
                this.applyTheme(this.themeSelect.value);
                try {
                    localStorage.setItem(this.STORAGE_KEY_THEME, this.themeSelect.value);
                } catch (_) { }
            });
        }
    }

    applyTheme(theme) {
        document.body.dataset.theme = theme === 'hanukkah' ? 'hanukkah' : 'christmas';
        if (this.music) this.music.setTheme(document.body.dataset.theme);
    }

    initSettings() {
        // Load Core Families
        if (this.coreFamiliesInput) {
            let stored = null;
            try {
                stored = localStorage.getItem(this.STORAGE_KEY_CORE_FAMILIES);
            } catch (_) {
                stored = null;
            }

            if (stored) {
                const parsed = stored.split(',').map(s => s.trim()).filter(Boolean);
                this.exchangeService.setCoreFamilies(parsed);
            }

            this.coreFamiliesInput.value = this.exchangeService.getCoreFamilies().join(', ');
        }

        // Load Theme
        if (this.themeSelect) {
            try {
                const savedTheme = localStorage.getItem(this.STORAGE_KEY_THEME);
                if (savedTheme) {
                    this.themeSelect.value = savedTheme;
                }
            } catch (_) { }
            this.applyTheme(this.themeSelect.value);
        }

        // Load budget + exchange date
        try {
            if (this.budgetInput) this.budgetInput.value = localStorage.getItem(this.STORAGE_KEY_BUDGET) || '';
            if (this.exchangeDateInput) this.exchangeDateInput.value = localStorage.getItem(this.STORAGE_KEY_DATE) || '';
        } catch (_) { }
        this.renderEventBanner();

        // Sound on/off
        if (this.sound) {
            let saved = null;
            try { saved = localStorage.getItem(this.STORAGE_KEY_SOUND); } catch (_) { }
            this.sound.setEnabled(saved !== 'off');
        }
        this.renderSoundToggle();

        // Bad Santa is opt-in: hidden unless turned on in Settings.
        let showBadSanta = false;
        try { showBadSanta = localStorage.getItem(this.STORAGE_KEY_SHOW_BAD_SANTA) === 'true'; } catch (_) { }
        if (this.showBadSantaToggle) this.showBadSantaToggle.checked = showBadSanta;
        this.applyBadSantaVisibility(showBadSanta);

        // Last year's matches
        if (this.avoidRepeatsToggle) {
            let saved = null;
            try { saved = localStorage.getItem(this.STORAGE_KEY_AVOID_REPEATS); } catch (_) { }
            this.avoidRepeatsToggle.checked = saved !== 'false';
        }
        if (this.lastYearInput) {
            this.lastYearInput.value = this.matchHistory.getYear(this.exchangeYear() - 1)
                .map(p => `${p.giver} -> ${p.receiver}`).join('\n');
        }
    }

    // CSS hides the mode switch and the game while body has .bad-santa-off,
    // whatever mode bad-santa.js restores.
    applyBadSantaVisibility(show) {
        document.body.classList.toggle('bad-santa-off', !show);
        if (!show && document.body.dataset.mode === 'bad-santa') {
            const back = document.querySelector('#modeSwitch [data-mode="secret-santa"]');
            if (back) back.click();
        }
    }

    // Background music: remembered on/off, follows the theme, and starts on the first
    // click or key press (browsers block autoplay). A first click on the music button
    // itself is a request to turn it off, so it doesn't start the music.
    initMusic() {
        if (!this.music) return;
        let saved = null;
        try { saved = localStorage.getItem(this.STORAGE_KEY_MUSIC); } catch (_) { }
        this.music.setEnabled(saved !== 'off');
        this.music.setTheme(document.body.dataset.theme === 'hanukkah' ? 'hanukkah' : 'christmas');
        this.renderMusicToggle();

        const events = ['pointerdown', 'keydown'];
        const firstInteraction = (e) => {
            if (this.musicToggle && e.target && typeof e.target.closest === 'function' && e.target.closest('#musicToggle')) return;
            events.forEach(name => document.removeEventListener(name, firstInteraction, true));
            this.music.start();
        };
        events.forEach(name => document.addEventListener(name, firstInteraction, true));

        if (this.musicToggle) {
            this.musicToggle.addEventListener('click', () => {
                const on = !this.music.isEnabled();
                this.music.setEnabled(on);
                if (on) this.music.start();
                try {
                    localStorage.setItem(this.STORAGE_KEY_MUSIC, on ? 'on' : 'off');
                } catch (_) { }
                this.renderMusicToggle();
            });
        }
    }

    renderMusicToggle() {
        if (!this.musicToggle || !this.music) return;
        const on = this.music.isEnabled();
        this.musicToggle.setAttribute('aria-pressed', String(on));
        this.musicToggle.setAttribute('aria-label', on ? 'Music on — click to turn it off' : 'Music off — click to turn it on');
        this.musicToggle.classList.toggle('muted', !on);
    }

    renderSoundToggle() {
        if (!this.soundToggle) return;
        const on = Boolean(this.sound && this.sound.isEnabled());
        this.soundToggle.setAttribute('aria-pressed', String(on));
        this.soundToggle.setAttribute('aria-label', on ? 'Sound on — click to mute' : 'Sound off — click to unmute');
        this.soundToggle.textContent = on ? '🔔' : '🔕';
        this.soundToggle.classList.toggle('muted', !on);
    }

    // The year this exchange belongs to: the exchange date's year, else this year.
    exchangeYear() {
        const date = EventDetails.parseDate(this.exchangeDateInput ? this.exchangeDateInput.value : '');
        return (date || this.now()).getFullYear();
    }

    eventDetails() {
        return {
            budget: this.budgetInput ? this.budgetInput.value : '',
            date: this.exchangeDateInput ? this.exchangeDateInput.value : '',
        };
    }

    renderEventBanner() {
        const info = EventDetails.describe(this.eventDetails(), this.now());
        document.body.dataset.snow = info.snow;
        if (!this.eventBanner) return;
        const pieces = [['🎁', info.budget], ['📅', info.date], ['⏳', info.countdown]].filter(([, text]) => text);
        this.eventBanner.replaceChildren(...pieces.map(([icon, text]) => {
            const chip = el('span', 'event-chip');
            chip.append(el('span', 'event-icon', icon), document.createTextNode(` ${text}`));
            return chip;
        }));
        this.eventBanner.classList.toggle('hidden', pieces.length === 0);
    }

    handleSaveSettings() {
        // Save Core Families
        if (this.coreFamiliesInput) {
            const raw = this.coreFamiliesInput.value || '';
            const parsed = raw.split(',').map(s => s.trim()).filter(Boolean);

            this.exchangeService.setCoreFamilies(parsed);
            this.coreFamiliesInput.value = this.exchangeService.getCoreFamilies().join(', ');

            try {
                if (this.coreFamiliesInput.value.trim()) {
                    localStorage.setItem(this.STORAGE_KEY_CORE_FAMILIES, this.coreFamiliesInput.value);
                } else {
                    localStorage.removeItem(this.STORAGE_KEY_CORE_FAMILIES);
                }
            } catch (_) { }
        }

        // Save last year's matches + the avoid-repeats choice
        if (this.lastYearInput) {
            this.matchHistory.saveYear(this.exchangeYear() - 1, parseMatchLines(this.lastYearInput.value));
        }
        if (this.avoidRepeatsToggle) {
            try {
                localStorage.setItem(this.STORAGE_KEY_AVOID_REPEATS, this.avoidRepeatsToggle.checked ? 'true' : 'false');
            } catch (_) { }
        }

        // Save budget + exchange date
        try {
            const { budget, date } = this.eventDetails();
            if (budget.trim()) localStorage.setItem(this.STORAGE_KEY_BUDGET, budget.trim());
            else localStorage.removeItem(this.STORAGE_KEY_BUDGET);
            if (date) localStorage.setItem(this.STORAGE_KEY_DATE, date);
            else localStorage.removeItem(this.STORAGE_KEY_DATE);
        } catch (_) { }
        this.renderEventBanner();

        // Save Theme
        if (this.themeSelect) {
            this.applyTheme(this.themeSelect.value);
            try {
                localStorage.setItem(this.STORAGE_KEY_THEME, this.themeSelect.value);
            } catch (_) { }
        }

        this.showError('Settings saved!');
        if (this.settingsSection) {
            this.settingsSection.classList.add('hidden');
        }
    }

    handleAddName() {
        const firstName = this.firstNameInput.value.trim();
        const lastName = this.lastNameInput.value.trim();
        const group = this.groupInput.value.trim();
        const wishlist = this.wishlistInput.value.trim();

        if (!firstName || !lastName) {
            this.showError('Please enter both First Name and Last Name.');
            return;
        }

        try {
            this.exchangeService.addPerson(firstName, lastName, group, wishlist);
            this.saveParticipants();
            this.firstNameInput.value = '';
            this.lastNameInput.value = '';
            this.groupInput.value = '';
            this.wishlistInput.value = '';
            this.errorMsg.classList.remove('visible');
            this.renderList();
            this.updateButtons();
            this.firstNameInput.focus();
        } catch (err) {
            this.showError(err.message);
        }
    }

    handleRemoveName(index) {
        this.exchangeService.removePerson(index);
        this.saveParticipants();
        this.renderList();
        this.updateButtons();
        if (!this.resultsSection.classList.contains('hidden')) {
            this.resetView();
        }
    }

    handleShuffle() {
        try {
            const avoiding = !this.avoidRepeatsToggle || this.avoidRepeatsToggle.checked
                ? this.matchHistory.getYear(this.exchangeYear() - 1)
                : [];
            this.exchangeService.setExcludedPairs(avoiding);

            // Pre-calculate to catch errors early
            const assignments = this.exchangeService.shuffleAndAssign();

            const theme = this.themeSelect ? this.themeSelect.value : 'christmas';

            // If successful, play animation then show results
            this.animationService.play(theme, () => {
                this.displayResults(assignments);
                this.matchHistory.saveYear(this.exchangeYear(), assignments.map(a => ({
                    giver: a.giver.getFullName(),
                    receiver: a.receiver.getFullName()
                })));
                if (this.repeatNote) this.repeatNote.classList.toggle('hidden', avoiding.length === 0);
                this.scrollToResults();
            });
        } catch (err) {
            this.showError(err.message);
        }
    }

    handleBulkImport() {
        const rawText = this.bulkInput.value.trim();
        if (!rawText) return;

        let addedCount = 0;
        for (const entry of parseBulkList(rawText)) {
            try {
                this.exchangeService.addPerson(entry.firstName, entry.lastName, entry.group, entry.wishlist);
                addedCount++;
            } catch (_) {
                // Duplicates are skipped silently in bulk import.
            }
        }

        if (addedCount > 0) {
            this.saveParticipants();
            this.bulkInput.value = '';
            this.bulkSection.classList.add('hidden');
            this.renderList();
            this.updateButtons();
            this.showError(`Successfully imported ${addedCount} names.`);
            setTimeout(() => this.errorMsg.classList.remove('visible'), 3000);
        } else {
            this.showError('No valid names found to import.');
        }
    }

    resultLines() {
        const lines = [];
        document.querySelectorAll('.result-card').forEach(card => {
            const giver = card.querySelector('.giver').textContent;
            const receiver = card.querySelector('.receiver').textContent;
            let line = `${giver} -> ${receiver}`;
            const noteEl = card.querySelector('.wishlist-note');
            if (noteEl) {
                line += ` (${noteEl.textContent.trim()})`;
            }
            lines.push(line);
        });
        return lines;
    }

    shareText() {
        const summary = EventDetails.summaryLine(this.eventDetails());
        const lines = this.resultLines();
        return (summary ? [summary, '', ...lines] : lines).join('\n');
    }

    handleCopy() {
        const results = this.resultLines();
        if (results.length === 0) return;
        const textToCopy = this.shareText();
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = this.copyBtn.textContent;
            this.copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                this.copyBtn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            this.showError('Failed to copy results.');
            console.error('Copy failed:', err);
        });
    }

    handleEmail() {
        const results = this.resultLines();

        if (results.length === 0) return;

        const subject = encodeURIComponent("Gift Exchange Assignments");
        const bodyContent = "Here are the Gift Exchange assignments:\n\n" + this.shareText() + "\n\nGenerated by the Gift Exchange Helper.";
        const body = encodeURIComponent(bodyContent);

        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }

    renderList() {
        const people = this.exchangeService.getPeople();
        this.nameList.replaceChildren(...people.map((person, index) => this.buildNameItem(person, index)));

        if (this.nameCount) this.nameCount.textContent = String(people.length);
        if (this.emptyState) this.emptyState.classList.toggle('hidden', people.length > 0);
        if (this.clearListBtn) this.clearListBtn.classList.toggle('hidden', people.length === 0);
    }

    buildNameItem(person, index) {
        const li = el('li', 'name-item');
        li.style.setProperty('--tag', UIManager.tagColor(person.familyGroup));

        const main = el('span', 'name-main');
        main.append(el('span', 'person-name', person.getFullName()), el('small', 'person-group', person.getDisplayGroup()));
        if (person.wishlist) {
            const wish = el('span', 'wish-icon', '🎁');
            wish.title = person.wishlist;
            main.append(wish);
        }

        const del = el('button', 'delete-btn');
        del.type = 'button';
        del.dataset.index = String(index);
        del.setAttribute('aria-label', `Remove ${person.getFullName()}`);
        del.append(UIManager.closeIcon());

        li.append(main, del);
        return li;
    }

    // Same family group -> same tag colour, so households are easy to spot.
    static tagColor(group) {
        let hash = 0;
        for (const ch of String(group).toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
        return `hsl(${hash % 360} 75% 58%)`;
    }

    static closeIcon() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', 'M18 6L6 18M6 6L18 18');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linecap', 'round');
        svg.append(path);
        return svg;
    }

    displayResults(assignments) {
        this.lastAssignments = assignments;
        this.resultsList.replaceChildren(...assignments.map((pair, i) => {
            const card = el('div', 'result-card');
            card.style.setProperty('--i', String(i));
            card.append(
                el('span', 'giver', pair.giver.getFullName()),
                el('span', 'arrow', '→'),
                el('span', 'receiver', pair.receiver.getFullName())
            );
            if (pair.receiver.wishlist) {
                const note = el('div', 'wishlist-note');
                note.append(el('span', 'label', '🎁 Wishlist:'), document.createTextNode(` ${pair.receiver.wishlist}`));
                card.append(note);
            }
            return card;
        }));

        this.resultsSection.classList.remove('hidden');
        this.shuffleBtn.classList.add('hidden');
        this.resetBtn.classList.remove('hidden');

        this.setInputsDisabled(true);
    }

    // One gift tag per match. The stub names the giver so the host can hand tags
    // out privately; the giver tears it off and the tag goes on the present.
    handlePrintTags() {
        if (!this.printSheet || this.lastAssignments.length === 0) return;
        const details = EventDetails.summaryLine(this.eventDetails());
        this.printSheet.replaceChildren(...this.lastAssignments.map(({ giver, receiver }) => {
            const tag = el('article', 'gift-tag');
            const body = el('div', 'tag-body');
            body.append(
                el('p', 'tag-to', `To: ${receiver.getFullName()}`),
                el('p', 'tag-from', 'From: Your Secret Santa 🎅')
            );
            if (receiver.wishlist) body.append(el('p', 'tag-wishlist', `Wishlist: ${receiver.wishlist}`));
            if (details) body.append(el('p', 'tag-details', details));
            tag.append(body, el('p', 'tag-stub', `✂ for ${giver.getFullName()}`));
            return tag;
        }));
        this.print();
    }

    // Land on the reveal right after the animation — no manual scrolling.
    scrollToResults() {
        if (typeof this.resultsSection.scrollIntoView !== 'function') return;
        const reduce = typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.resultsSection.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }

    resetView() {
        this.resultsSection.classList.add('hidden');
        this.shuffleBtn.classList.remove('hidden');
        this.resetBtn.classList.add('hidden');
        this.setInputsDisabled(false);
    }

    setInputsDisabled(disabled) {
        this.firstNameInput.disabled = disabled;
        this.lastNameInput.disabled = disabled;
        this.groupInput.disabled = disabled;
        this.addBtn.disabled = disabled;
        document.querySelectorAll('.delete-btn').forEach(btn => btn.disabled = disabled);
    }

    updateButtons() {
        const count = this.exchangeService.getPeople().length;
        this.shuffleBtn.disabled = count < 2;
    }

    showError(msg) {
        this.errorMsg.textContent = msg;
        this.errorMsg.classList.add('visible');
        setTimeout(() => {
            this.errorMsg.classList.remove('visible');
        }, 3000);
    }
}

// --- App Initialization ---

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const exchangeService = new GiftExchangeService();
        const sound = new SoundService();
        const animationService = new AnimationService(sound);
        new UIManager(exchangeService, animationService, undefined, undefined, sound, undefined, undefined, new MusicService());
    });
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Person,
        GiftExchangeService,
        PartyReveal,
        MusicService,
        GuidedTour,
        TOUR_STEPS,
        SoundService,
        EventDetails,
        MatchHistory,
        parseMatchLines,
        parseBulkList,
        ParticipantStore,
        UIManager,
        AnimationService
    };
}
