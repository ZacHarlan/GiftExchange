/**
 * @jest-environment jsdom
 */

const { GiftExchangeService, UIManager, AnimationService, ParticipantStore, MatchHistory } = require('../../script.js');

const key = a => `${a.giver.getFullName()} -> ${a.receiver.getFullName()}`;

function service(people, coreFamilies) {
    const s = new GiftExchangeService(coreFamilies);
    people.forEach(p => {
        const [first, last, group] = p.split(' ');
        s.addPerson(first, last, group);
    });
    return s;
}

// Everyone gives once and receives once, and nobody has themselves.
function expectCompleteDraw(s, assignments) {
    const names = s.getPeople().map(p => p.getFullName()).sort();
    expect(assignments.map(a => a.giver.getFullName()).sort()).toEqual(names);
    expect(assignments.map(a => a.receiver.getFullName()).sort()).toEqual(names);
    assignments.forEach(a => expect(a.giver).not.toBe(a.receiver));
}

describe('guaranteed matches: GiftExchangeService', () => {
    const FAMILY = ['Ann A', 'Ben B', 'Cal C', 'Dee D', 'Eve E'];

    test('the guaranteed giver always buys for the guaranteed receiver', () => {
        const s = service(FAMILY);
        s.setFixedPairs([{ giver: 'Ann A', receiver: 'Dee D' }]);
        for (let i = 0; i < 200; i++) {
            const assignments = s.shuffleAndAssign();
            expect(assignments.map(key)).toContain('Ann A -> Dee D');
            expectCompleteDraw(s, assignments);
        }
    });

    test('several guarantees hold together, and names match whatever the case or spacing', () => {
        const s = service(FAMILY);
        s.setFixedPairs([{ giver: ' ann  a ', receiver: 'BEN B' }, { giver: 'Ben B', receiver: 'Ann A' }, { giver: 'Cal C', receiver: 'Dee D' }]);
        for (let i = 0; i < 100; i++) {
            const assignments = s.shuffleAndAssign();
            expect(assignments.map(key)).toEqual(expect.arrayContaining(['Ann A -> Ben B', 'Ben B -> Ann A', 'Cal C -> Dee D']));
            expectCompleteDraw(s, assignments);
        }
    });

    test('a guarantee wins over the same-family rule', () => {
        const s = service(['Ann A Smiths', 'Ben B Smiths', 'Cal C', 'Dee D']);
        s.setFixedPairs([{ giver: 'Ann A', receiver: 'Ben B' }]);
        for (let i = 0; i < 50; i++) {
            const assignments = s.shuffleAndAssign();
            expect(assignments.map(key)).toContain('Ann A -> Ben B');
            expectCompleteDraw(s, assignments);
        }
    });

    test('a guarantee wins over last year, and everyone else still avoids last year', () => {
        const s = service(FAMILY);
        s.setExcludedPairs([{ giver: 'Ann A', receiver: 'Dee D' }, { giver: 'Ben B', receiver: 'Cal C' }]);
        s.setFixedPairs([{ giver: 'Ann A', receiver: 'Dee D' }]);
        for (let i = 0; i < 100; i++) {
            const pairs = s.shuffleAndAssign().map(key);
            expect(pairs).toContain('Ann A -> Dee D');
            expect(pairs).not.toContain('Ben B -> Cal C');
        }
    });

    test('results keep the list order', () => {
        const s = service(FAMILY);
        s.setFixedPairs([{ giver: 'Dee D', receiver: 'Ann A' }]);
        expect(s.shuffleAndAssign().map(a => a.giver.getFullName())).toEqual(FAMILY);
    });

    test('works inside the Core families pool', () => {
        const s = service(['Ann A', 'Ben A Two', 'Cal A Three', 'Dee D', 'Eve E'], ['A']);
        s.setFixedPairs([{ giver: 'Cal A', receiver: 'Ann A' }]);
        for (let i = 0; i < 50; i++) {
            const assignments = s.shuffleAndAssign();
            expect(assignments.map(key)).toContain('Cal A -> Ann A');
            expectCompleteDraw(s, assignments);
        }
    });

    test('with two people, one guarantee decides the whole draw', () => {
        const s = service(['Ann A', 'Ben B']);
        s.setFixedPairs([{ giver: 'Ann A', receiver: 'Ben B' }]);
        expect(s.shuffleAndAssign().map(key)).toEqual(['Ann A -> Ben B', 'Ben B -> Ann A']);
    });

    test('the same guarantee listed twice counts once', () => {
        const s = service(FAMILY);
        s.setFixedPairs([{ giver: 'Ann A', receiver: 'Dee D' }, { giver: 'ann a', receiver: 'dee d' }]);
        expect(s.shuffleAndAssign().map(key)).toContain('Ann A -> Dee D');
    });

    test('clearing the guarantees returns to a normal draw', () => {
        const s = service(FAMILY);
        s.setFixedPairs([{ giver: 'Nobody Here', receiver: 'Ann A' }]);
        s.setFixedPairs([]);
        expectCompleteDraw(s, s.shuffleAndAssign());
        s.setFixedPairs(undefined);
        expectCompleteDraw(s, s.shuffleAndAssign());
    });

    test.each([
        ['a name that is not on the list', [{ giver: 'Ann A', receiver: 'Zed Z' }], /“Zed Z” isn’t on the list/],
        ['someone buying for themselves', [{ giver: 'Ann A', receiver: 'ann a' }], /Ann A can’t buy for themselves/],
        ['one giver with two receivers', [{ giver: 'Ann A', receiver: 'Ben B' }, { giver: 'Ann A', receiver: 'Cal C' }], /Ann A is set to buy for two people/],
        ['one receiver with two givers', [{ giver: 'Ann A', receiver: 'Cal C' }, { giver: 'Ben B', receiver: 'Cal C' }], /two people are set to buy for Cal C/],
    ])('refuses %s, and says why', (_, pairs, message) => {
        const s = service(FAMILY);
        s.setFixedPairs(pairs);
        expect(() => s.shuffleAndAssign()).toThrow(message);
    });

    test('refuses a guarantee between a Core family member and someone outside it', () => {
        const s = service(['Ann A', 'Ben A Two', 'Dee D', 'Eve E'], ['A']);
        s.setFixedPairs([{ giver: 'Ann A', receiver: 'Dee D' }]);
        expect(() => s.shuffleAndAssign()).toThrow(/only one of them is in the Core families/);
    });

    test('explains when the guarantees leave no valid draw for the others', () => {
        // Ann -> Ben leaves Ben and Cal to give, Ann and Cal to receive; Ben and Ann share a
        // family, so Ben would need Cal and Cal would need Ann... but Cal and Ann share one too.
        const s = service(['Ann A One', 'Ben B One', 'Cal C One']);
        s.setFixedPairs([{ giver: 'Ann A', receiver: 'Ben B' }]);
        expect(() => s.shuffleAndAssign()).toThrow(/guaranteed matches/);
    });
});

describe('guaranteed matches: Settings', () => {
    const DOM = `
        <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><p id="loadingText"></p></div>
        <input id="firstNameInput" /><input id="lastNameInput" /><input id="groupInput" /><input id="wishlistInput" />
        <button id="addBtn"></button><ul id="nameList"></ul>
        <button id="shuffleBtn"></button><button id="resetBtn" class="hidden"></button>
        <div id="resultsSection" class="hidden"></div><div id="resultsList"></div><p id="errorMsg"></p>
        <textarea id="guaranteedInput"></textarea><button id="saveCoreFamiliesBtn"></button>`;

    function makeUI() {
        document.body.innerHTML = DOM;
        const memory = { getItem: () => null, setItem: () => { }, removeItem: () => { } };
        const s = new GiftExchangeService();
        ['Ann A', 'Ben B', 'Cal C', 'Dee D'].forEach(n => s.addPerson(...n.split(' ')));
        const animation = new AnimationService();
        animation.play = (theme, done) => done();
        const ui = new UIManager(s, animation, new ParticipantStore(memory), new MatchHistory(memory));
        return { ui, s, input: document.getElementById('guaranteedInput') };
    }

    beforeEach(() => localStorage.clear());
    afterEach(() => localStorage.clear());

    test('a match typed in Settings is used by the draw without pressing Save', () => {
        const { ui, input } = makeUI();
        input.value = 'Cal C -> Ann A';
        for (let i = 0; i < 20; i++) {
            ui.handleShuffle();
            expect(ui.lastAssignments.map(key)).toContain('Cal C -> Ann A');
        }
    });

    test('is saved when the box changes and comes back after a reload', () => {
        const first = makeUI();
        first.input.value = 'Cal C -> Ann A\nBen B gives to Dee D';
        first.input.dispatchEvent(new Event('change'));
        expect(localStorage.getItem('giftExchange.guaranteedMatches')).toBe('Cal C -> Ann A\nBen B gives to Dee D');

        const second = makeUI();
        expect(second.input.value).toBe('Cal C -> Ann A\nBen B gives to Dee D');
        second.ui.handleShuffle();
        expect(second.ui.lastAssignments.map(key)).toEqual(expect.arrayContaining(['Cal C -> Ann A', 'Ben B -> Dee D']));
    });

    test('Save settings stores it, and emptying the box removes it', () => {
        const { input } = makeUI();
        input.value = 'Cal C -> Ann A';
        document.getElementById('saveCoreFamiliesBtn').click();
        expect(localStorage.getItem('giftExchange.guaranteedMatches')).toBe('Cal C -> Ann A');
        input.value = '  ';
        document.getElementById('saveCoreFamiliesBtn').click();
        expect(localStorage.getItem('giftExchange.guaranteedMatches')).toBeNull();
    });

    test('a line that is not "Giver -> Receiver" stops the draw instead of being skipped', () => {
        const { ui, input } = makeUI();
        input.value = 'Cal C -> Ann A\nBen B Dee D';
        ui.handleShuffle();
        expect(document.getElementById('errorMsg').textContent).toMatch(/not understood: “Ben B Dee D”/);
        expect(ui.lastAssignments).toEqual([]);
    });

    test('a name that is not on the list shows an error and no results', () => {
        const { ui, input } = makeUI();
        input.value = 'Cal C -> Zed Z';
        ui.handleShuffle();
        expect(document.getElementById('errorMsg').textContent).toMatch(/“Zed Z” isn’t on the list/);
        expect(ui.lastAssignments).toEqual([]);
    });
});
