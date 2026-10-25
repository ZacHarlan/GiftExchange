/**
 * @jest-environment jsdom
 */

const { PartyReveal, Person, GiftExchangeService, UIManager, AnimationService } = require('../../script.js');

const PARTY_DOM = `
    <div id="partyOverlay" class="hidden" role="dialog" aria-modal="true">
        <button id="partyClose"></button>
        <p id="partyProgress"></p>
        <div id="partyCard">
            <p id="partyGiver"></p>
            <img id="partyGiftClosed"><img id="partyGiftOpen" class="hidden">
            <p id="partyReceiver" class="hidden"></p>
            <p id="partyWishlist" class="hidden"></p>
        </div>
        <div id="partyFinale" class="hidden"></div>
        <div id="partyConfetti"></div>
        <button id="partyPrev"></button><button id="partyNext"></button>
    </div>`;

const pairs = () => {
    const a = new Person('Ann', 'Frost', 'F1', 'Books');
    const b = new Person('<b>Ben</b>', 'Frost', 'F2');
    const c = new Person('Cy', 'Pike');
    return [{ giver: a, receiver: b }, { giver: b, receiver: c }, { giver: c, receiver: a }];
};

const $ = (id) => document.getElementById(id);
const visible = (id) => !$(id).classList.contains('hidden');

describe('PartyReveal', () => {
    let sound;
    let party;

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = PARTY_DOM;
        sound = { play: jest.fn() };
        party = new PartyReveal(sound);
    });
    afterEach(() => jest.useRealTimers());

    test('opens on the first giver with a drumroll, receiver hidden', () => {
        party.open(pairs());
        expect(visible('partyOverlay')).toBe(true);
        expect($('partyProgress').textContent).toBe('1 of 3');
        expect($('partyGiver').textContent).toBe('Ann Frost');
        expect(visible('partyReceiver')).toBe(false);
        expect(sound.play).toHaveBeenCalledWith('drumroll');
    });

    test('after the drumroll the gift opens and the receiver is revealed with confetti', () => {
        party.open(pairs());
        jest.advanceTimersByTime(PartyReveal.DRUMROLL_MS);
        expect(visible('partyReceiver')).toBe(true);
        expect(visible('partyGiftOpen')).toBe(true);
        expect($('partyReceiver').textContent).toBe('<b>Ben</b> Frost'); // shown as text, not HTML
        expect($('partyReceiver').querySelector('b')).toBeNull();
        expect(visible('partyWishlist')).toBe(false); // Ben has no wishlist
        expect(sound.play).toHaveBeenLastCalledWith('tada');
        expect($('partyConfetti').children.length).toBeGreaterThan(20);
    });

    test('shows the receiver\'s wishlist when there is one', () => {
        party.open(pairs());
        for (let i = 0; i < 4; i++) party.next(); // reveal 1, show 2, reveal 2, show 3: Cy -> Ann (Books)
        jest.advanceTimersByTime(PartyReveal.DRUMROLL_MS);
        expect($('partyReceiver').textContent).toBe('Ann Frost');
        expect(visible('partyWishlist')).toBe(true);
        expect($('partyWishlist').textContent).toContain('Books');
    });

    test('Next during the drumroll skips straight to the reveal; Next again moves on', () => {
        party.open(pairs());
        $('partyNext').click();
        expect(visible('partyReceiver')).toBe(true);
        expect($('partyProgress').textContent).toBe('1 of 3');
        $('partyNext').click();
        expect($('partyProgress').textContent).toBe('2 of 3');
        expect(visible('partyReceiver')).toBe(false);
    });

    test('Back goes to the previous person already revealed; disabled on the first', () => {
        party.open(pairs());
        expect($('partyPrev').disabled).toBe(true);
        party.next();
        party.next();
        $('partyPrev').click();
        expect($('partyProgress').textContent).toBe('1 of 3');
        expect(visible('partyReceiver')).toBe(true);
    });

    test('after the last person, a finale; keyboard and Esc work', () => {
        party.open(pairs());
        for (let i = 0; i < 6; i++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(visible('partyFinale')).toBe(true);
        expect(visible('partyCard')).toBe(false);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(visible('partyOverlay')).toBe(false);
        // keys do nothing once closed
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        expect(visible('partyOverlay')).toBe(false);
    });

    test('Done on the finale closes the show', () => {
        party.open(pairs());
        for (let i = 0; i < 6; i++) party.next();
        expect(visible('partyFinale')).toBe(true);
        $('partyNext').click();
        expect(visible('partyOverlay')).toBe(false);
    });

    test('close button closes and cancels a pending reveal', () => {
        party.open(pairs());
        $('partyClose').click();
        expect(visible('partyOverlay')).toBe(false);
        jest.advanceTimersByTime(PartyReveal.DRUMROLL_MS);
        expect(sound.play).not.toHaveBeenCalledWith('tada');
    });

    test('does nothing without assignments or without the overlay markup', () => {
        party.open([]);
        expect(visible('partyOverlay')).toBe(false);
        document.body.innerHTML = '';
        expect(() => new PartyReveal(sound).open(pairs())).not.toThrow();
    });
});

describe('UIManager party button', () => {
    test('opens the party reveal with the current results', () => {
        jest.useFakeTimers();
        document.body.innerHTML = `
            <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><p id="loadingText"></p></div>
            <input id="firstNameInput" /><input id="lastNameInput" /><input id="groupInput" /><input id="wishlistInput" />
            <button id="addBtn"></button><ul id="nameList"></ul>
            <button id="shuffleBtn"></button><button id="resetBtn" class="hidden"></button>
            <div id="resultsSection" class="hidden"></div><div id="resultsList"></div><p id="errorMsg"></p>
            <button id="partyBtn"></button>` + PARTY_DOM;
        const service = new GiftExchangeService();
        const party = { open: jest.fn() };
        const ui = new UIManager(service, new AnimationService(), { load: () => [], save() { }, clear() { } }, undefined, undefined, party);
        service.addPerson('Ann', 'A');
        service.addPerson('Ben', 'B');
        const assignments = service.shuffleAndAssign();
        ui.displayResults(assignments);
        $('partyBtn').click();
        expect(party.open).toHaveBeenCalledWith(assignments);
        jest.useRealTimers();
    });
});
