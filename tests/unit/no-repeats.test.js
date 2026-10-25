/**
 * @jest-environment jsdom
 */

const { GiftExchangeService, MatchHistory, parseMatchLines, UIManager, AnimationService } = require('../../script.js');

function fakeStorage(initial = {}) {
    const data = { ...initial };
    return {
        data,
        getItem: k => (k in data ? data[k] : null),
        setItem: (k, v) => { data[k] = String(v); },
        removeItem: k => { delete data[k]; },
    };
}

const key = (a) => `${a.giver.getFullName()} -> ${a.receiver.getFullName()}`;

describe('no repeats: GiftExchangeService exclusions', () => {
    function family() {
        const s = new GiftExchangeService();
        ['Ann A', 'Ben B', 'Cal C', 'Dee D'].forEach(n => {
            const [f, l] = n.split(' ');
            s.addPerson(f, l);
        });
        return s;
    }

    test('never repeats an excluded pair', () => {
        const s = family();
        s.setExcludedPairs([{ giver: 'Ann A', receiver: 'Ben B' }, { giver: 'ben b', receiver: 'CAL C' }]);
        for (let i = 0; i < 200; i++) {
            const pairs = s.shuffleAndAssign().map(key);
            expect(pairs).not.toContain('Ann A -> Ben B');
            expect(pairs).not.toContain('Ben B -> Cal C');
        }
    });

    test('explains when last year makes matching impossible', () => {
        const s = new GiftExchangeService();
        s.addPerson('Ann', 'A');
        s.addPerson('Ben', 'B');
        s.setExcludedPairs([{ giver: 'Ann A', receiver: 'Ben B' }]);
        expect(() => s.shuffleAndAssign()).toThrow(/last year/i);
    });

    test('clearing exclusions restores normal matching', () => {
        const s = new GiftExchangeService();
        s.addPerson('Ann', 'A');
        s.addPerson('Ben', 'B');
        s.setExcludedPairs([{ giver: 'Ann A', receiver: 'Ben B' }]);
        s.setExcludedPairs([]);
        expect(s.shuffleAndAssign()).toHaveLength(2);
    });
});

describe('no repeats: parseMatchLines', () => {
    test('reads one match per line in several common styles', () => {
        expect(parseMatchLines('Ann A -> Ben B\nBen B → Cal C\nCal C: Dee D\nDee D gives to Ann A\n\n  bad line  ')).toEqual([
            { giver: 'Ann A', receiver: 'Ben B' },
            { giver: 'Ben B', receiver: 'Cal C' },
            { giver: 'Cal C', receiver: 'Dee D' },
            { giver: 'Dee D', receiver: 'Ann A' },
        ]);
    });

    test('ignores a "(Wishlist: …)" note copied from results', () => {
        expect(parseMatchLines('Ann A -> Ben B (🎁 Wishlist: Books)')).toEqual([{ giver: 'Ann A', receiver: 'Ben B' }]);
    });
});

describe('no repeats: MatchHistory', () => {
    test('stores matches per year and reads them back', () => {
        const storage = fakeStorage();
        const h = new MatchHistory(storage);
        h.saveYear(2025, [{ giver: 'Ann A', receiver: 'Ben B' }]);
        h.saveYear(2026, [{ giver: 'Ann A', receiver: 'Cal C' }]);
        expect(new MatchHistory(storage).getYear(2025)).toEqual([{ giver: 'Ann A', receiver: 'Ben B' }]);
        expect(new MatchHistory(storage).getYear(2024)).toEqual([]);
        expect(JSON.parse(storage.data[MatchHistory.KEY]).version).toBe(1);
    });

    test('never throws on broken or blocked storage', () => {
        const broken = fakeStorage({ [MatchHistory.KEY]: '{oops' });
        expect(new MatchHistory(broken).getYear(2025)).toEqual([]);
        const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
        expect(() => new MatchHistory(blocked).saveYear(2025, [])).not.toThrow();
        expect(new MatchHistory(null).getYear(2025)).toEqual([]);
    });
});

describe('no repeats: UIManager', () => {
    function setupDOM() {
        document.body.innerHTML = `
            <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><p id="loadingText"></p></div>
            <input id="firstNameInput" /><input id="lastNameInput" /><input id="groupInput" /><input id="wishlistInput" />
            <button id="addBtn"></button><ul id="nameList"></ul>
            <button id="shuffleBtn"></button><button id="resetBtn" class="hidden"></button>
            <div id="resultsSection" class="hidden"></div><div id="resultsList"></div><p id="errorMsg"></p>
            <p id="repeatNote" class="hidden"></p>
            <button id="toggleSettingsBtn"></button><div id="settingsSection" class="hidden"></div>
            <input id="exchangeDateInput" type="date" />
            <input id="avoidRepeatsToggle" type="checkbox" />
            <textarea id="lastYearInput"></textarea>
            <input id="coreFamiliesInput" /><button id="saveCoreFamiliesBtn"></button>`;
    }

    const store = () => ({ load: () => [], save() { }, clear() { } });

    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        setupDOM();
    });
    afterEach(() => {
        jest.useRealTimers();
        localStorage.clear();
    });

    function makeUI(history) {
        const service = new GiftExchangeService();
        const ui = new UIManager(service, new AnimationService(), store(), history);
        ui.now = () => new Date(2026, 10, 1); // Nov 1 2026 → "last year" is 2025
        ui.initSettings();
        return { service, ui };
    }

    test('typing last year\'s matches in Settings saves them and the shuffle avoids them', () => {
        const history = new MatchHistory(fakeStorage());
        const { service, ui } = makeUI(history);
        expect(document.getElementById('avoidRepeatsToggle').checked).toBe(true); // on by default

        document.getElementById('lastYearInput').value = 'Ann A -> Ben B\nBen B -> Ann A';
        document.getElementById('saveCoreFamiliesBtn').click();
        expect(history.getYear(2025)).toHaveLength(2);

        ['Ann A', 'Ben B', 'Cal C', 'Dee D'].forEach(n => service.addPerson(...n.split(' ')));
        for (let i = 0; i < 50; i++) {
            ui.handleShuffle();
            jest.advanceTimersByTime(800 * 4 + 500);
            const lines = ui.resultLines();
            expect(lines).not.toContain('Ann A -> Ben B');
            expect(lines).not.toContain('Ben B -> Ann A');
        }
        expect(document.getElementById('repeatNote').classList.contains('hidden')).toBe(false);
    });

    test('each shuffle is recorded as this year\'s matches and shows up as last year next year', () => {
        const storage = fakeStorage();
        const { service, ui } = makeUI(new MatchHistory(storage));
        ['Ann A', 'Ben B'].forEach(n => service.addPerson(...n.split(' ')));
        ui.handleShuffle();
        jest.advanceTimersByTime(800 * 4 + 500);
        expect(new MatchHistory(storage).getYear(2026)).toEqual([
            { giver: 'Ann A', receiver: 'Ben B' },
            { giver: 'Ben B', receiver: 'Ann A' },
        ]);

        setupDOM();
        const next = new UIManager(new GiftExchangeService(), new AnimationService(), store(), new MatchHistory(storage));
        next.now = () => new Date(2027, 10, 1);
        next.initSettings();
        expect(document.getElementById('lastYearInput').value).toBe('Ann A -> Ben B\nBen B -> Ann A');
    });

    test('turning the toggle off allows repeats (and is remembered)', () => {
        const history = new MatchHistory(fakeStorage());
        history.saveYear(2025, [{ giver: 'Ann A', receiver: 'Ben B' }]);
        const { service, ui } = makeUI(history);
        ['Ann A', 'Ben B'].forEach(n => service.addPerson(...n.split(' ')));

        ui.handleShuffle(); // impossible with the rule on
        expect(document.getElementById('errorMsg').textContent).toMatch(/last year/i);

        document.getElementById('avoidRepeatsToggle').checked = false;
        document.getElementById('saveCoreFamiliesBtn').click();
        expect(localStorage.getItem('giftExchange.avoidRepeats')).toBe('false');
        ui.handleShuffle();
        jest.advanceTimersByTime(800 * 4 + 500);
        expect(ui.resultLines()).toHaveLength(2);
    });
});
