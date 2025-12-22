/**
 * @jest-environment jsdom
 */

const { GiftExchangeService, UIManager, AnimationService, Person } = require('../../script.js');

function setupDOM() {
    document.body.innerHTML = `
        <div id="loadingOverlay" class="overlay hidden">
            <div id="giftIcon" class=""></div>
            <div id="hanukkahContainer" class="hidden">
                 <div id="hanukkahIcon"></div>
                 <div id="menorahIcon" class="hidden"></div>
                 <div class="menorah-flames hidden"></div>
                 <div id="latkeIcon" style="opacity: 0"></div>
                 <div id="geltIcon" style="opacity: 0"></div>
            </div>
            <p id="loadingText"></p>
        </div>

        <input id="firstNameInput" />
        <input id="lastNameInput" />
        <input id="groupInput" />
        <button id="addBtn"></button>

        <ul id="nameList"></ul>
        <button id="shuffleBtn"></button>
        <button id="resetBtn" class="hidden"></button>

        <div id="resultsSection" class="hidden"></div>
        <div id="resultsList"></div>
        <p id="errorMsg" class="error-msg"></p>

        <button id="toggleBulkBtn"></button>
        <div id="bulkSection" class="hidden"></div>
        <textarea id="bulkInput"></textarea>
        <button id="importBtn"></button>

        <button id="reshuffleBtn"></button>
        <button id="copyBtn">Copy Results</button>

        <button id="toggleSettingsBtn"></button>
        <div id="settingsSection" class="hidden"></div>
        <input id="coreFamiliesInput" />
        <button id="saveCoreFamiliesBtn"></button>
        
        <select id="themeSelect">
            <option value="christmas">Christmas</option>
            <option value="hanukkah">Hanukkah</option>
        </select>
    `;
}

describe('UIManager + AnimationService (jsdom)', () => {
    const flushPromises = async () => {
        await Promise.resolve();
        await Promise.resolve();
    };

    beforeEach(() => {
        setupDOM();
        jest.useFakeTimers();

        // Clipboard mock
        global.navigator.clipboard = {
            writeText: jest.fn(() => Promise.resolve()),
        };

        // Clean storage
        localStorage.clear();
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('Person model basics', () => {
        const p1 = new Person('  John ', ' Doe  ', '  Family X ');
        expect(p1.firstName).toBe('John');
        expect(p1.lastName).toBe('Doe');
        expect(p1.familyGroup).toBe('Family X');
        expect(p1.getFullName()).toBe('John Doe');
        expect(p1.getDisplayGroup()).toBe('[Family X]');

        const p2 = new Person('Jane', 'Smith');
        expect(p2.familyGroup).toBe('Smith');
    });

    test('Settings: loads core families from localStorage and saves updates', () => {
        localStorage.setItem('giftExchange.coreFamilies', 'Alpha, Beta');

        const service = new GiftExchangeService();
        const animation = new AnimationService();
        const ui = new UIManager(service, animation);

        expect(service.getCoreFamilies()).toEqual(['Alpha', 'Beta']);
        expect(ui.coreFamiliesInput.value).toBe('Alpha, Beta');

        ui.toggleSettingsBtn.click();
        expect(ui.settingsSection.classList.contains('hidden')).toBe(false);

        ui.coreFamiliesInput.value = 'Doe,  Roe  ,Doe';
        ui.saveCoreFamiliesBtn.click();

        expect(service.getCoreFamilies()).toEqual(['Doe', 'Roe']);
        expect(localStorage.getItem('giftExchange.coreFamilies')).toBe('Doe, Roe');
        expect(ui.settingsSection.classList.contains('hidden')).toBe(true);
    });

    test('Add name: validates, adds, renders list, and prevents duplicates', () => {
        const service = new GiftExchangeService();
        const animation = new AnimationService();
        new UIManager(service, animation);

        // Missing fields
        document.getElementById('firstNameInput').value = '';
        document.getElementById('lastNameInput').value = '';
        document.getElementById('addBtn').click();
        expect(document.getElementById('errorMsg').textContent).toMatch(/enter both/i);

        // Add valid
        document.getElementById('firstNameInput').value = 'John';
        document.getElementById('lastNameInput').value = 'Doe';
        document.getElementById('groupInput').value = 'Group1';
        document.getElementById('addBtn').click();

        const listItems = document.querySelectorAll('#nameList li');
        expect(listItems.length).toBe(1);
        expect(listItems[0].textContent).toContain('John Doe');
        expect(listItems[0].textContent).toContain('[Group1]');

        // Duplicate
        document.getElementById('firstNameInput').value = 'John';
        document.getElementById('lastNameInput').value = 'Doe';
        document.getElementById('addBtn').click();
        expect(document.getElementById('errorMsg').textContent).toMatch(/already on the list/i);
    });

    test('Bulk import: imports valid names, ignores duplicates, and handles empty input', () => {
        const service = new GiftExchangeService();
        const animation = new AnimationService();
        new UIManager(service, animation);

        document.getElementById('toggleBulkBtn').click();
        expect(document.getElementById('bulkSection').classList.contains('hidden')).toBe(false);

        // Empty -> no-op (no error message change requirement, but should not crash)
        document.getElementById('bulkInput').value = '';
        document.getElementById('importBtn').click();

        // Valid import
        document.getElementById('bulkInput').value = 'Alice A [GroupA], Bob B [GroupB], Alice A [GroupA]';
        document.getElementById('importBtn').click();

        const listItems = document.querySelectorAll('#nameList li');
        expect(listItems.length).toBe(2);

        // Success message then fades
        expect(document.getElementById('errorMsg').textContent).toMatch(/Successfully imported/i);
        jest.advanceTimersByTime(3000);
        expect(document.getElementById('errorMsg').classList.contains('visible')).toBe(false);

        // Invalid entries
        document.getElementById('toggleBulkBtn').click();
        document.getElementById('bulkInput').value = 'SingleNameOnly';
        document.getElementById('importBtn').click();
        expect(document.getElementById('errorMsg').textContent).toMatch(/No valid names found/i);
    });

    test('Shuffle: shows results after animation and reset re-enables inputs', () => {
        const service = new GiftExchangeService();
        const animation = new AnimationService();
        new UIManager(service, animation);

        // Add two people
        document.getElementById('firstNameInput').value = 'Alice';
        document.getElementById('lastNameInput').value = 'A';
        document.getElementById('groupInput').value = 'GroupA';
        document.getElementById('addBtn').click();

        document.getElementById('firstNameInput').value = 'Bob';
        document.getElementById('lastNameInput').value = 'B';
        document.getElementById('groupInput').value = 'GroupB';
        document.getElementById('addBtn').click();

        // Shuffle
        document.getElementById('shuffleBtn').click();

        // Animation steps: 4 messages * 800ms + final 500ms
        jest.advanceTimersByTime(800 * 4 + 500);

        expect(document.getElementById('resultsSection').classList.contains('hidden')).toBe(false);
        expect(document.querySelectorAll('.result-card').length).toBe(2);

        // Reset
        document.getElementById('resetBtn').click();
        expect(document.getElementById('resultsSection').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('firstNameInput').disabled).toBe(false);
    });

    test('Remove name resets results view when visible', () => {
        const service = new GiftExchangeService();
        const animation = new AnimationService();
        new UIManager(service, animation);

        document.getElementById('firstNameInput').value = 'Alice';
        document.getElementById('lastNameInput').value = 'A';
        document.getElementById('groupInput').value = 'GroupA';
        document.getElementById('addBtn').click();

        document.getElementById('firstNameInput').value = 'Bob';
        document.getElementById('lastNameInput').value = 'B';
        document.getElementById('groupInput').value = 'GroupB';
        document.getElementById('addBtn').click();

        document.getElementById('shuffleBtn').click();
        jest.advanceTimersByTime(800 * 4 + 500);
        expect(document.getElementById('resultsSection').classList.contains('hidden')).toBe(false);

        // remove via global function
        expect(typeof window.removeName).toBe('function');
        window.removeName(0);

        expect(document.getElementById('resultsSection').classList.contains('hidden')).toBe(true);
    });

    test('Copy: writes to clipboard and handles failure', async () => {
        const service = new GiftExchangeService();
        const animation = new AnimationService();
        const ui = new UIManager(service, animation);

        // Create result cards to copy
        document.getElementById('resultsList').innerHTML = `
            <div class="result-card"><span class="giver">A A</span><span class="receiver">B B</span></div>
            <div class="result-card"><span class="giver">C C</span><span class="receiver">D D</span></div>
        `;

        ui.handleCopy();
        await flushPromises();
        expect(navigator.clipboard.writeText).toHaveBeenCalled();

        // Failure branch
        navigator.clipboard.writeText.mockRejectedValueOnce(new Error('nope'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        ui.handleCopy();
        await flushPromises();
        expect(document.getElementById('errorMsg').textContent).toMatch(/Failed to copy/i);
        expect(consoleSpy).toHaveBeenCalled();
    });

    test('AnimationService: play cycles messages and calls callback', () => {
        const animation = new AnimationService();
        const callback = jest.fn();

        // Christmas Theme
        animation.play('christmas', callback);

        // overlay shown immediately
        expect(document.getElementById('loadingOverlay').classList.contains('hidden')).toBe(false);

        // Progress through the 4 messages and completion
        jest.advanceTimersByTime(800 * 4 + 500);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(document.getElementById('loadingOverlay').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('giftIcon').classList.contains('pop-out')).toBe(true);
    });

    test('AnimationService: play hanukkah theme sequence', () => {
        const animation = new AnimationService();
        const callback = jest.fn();

        animation.play('hanukkah', callback);

        // Initial state: Dreidel spinning, others hidden
        expect(document.getElementById('hanukkahContainer').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('hanukkahIcon').classList.contains('spin')).toBe(true);
        expect(document.getElementById('menorahIcon').classList.contains('hidden')).toBe(true);

        // Advance 1 step (800ms): Lighting Menorah
        jest.advanceTimersByTime(800);
        expect(document.getElementById('menorahIcon').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('hanukkahIcon').classList.contains('hidden')).toBe(true);

        // Advance 1 step (800ms): Latkes
        jest.advanceTimersByTime(800);
        const latkeIcon = document.getElementById('latkeIcon');
        expect(latkeIcon.style.opacity).toBe('1');
        expect(document.getElementById('menorahIcon').classList.contains('hidden')).toBe(true);

        // Advance to finish (Remaining steps + timeout)
        jest.advanceTimersByTime(800 * 2 + 500);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(document.getElementById('hanukkahContainer').classList.contains('pop-out')).toBe(true);
    });
});
