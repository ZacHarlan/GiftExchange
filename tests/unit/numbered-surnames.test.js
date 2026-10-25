/**
 * @jest-environment jsdom
 */

// Regression: "Zac Harlan 1" used to import as first name "Zac Harlan", last name "1",
// family "1". A trailing number marks which family a shared surname belongs to.

const { Person, GiftExchangeService, UIManager, AnimationService } = require('../../script.js');

const memoryStore = () => ({ load: () => [], save() { }, clear() { } });

function setupDOM() {
    document.body.innerHTML = `
        <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><p id="loadingText"></p></div>
        <input id="firstNameInput" /><input id="lastNameInput" /><input id="groupInput" /><input id="wishlistInput" />
        <button id="addBtn"></button><ul id="nameList"></ul>
        <button id="shuffleBtn"></button><button id="resetBtn" class="hidden"></button>
        <div id="resultsSection" class="hidden"></div><div id="resultsList"></div><p id="errorMsg"></p>
        <button id="toggleBulkBtn"></button><div id="bulkSection" class="hidden"></div>
        <textarea id="bulkInput"></textarea><button id="importBtn"></button>`;
}

describe('numbered surnames mark separate families', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        setupDOM();
    });
    afterEach(() => jest.useRealTimers());

    test('Person: "Harlan 1" -> last name Harlan, family "Harlan 1"', () => {
        const p = new Person('Zac', 'Harlan 1');
        expect(p.lastName).toBe('Harlan');
        expect(p.familyGroup).toBe('Harlan 1');
        expect(p.getFullName()).toBe('Zac Harlan');
    });

    test('Person: an explicit family group still wins', () => {
        const p = new Person('Zac', 'Harlan 1', 'Cousins');
        expect(p.lastName).toBe('Harlan');
        expect(p.familyGroup).toBe('Cousins');
    });

    test('Person: names without a numbered suffix are unchanged', () => {
        expect(new Person('Zac', 'Harlan1').lastName).toBe('Harlan1');
        expect(new Person('Al', '2').lastName).toBe('2');
        expect(new Person('Ann', 'Van Dyke').lastName).toBe('Van Dyke');
    });

    test('bulk import keeps the number with the surname and splits the families', () => {
        const service = new GiftExchangeService();
        const ui = new UIManager(service, new AnimationService(), memoryStore());
        document.getElementById('bulkInput').value = 'Zac Harlan 1, Mindy Harlan 1, Mary Ann Harlan 2 {Tea}, Kim Harlan 2';
        ui.handleBulkImport();

        expect(service.getPeople().map(p => [p.firstName, p.lastName, p.familyGroup, p.wishlist])).toEqual([
            ['Zac', 'Harlan', 'Harlan 1', ''],
            ['Mindy', 'Harlan', 'Harlan 1', ''],
            ['Mary Ann', 'Harlan', 'Harlan 2', 'Tea'],
            ['Kim', 'Harlan', 'Harlan 2', ''],
        ]);
    });

    test('the two Harlan families are matched across, never within', () => {
        const service = new GiftExchangeService();
        service.addPerson('Zac', 'Harlan 1');
        service.addPerson('Mindy', 'Harlan 1');
        service.addPerson('Pat', 'Harlan 2');
        service.addPerson('Kim', 'Harlan 2');
        for (let i = 0; i < 50; i++) {
            for (const { giver, receiver } of service.shuffleAndAssign()) {
                expect(giver.familyGroup).not.toBe(receiver.familyGroup);
            }
        }
    });

    test('core family "Harlan" still matches people entered as "Harlan 1" / "Harlan 2"', () => {
        const service = new GiftExchangeService(['Harlan']);
        service.addPerson('Zac', 'Harlan 1');
        expect(service.isCoreLastName(service.getPeople()[0].lastName)).toBe(true);
    });

    test('duplicate check sees "Zac Harlan 1" as already on the list', () => {
        const service = new GiftExchangeService();
        service.addPerson('Zac', 'Harlan 1');
        expect(() => service.addPerson('Zac', 'Harlan 1')).toThrow(/already on the list/);
    });
});
