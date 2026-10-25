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

    play(name) {
        if (!this.enabled) return;
        const effect = SoundService.EFFECTS[name];
        if (!effect) return;
        const ctx = this.context();
        if (!ctx) return;
        try {
            effect(this, ctx.currentTime);
        } catch (_) { }
    }

    // A single enveloped oscillator note.
    tone(t, { freq, endFreq, dur = 0.3, type = 'sine', gain = 0.15, attack = 0.005 }) {
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const amp = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.linearRampToValueAtTime(gain, t + attack);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(amp).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.05);
    }

    // Filtered white noise: shakers, sizzle, whoosh, drums.
    noise(t, { dur = 0.2, gain = 0.15, type = 'bandpass', freq = 4000, endFreq, q = 1, attack = 0.005 }) {
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
        src.connect(filter).connect(amp).connect(ctx.destination);
        src.start(t);
        src.stop(t + dur + 0.05);
    }

    static get EFFECTS() {
        return {
            // Sleigh bells: jingly shaker hits with bright bell tones.
            jingle: (s, t) => {
                const bells = [2093, 2637, 3136, 2349];
                for (let i = 0; i < 10; i++) {
                    const at = t + i * 0.11 + (i % 2) * 0.03;
                    s.noise(at, { dur: 0.09, gain: 0.07, type: 'highpass', freq: 7000 });
                    s.tone(at, { freq: bells[i % bells.length], dur: 0.18, type: 'triangle', gain: 0.045 });
                }
            },
            // Spinning dreidel: a rising and falling breath of air.
            whoosh: (s, t) => {
                s.noise(t, { dur: 0.7, gain: 0.12, freq: 350, endFreq: 2200, q: 2, attack: 0.2 });
            },
            // Bell chime: a few partials with a long ring.
            chime: (s, t) => {
                [[880, 0.12], [1318.5, 0.08], [1760, 0.06], [2637, 0.03]].forEach(([f, g], i) =>
                    s.tone(t + i * 0.015, { freq: f, dur: 1.4, gain: g }));
            },
            // Latkes in the pan.
            sizzle: (s, t) => {
                s.noise(t, { dur: 0.9, gain: 0.07, type: 'highpass', freq: 3000, attack: 0.08 });
                for (let i = 0; i < 6; i++) s.noise(t + 0.1 + i * 0.12, { dur: 0.03, gain: 0.05, type: 'highpass', freq: 5000 });
            },
            // Gelt clinking.
            coins: (s, t) => {
                [0, 0.13, 0.27].forEach((d, i) => {
                    s.tone(t + d, { freq: 2400 + i * 300, dur: 0.15, type: 'triangle', gain: 0.07 });
                    s.tone(t + d, { freq: 3600 + i * 300, dur: 0.1, type: 'sine', gain: 0.04 });
                });
            },
            // Little fanfare for the reveal.
            tada: (s, t) => {
                s.tone(t, { freq: 523.25, dur: 0.12, type: 'triangle', gain: 0.1 });
                [523.25, 659.25, 783.99, 1046.5].forEach(f =>
                    s.tone(t + 0.13, { freq: f, dur: 1.0, type: 'triangle', gain: 0.07, attack: 0.02 }));
                s.noise(t + 0.13, { dur: 0.4, gain: 0.05, type: 'highpass', freq: 6000 });
            },
            tick: (s, t) => {
                s.tone(t, { freq: 1250, dur: 0.06, gain: 0.05 });
            },
            // Snare roll that swells (used before each party-mode reveal).
            drumroll: (s, t) => {
                for (let i = 0; i < 26; i++) {
                    s.noise(t + i * 0.045, { dur: 0.05, gain: 0.03 + i * 0.004, freq: 1800, q: 0.7 });
                }
            },
        };
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

// Create an element with a class and (text-only) content.
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

class UIManager {
    constructor(exchangeService, animationService, participantStore, matchHistory, soundService, partyReveal) {
        this.exchangeService = exchangeService;
        this.sound = soundService || null;
        this.partyReveal = partyReveal || new PartyReveal(this.sound);
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
        this.lastYearInput = document.getElementById('lastYearInput');
        this.repeatNote = document.getElementById('repeatNote');
        this.soundToggle = document.getElementById('soundToggle');
        this.partyBtn = document.getElementById('partyBtn');

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
        this.restoreParticipants();
        this.updateButtons();
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
        new UIManager(exchangeService, animationService, undefined, undefined, sound);
    });
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Person,
        GiftExchangeService,
        PartyReveal,
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
