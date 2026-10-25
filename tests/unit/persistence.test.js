/**
 * @jest-environment jsdom
 */

const { GiftExchangeService, ParticipantStore, UIManager, AnimationService } = require('../../script.js');

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: k => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: k => { delete data[k]; },
    };
}

const throwingStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
};

describe('persist participants: ParticipantStore', () => {
    const records = [
        { firstName: 'Alice', lastName: 'A', familyGroup: 'GA', wishlist: 'Books' },
        { firstName: 'Bob', lastName: 'B', familyGroup: 'GB', wishlist: '' },
    ];

    test('round-trips records through storage in a versioned format', () => {
        const storage = fakeStorage();
        const store = new ParticipantStore(storage);
        store.save(records);
        expect(JSON.parse(storage.data[ParticipantStore.KEY])).toEqual({ version: 1, participants: records });
        expect(new ParticipantStore(storage).load()).toEqual(records);
    });

    test('returns [] for missing, corrupt or wrong-shaped data', () => {
        expect(new ParticipantStore(fakeStorage()).load()).toEqual([]);
        expect(new ParticipantStore(fakeStorage({ [ParticipantStore.KEY]: '{not json' })).load()).toEqual([]);
        expect(new ParticipantStore(fakeStorage({ [ParticipantStore.KEY]: '{"version":1,"participants":"nope"}' })).load()).toEqual([]);
    });

    test('never throws when storage is unavailable (private mode, blocked cookies)', () => {
        const store = new ParticipantStore(throwingStorage);
        expect(store.load()).toEqual([]);
        expect(() => store.save(records)).not.toThrow();
        expect(() => store.clear()).not.toThrow();
        expect(new ParticipantStore(null).load()).toEqual([]);
    });

    test('clear() removes the saved list', () => {
        const storage = fakeStorage();
        const store = new ParticipantStore(storage);
        store.save(records);
        store.clear();
        expect(storage.data[ParticipantStore.KEY]).toBeUndefined();
    });
});

describe('persist participants: GiftExchangeService records', () => {
    test('toRecords/loadRecords round-trip people as plain data', () => {
        const a = new GiftExchangeService();
        a.addPerson('Alice', 'A', 'GA', 'Books');
        a.addPerson('Bob', 'B');
        const records = a.toRecords();
        expect(records).toEqual([
            { firstName: 'Alice', lastName: 'A', familyGroup: 'GA', wishlist: 'Books' },
            { firstName: 'Bob', lastName: 'B', familyGroup: 'B', wishlist: '' },
        ]);

        const b = new GiftExchangeService();
        expect(b.loadRecords(records)).toBe(2);
        expect(b.getPeople().map(p => p.getFullName())).toEqual(['Alice A', 'Bob B']);
        expect(b.getPeople()[0].wishlist).toBe('Books');
    });

    test('loadRecords skips invalid entries and duplicates', () => {
        const s = new GiftExchangeService();
        const added = s.loadRecords([
            { firstName: 'Alice', lastName: 'A' },
            { firstName: 'alice', lastName: 'a' },
            { firstName: '', lastName: 'X' },
            null,
            { firstName: 42, lastName: 'Y' },
        ]);
        expect(added).toBe(1);
        expect(s.getPeople()).toHaveLength(1);
    });

    test('clearPeople empties the list', () => {
        const s = new GiftExchangeService();
        s.addPerson('Alice', 'A');
        s.clearPeople();
        expect(s.getPeople()).toEqual([]);
    });
});

describe('persist participants: UIManager', () => {
    function setupDOM() {
        document.body.innerHTML = `
            <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><p id="loadingText"></p></div>
            <input id="firstNameInput" /><input id="lastNameInput" /><input id="groupInput" /><input id="wishlistInput" />
            <button id="addBtn"></button>
            <span id="nameCount"></span><button id="clearListBtn" class="hidden"></button>
            <ul id="nameList"></ul><p id="emptyState"></p>
            <button id="shuffleBtn"></button><button id="resetBtn" class="hidden"></button>
            <div id="resultsSection" class="hidden"></div><div id="resultsList"></div>
            <p id="errorMsg"></p>
            <button id="toggleBulkBtn"></button><div id="bulkSection" class="hidden"></div>
            <textarea id="bulkInput"></textarea><button id="importBtn"></button>
        `;
    }

    function addViaForm(first, last, group = '', wish = '') {
        document.getElementById('firstNameInput').value = first;
        document.getElementById('lastNameInput').value = last;
        document.getElementById('groupInput').value = group;
        document.getElementById('wishlistInput').value = wish;
        document.getElementById('addBtn').click();
    }

    beforeEach(() => {
        jest.useFakeTimers();
        setupDOM();
    });

    afterEach(() => jest.useRealTimers());

    test('adding, importing and removing are saved, and a reload restores the list', () => {
        const storage = fakeStorage();
        const ui = new UIManager(new GiftExchangeService(), new AnimationService(), new ParticipantStore(storage));

        addViaForm('Alice', 'A', 'GA', 'Books');
        document.getElementById('bulkInput').value = 'Bob B [GB], Cara C {Tea}';
        document.getElementById('importBtn').click();
        expect(new ParticipantStore(storage).load().map(r => r.firstName)).toEqual(['Alice', 'Bob', 'Cara']);

        document.querySelectorAll('#nameList .delete-btn')[1].click();
        expect(new ParticipantStore(storage).load().map(r => r.firstName)).toEqual(['Alice', 'Cara']);

        // "Reload": fresh DOM + fresh service, same storage.
        setupDOM();
        const service = new GiftExchangeService();
        new UIManager(service, new AnimationService(), new ParticipantStore(storage));
        expect(service.getPeople().map(p => p.getFullName())).toEqual(['Alice A', 'Cara C']);
        expect(document.querySelectorAll('#nameList li')).toHaveLength(2);
        expect(document.getElementById('nameCount').textContent).toBe('2');
        expect(document.getElementById('shuffleBtn').disabled).toBe(false);
        expect(document.getElementById('clearListBtn').classList.contains('hidden')).toBe(false);
        expect(ui).toBeDefined();
    });

    test('Clear list asks first, then empties the list and the saved copy', () => {
        const storage = fakeStorage();
        const service = new GiftExchangeService();
        const ui = new UIManager(service, new AnimationService(), new ParticipantStore(storage));
        addViaForm('Alice', 'A');
        addViaForm('Bob', 'B');

        ui.confirm = jest.fn(() => false);
        document.getElementById('clearListBtn').click();
        expect(ui.confirm).toHaveBeenCalled();
        expect(service.getPeople()).toHaveLength(2);

        ui.confirm = jest.fn(() => true);
        document.getElementById('clearListBtn').click();
        expect(service.getPeople()).toHaveLength(0);
        expect(document.querySelectorAll('#nameList li')).toHaveLength(0);
        expect(new ParticipantStore(storage).load()).toEqual([]);
        expect(document.getElementById('clearListBtn').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('shuffleBtn').disabled).toBe(true);
    });

    test('defaults to browser localStorage when no store is injected', () => {
        localStorage.clear();
        new UIManager(new GiftExchangeService(), new AnimationService());
        addViaForm('Dana', 'D');
        expect(JSON.parse(localStorage.getItem('giftExchange.participants')).participants[0].firstName).toBe('Dana');
        localStorage.clear();
    });
});
