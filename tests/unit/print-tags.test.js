/**
 * @jest-environment jsdom
 */

const { GiftExchangeService, UIManager, AnimationService } = require('../../script.js');

function setupDOM() {
    document.body.innerHTML = `
        <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><p id="loadingText"></p></div>
        <input id="firstNameInput" /><input id="lastNameInput" /><input id="groupInput" /><input id="wishlistInput" />
        <button id="addBtn"></button><ul id="nameList"></ul>
        <button id="shuffleBtn"></button><button id="resetBtn" class="hidden"></button>
        <div id="resultsSection" class="hidden"></div><div id="resultsList"></div><p id="errorMsg"></p>
        <input id="budgetInput" value="50" /><input id="exchangeDateInput" value="2026-12-24" />
        <button id="printBtn"></button>
        <section id="printSheet" aria-hidden="true"></section>`;
}

const store = () => ({ load: () => [], save() { }, clear() { } });

describe('printable gift tags', () => {
    let service;
    let ui;

    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        setupDOM();
        service = new GiftExchangeService();
        ui = new UIManager(service, new AnimationService(), store());
        ui.print = jest.fn();
        // Startup loads saved settings (none here), so fill these in as a user would.
        document.getElementById('budgetInput').value = '50';
        document.getElementById('exchangeDateInput').value = '2026-12-24';
    });
    afterEach(() => jest.useRealTimers());

    test('builds one tag per match with To, From Secret Santa, details and a tear-off stub naming the giver', () => {
        service.addPerson('Ann', 'Frost', 'F1', 'Books');
        service.addPerson('Ben', 'Pike');
        const assignments = service.shuffleAndAssign();
        ui.displayResults(assignments);

        document.getElementById('printBtn').click();

        const tags = document.querySelectorAll('#printSheet .gift-tag');
        expect(tags).toHaveLength(2);
        assignments.forEach(({ giver, receiver }, i) => {
            const tag = tags[i];
            expect(tag.querySelector('.tag-to').textContent).toBe(`To: ${receiver.getFullName()}`);
            expect(tag.querySelector('.tag-from').textContent).toBe('From: Your Secret Santa 🎅');
            expect(tag.querySelector('.tag-stub').textContent).toBe(`✂ for ${giver.getFullName()}`);
            expect(tag.querySelector('.tag-details').textContent).toBe('Budget: $50 · Exchange: Thu, Dec 24');
        });
        const annTag = [...tags].find(t => t.querySelector('.tag-to').textContent === 'To: Ann Frost');
        expect(annTag.querySelector('.tag-wishlist').textContent).toBe('Wishlist: Books');
        expect(ui.print).toHaveBeenCalledTimes(1);
    });

    test('names print as text, never as HTML', () => {
        service.addPerson('<img src=x onerror=alert(1)>', 'Evil');
        service.addPerson('Ben', 'Pike');
        ui.displayResults(service.shuffleAndAssign());
        document.getElementById('printBtn').click();
        expect(document.querySelector('#printSheet img')).toBeNull();
        expect(document.getElementById('printSheet').textContent).toContain('<img src=x');
    });

    test('nothing to print before a shuffle', () => {
        document.getElementById('printBtn').click();
        expect(ui.print).not.toHaveBeenCalled();
        expect(document.querySelectorAll('#printSheet .gift-tag')).toHaveLength(0);
    });

    test('a reshuffle replaces the old tags', () => {
        service.addPerson('Ann', 'A');
        service.addPerson('Ben', 'B');
        ui.displayResults(service.shuffleAndAssign());
        document.getElementById('printBtn').click();
        ui.displayResults(service.shuffleAndAssign());
        document.getElementById('printBtn').click();
        expect(document.querySelectorAll('#printSheet .gift-tag')).toHaveLength(2);
    });
});
