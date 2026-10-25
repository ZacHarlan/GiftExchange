/**
 * Gift Exchange Application
 * Refactored to follow SOLID principles
 */

// --- Domain Models ---

class Person {
    constructor(firstName, lastName, familyGroup, wishlist) {
        this.firstName = firstName.trim();
        this.lastName = lastName.trim();
        // Default familyGroup to lastName if not provided
        this.familyGroup = (familyGroup && familyGroup.trim()) ? familyGroup.trim() : this.lastName;
        this.wishlist = wishlist ? wishlist.trim() : '';
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
        this.setCoreFamilies(coreFamilies ?? []);
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
        return this.names.some(entry =>
            entry.firstName.toLowerCase() === first.trim().toLowerCase() &&
            entry.lastName.toLowerCase() === last.trim().toLowerCase()
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

class AnimationService {
    constructor() {
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

    play(theme, callback) {
        const isHanukkah = theme === 'hanukkah';
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
                } else if (step === messages.length - 1) {
                    this.openGift();
                }
                return;
            }

            clearInterval(interval);
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

// Create an element with a class and (text-only) content.
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

class UIManager {
    constructor(exchangeService, animationService, participantStore) {
        this.exchangeService = exchangeService;
        this.animationService = animationService;
        this.participantStore = participantStore || new ParticipantStore(UIManager.browserStorage());
        this.confirm = (message) => window.confirm(message);

        this.STORAGE_KEY_CORE_FAMILIES = 'giftExchange.coreFamilies';
        this.STORAGE_KEY_THEME = 'giftExchange.theme';

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
            // Pre-calculate to catch errors early
            const assignments = this.exchangeService.shuffleAndAssign();

            const theme = this.themeSelect ? this.themeSelect.value : 'christmas';

            // If successful, play animation then show results
            this.animationService.play(theme, () => {
                this.displayResults(assignments);
            });
        } catch (err) {
            this.showError(err.message);
        }
    }

    handleBulkImport() {
        const rawText = this.bulkInput.value.trim();
        if (!rawText) return;

        const entries = rawText.split(',');
        let addedCount = 0;

        entries.forEach(entry => {
            let text = entry.trim();
            if (!text) return;

            let group = '';
            const groupMatch = text.match(/\[(.*?)\]/);
            if (groupMatch) {
                group = groupMatch[1].trim();
                text = text.replace(groupMatch[0], '').trim();
            }

            let wishlist = '';
            const wishlistMatch = text.match(/\{(.*?)\}/);
            if (wishlistMatch) {
                wishlist = wishlistMatch[1].trim();
                text = text.replace(wishlistMatch[0], '').trim();
            }

            const parts = text.split(/\s+/);
            if (parts.length >= 2) {
                const lastName = parts.pop();
                const firstName = parts.join(' ');

                try {
                    this.exchangeService.addPerson(firstName, lastName, group, wishlist);
                    addedCount++;
                } catch (e) {
                    // Ignore duplicates in bulk or handle silently
                }
            }
        });

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

    handleCopy() {
        const results = [];
        document.querySelectorAll('.result-card').forEach(card => {
            const giver = card.querySelector('.giver').textContent;
            const receiver = card.querySelector('.receiver').textContent;
            let line = `${giver} -> ${receiver}`;
            const noteEl = card.querySelector('.wishlist-note');
            if (noteEl) {
                line += ` (${noteEl.textContent.trim()})`;
            }
            results.push(line);
        });

        const textToCopy = results.join('\n');
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
        const results = [];
        document.querySelectorAll('.result-card').forEach(card => {
            const giver = card.querySelector('.giver').textContent;
            const receiver = card.querySelector('.receiver').textContent;
            let line = `${giver} -> ${receiver}`;
            const noteEl = card.querySelector('.wishlist-note');
            if (noteEl) {
                line += ` (${noteEl.textContent.trim()})`;
            }
            results.push(line);
        });

        if (results.length === 0) return;

        const subject = encodeURIComponent("Gift Exchange Assignments");
        const bodyContent = "Here are the Gift Exchange assignments:\n\n" + results.join('\n') + "\n\nGenerated by the Gift Exchange Helper.";
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
        const animationService = new AnimationService();
        new UIManager(exchangeService, animationService);
    });
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Person,
        GiftExchangeService,
        ParticipantStore,
        UIManager,
        AnimationService
    };
}
