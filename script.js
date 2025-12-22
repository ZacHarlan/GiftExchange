/**
 * Gift Exchange Application
 * Refactored to follow SOLID principles
 */

// --- Domain Models ---

class Person {
    constructor(firstName, lastName, familyGroup) {
        this.firstName = firstName.trim();
        this.lastName = lastName.trim();
        // Default familyGroup to lastName if not provided
        this.familyGroup = (familyGroup && familyGroup.trim()) ? familyGroup.trim() : this.lastName;
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

    addPerson(firstName, lastName, familyGroup) {
        if (this.isNameTaken(firstName, lastName)) {
            throw new Error(`"${firstName} ${lastName}" is already on the list.`);
        }
        const person = new Person(firstName, lastName, familyGroup);
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
            giver: giver.getFullName(),
            receiver: receivers[i].getFullName()
        }));
    }
}

class AnimationService {
    constructor() {
        this.overlay = document.getElementById('loadingOverlay');
        this.loadingText = document.getElementById('loadingText');
        this.giftIcon = document.getElementById('giftIcon');
        this.hanukkahContainer = document.getElementById('hanukkahContainer');
        this.hanukkahIcon = document.getElementById('hanukkahIcon');
        this.menorahIcon = document.getElementById('menorahIcon');
        this.menorahFlames = document.querySelector('.menorah-flames');
    }

    play(theme, callback) {
        this.overlay.classList.remove('hidden');
        this.overlay.style.display = 'flex'; // Force flex to ensure visibility and centering

        // Reset animations
        this.giftIcon.classList.remove('pop-out');
        if (this.hanukkahContainer) {
            this.hanukkahContainer.classList.remove('pop-out');
            if (this.hanukkahIcon) {
                this.hanukkahIcon.classList.remove('spin');
                this.hanukkahIcon.classList.remove('hidden');
            }
            if (this.menorahIcon) this.menorahIcon.classList.add('hidden'); // Start hidden
            if (this.menorahFlames) this.menorahFlames.classList.add('hidden'); // Flames hidden
        }

        // Toggle Icons based on theme
        if (theme === 'hanukkah') {
            this.giftIcon.classList.add('hidden');
            if (this.hanukkahContainer) {
                this.hanukkahContainer.classList.remove('hidden');
                // Phase 1: Only Dreidel spinning
                if (this.hanukkahIcon) this.hanukkahIcon.classList.add('spin');
            }
        } else {
            if (this.hanukkahContainer) this.hanukkahContainer.classList.add('hidden');
            this.giftIcon.classList.remove('hidden');
        }

        // Set Messages
        let messages = [];
        if (theme === 'hanukkah') {
            messages = [
                "Spinning the Dreidel...",
                "Lighting the Menorah...",
                "Frying Latkes...",
                "Counting Gelt..."
            ];
        } else {
            messages = [
                "Checking Naughty List...",
                "Checking Nice List...",
                "Wrapping Gifts...",
                "Adding Bows..."
            ];
        }

        let step = 0;
        this.loadingText.textContent = messages[0];

        const interval = setInterval(() => {
            step++;
            if (step < messages.length) {
                this.loadingText.textContent = messages[step];

                // --- Hanukkah Logic Updates based on Step ---
                if (theme === 'hanukkah') {
                    // Step 1: Lighting Menorah
                    if (step === 1) {
                        if (this.hanukkahIcon) {
                            this.hanukkahIcon.classList.add('hidden');
                            this.hanukkahIcon.classList.remove('spin');
                        }
                        if (this.menorahIcon) this.menorahIcon.classList.remove('hidden');
                        if (this.menorahFlames) this.menorahFlames.classList.remove('hidden');
                    }
                    // Step 2: Frying Latkes
                    if (step === 2) {
                        if (this.menorahIcon) this.menorahIcon.classList.add('hidden');
                        const latkeIcon = document.getElementById('latkeIcon');
                        if (latkeIcon) {
                            latkeIcon.style.opacity = '1';
                            latkeIcon.classList.add('sizzle'); // Add sizzle class to svg or group
                        }
                    }
                    // Step 3: Counting Gelt
                    if (step === 3) {
                        const latkeIcon = document.getElementById('latkeIcon');
                        if (latkeIcon) {
                            latkeIcon.style.opacity = '0';
                            latkeIcon.classList.remove('sizzle');
                        }
                        const geltIcon = document.getElementById('geltIcon');
                        if (geltIcon) geltIcon.style.opacity = '1';
                    }
                }

            } else {
                clearInterval(interval);

                // Final Animation
                if (theme === 'hanukkah') {
                    if (this.hanukkahContainer) {
                        // Reset last icon
                        const geltIcon = document.getElementById('geltIcon');
                        if (geltIcon) geltIcon.style.opacity = '0'; // Hide Gelt

                        // Bring back Dreidel for final pop? Or just pop container?
                        // Let's show the Gelt popping out actually, or bring back all?
                        // Actually, let's make the Gelt stick for the pop-out since it's the "result"
                        if (geltIcon) {
                            geltIcon.style.opacity = '1';
                        }

                        this.hanukkahContainer.classList.add('pop-out');
                    }
                } else {
                    this.giftIcon.classList.add('pop-out');
                }

                setTimeout(() => {
                    this.overlay.classList.add('hidden');
                    this.overlay.style.display = ''; // Clear inline style

                    // Reset Hanukkah state for next time
                    if (theme === 'hanukkah') {
                        this.resetHanukkahState();
                    }

                    if (callback) callback();
                }, 500);
            }
        }, 800);
    }

    resetHanukkahState() {
        const latkeIcon = document.getElementById('latkeIcon');
        const geltIcon = document.getElementById('geltIcon');

        if (latkeIcon) {
            latkeIcon.style.opacity = '0';
            latkeIcon.classList.remove('sizzle');
        }
        if (geltIcon) {
            geltIcon.style.opacity = '0';
        }
        if (this.menorahIcon) this.menorahIcon.classList.add('hidden');
        if (this.hanukkahIcon) {
            this.hanukkahIcon.classList.remove('hidden'); // Reset to start
        }
    }
}

class UIManager {
    constructor(exchangeService, animationService) {
        this.exchangeService = exchangeService;
        this.animationService = animationService;

        this.STORAGE_KEY_CORE_FAMILIES = 'giftExchange.coreFamilies';

        // Elements
        this.firstNameInput = document.getElementById('firstNameInput');
        this.lastNameInput = document.getElementById('lastNameInput');
        this.groupInput = document.getElementById('groupInput');
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

        this.initSettings();

        // Extra Buttons
        this.reshuffleBtn = document.getElementById('reshuffleBtn');
        this.emailBtn = document.getElementById('emailBtn');
        this.copyBtn = document.getElementById('copyBtn');

        this.initEventListeners();
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

        // Global remove function for inline onclick
        window.removeName = (index) => this.handleRemoveName(index);
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
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            try {
                const savedTheme = localStorage.getItem('giftExchange.theme');
                if (savedTheme) {
                    themeSelect.value = savedTheme;
                }
            } catch (_) { }
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
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            try {
                localStorage.setItem('giftExchange.theme', themeSelect.value);
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

        if (!firstName || !lastName) {
            this.showError('Please enter both First Name and Last Name.');
            return;
        }

        try {
            this.exchangeService.addPerson(firstName, lastName, group);
            this.firstNameInput.value = '';
            this.lastNameInput.value = '';
            this.groupInput.value = '';
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

            // Get selected theme
            const themeSelect = document.getElementById('themeSelect');
            const theme = themeSelect ? themeSelect.value : 'christmas';

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

            const parts = text.split(/\s+/);
            if (parts.length >= 2) {
                const lastName = parts.pop();
                const firstName = parts.join(' ');

                try {
                    this.exchangeService.addPerson(firstName, lastName, group);
                    addedCount++;
                } catch (e) {
                    // Ignore duplicates in bulk or handle silently
                }
            }
        });

        if (addedCount > 0) {
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
            results.push(`${giver} -> ${receiver}`);
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
            results.push(`${giver} -> ${receiver}`);
        });

        if (results.length === 0) return;

        const subject = encodeURIComponent("Gift Exchange Assignments");
        const bodyContent = "Here are the Gift Exchange assignments:\n\n" + results.join('\n') + "\n\nGenerated by the Gift Exchange Helper.";
        const body = encodeURIComponent(bodyContent);

        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }

    renderList() {
        this.nameList.innerHTML = '';
        const people = this.exchangeService.getPeople();

        people.forEach((person, index) => {
            const li = document.createElement('li');
            li.className = 'name-item';

            const groupDisplay = ` <small style="color: var(--gold); margin-left: 0.5rem;">${person.getDisplayGroup()}</small>`;

            li.innerHTML = `
                <span>${person.getFullName()}${groupDisplay}</span>
                <button class="delete-btn" onclick="removeName(${index})" aria-label="Remove ${person.getFullName()}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            `;
            this.nameList.appendChild(li);
        });
    }

    displayResults(assignments) {
        this.resultsList.innerHTML = '';
        assignments.forEach(pair => {
            const div = document.createElement('div');
            div.className = 'result-card';
            div.innerHTML = `
                <span class="giver">${pair.giver}</span>
                <span class="arrow">→</span>
                <span class="receiver">${pair.receiver}</span>
            `;
            this.resultsList.appendChild(div);
        });

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
        UIManager,
        AnimationService
    };
}
