/**
 * @jest-environment jsdom
 */

const { GuidedTour, TOUR_STEPS, GiftExchangeService, UIManager, AnimationService } = require('../../script.js');

const TOUR_DOM = `
    <div id="tourOverlay" class="hidden">
        <div id="tourSpotlight"></div>
        <div id="tourCard" role="dialog" aria-modal="true">
            <p id="tourProgress"></p>
            <h2 id="tourTitle"></h2>
            <p id="tourText"></p>
            <button id="tourSkip"></button>
            <button id="tourPrev"></button>
            <button id="tourNext"></button>
        </div>
    </div>`;

const STEPS = [
    { title: 'Welcome', text: 'Hello <b>there</b>' },
    { target: '#thing', title: 'The thing', text: 'Click it.' },
    { target: '#missing', title: 'Not on the page', text: 'Shown centered.' },
    { title: 'Done', text: 'Bye.' },
];

const $ = (id) => document.getElementById(id);
const visible = (id) => !$(id).classList.contains('hidden');
const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

function fakeRect(node, { top, left, width, height }) {
    node.getBoundingClientRect = () => ({ top, left, width, height, right: left + width, bottom: top + height });
}

describe('GuidedTour', () => {
    let tour;
    let onClose;

    beforeEach(() => {
        document.body.innerHTML = `${TOUR_DOM}<button id="thing">Thing</button>`;
        fakeRect($('thing'), { top: 100, left: 50, width: 200, height: 40 });
        onClose = jest.fn();
        tour = new GuidedTour(STEPS);
        tour.onClose = onClose;
    });

    test('start opens on the first step with progress and Back disabled', () => {
        tour.start();
        expect(visible('tourOverlay')).toBe(true);
        expect(tour.isOpen()).toBe(true);
        expect($('tourProgress').textContent).toBe('1 of 4');
        expect($('tourTitle').textContent).toBe('Welcome');
        expect($('tourPrev').disabled).toBe(true);
        expect($('tourNext').textContent).toBe('Next');
        expect(document.activeElement).toBe($('tourNext'));
    });

    test('step text is plain text, never HTML', () => {
        tour.start();
        expect($('tourText').textContent).toBe('Hello <b>there</b>');
        expect($('tourText').querySelector('b')).toBeNull();
    });

    test('a step with a target spotlights it; a step without one is centered', () => {
        tour.start();
        expect($('tourOverlay').classList.contains('tour-centered')).toBe(true);
        expect(visible('tourSpotlight')).toBe(false);

        $('tourNext').click();
        expect($('tourTitle').textContent).toBe('The thing');
        expect($('tourOverlay').classList.contains('tour-centered')).toBe(false);
        expect(visible('tourSpotlight')).toBe(true);
        expect($('tourSpotlight').style.top).toBe('92px'); // 100 - 8px padding
        expect($('tourSpotlight').style.left).toBe('42px');
        expect($('tourSpotlight').style.width).toBe('216px');
        expect($('tourSpotlight').style.height).toBe('56px');
    });

    test('a target that is missing or hidden falls back to a centered card', () => {
        tour.start();
        tour.next();
        tour.next();
        expect($('tourTitle').textContent).toBe('Not on the page');
        expect($('tourOverlay').classList.contains('tour-centered')).toBe(true);
        expect(visible('tourSpotlight')).toBe(false);
    });

    test('Back returns to the previous step', () => {
        tour.start();
        $('tourNext').click();
        expect($('tourPrev').disabled).toBe(false);
        $('tourPrev').click();
        expect($('tourTitle').textContent).toBe('Welcome');
    });

    test('the last step says so, and finishing closes the tour and reports it', () => {
        tour.start();
        tour.next();
        tour.next();
        tour.next();
        expect($('tourProgress').textContent).toBe('4 of 4');
        expect($('tourNext').textContent).toBe('Let’s go!');
        $('tourNext').click();
        expect(visible('tourOverlay')).toBe(false);
        expect(onClose).toHaveBeenCalledWith({ completed: true });
    });

    test('Skip closes the tour early', () => {
        tour.start();
        $('tourSkip').click();
        expect(tour.isOpen()).toBe(false);
        expect(onClose).toHaveBeenCalledWith({ completed: false });
    });

    test('arrow keys move between steps and Escape closes', () => {
        tour.start();
        key('ArrowRight');
        expect($('tourTitle').textContent).toBe('The thing');
        key('ArrowLeft');
        expect($('tourTitle').textContent).toBe('Welcome');
        key('Escape');
        expect(tour.isOpen()).toBe(false);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    test('keys do nothing while the tour is closed', () => {
        key('ArrowRight');
        key('Escape');
        expect(tour.isOpen()).toBe(false);
        expect(onClose).not.toHaveBeenCalled();
    });

    test('Tab stays inside the tour card', () => {
        tour.start();
        tour.next(); // Back is enabled from step 2
        $('tourNext').focus();
        const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
        document.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe($('tourSkip'));
    });

    test('closing returns focus to where it was', () => {
        $('thing').focus();
        tour.start();
        tour.close();
        expect(document.activeElement).toBe($('thing'));
    });

    test('does nothing without its markup', () => {
        document.body.innerHTML = '';
        const bare = new GuidedTour(STEPS);
        expect(() => bare.start()).not.toThrow();
        expect(bare.isOpen()).toBe(false);
    });

    test('the built-in tour covers every main part of the app', () => {
        const targets = TOUR_STEPS.map(s => s.target).filter(Boolean);
        for (const id of ['.input-group', '#groupInput', '#toggleBulkBtn', '#toggleSettingsBtn',
            '.list-section', '#shuffleBtn', '#resultsSection', '#modeSwitch', '.audio-controls']) {
            expect(targets).toContain(id);
        }
        expect(TOUR_STEPS[0].target).toBeUndefined(); // starts with a centered welcome
        for (const s of TOUR_STEPS) {
            expect(s.title).toBeTruthy();
            expect(s.text).toBeTruthy();
        }
    });
});

describe('UIManager + tour', () => {
    const APP_DOM = `
        <button id="tourBtn"></button>
        <div id="tourInvite" class="hidden">
            <button id="tourInviteStart"></button>
            <button id="tourInviteDismiss"></button>
        </div>
        <div id="modeSwitch"><button data-mode="secret-santa"></button><button data-mode="bad-santa"></button></div>
        <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><div id="hanukkahContainer"></div><p id="loadingText"></p></div>
        <input id="firstNameInput"><input id="lastNameInput"><input id="groupInput"><input id="wishlistInput">
        <button id="addBtn"></button><ul id="nameList"></ul>
        <button id="shuffleBtn"></button><button id="resetBtn"></button>
        <div id="resultsSection" class="hidden"></div><div id="resultsList"></div><p id="errorMsg"></p>
        ${TOUR_DOM}`;

    let tour;
    const makeUI = () => {
        tour = new GuidedTour(STEPS);
        return new UIManager(new GiftExchangeService(), new AnimationService(), undefined, undefined, undefined, undefined, tour);
    };

    beforeEach(() => {
        document.body.innerHTML = APP_DOM;
        localStorage.clear();
    });

    test('first visit: an invite to take the tour is shown', () => {
        makeUI();
        expect(visible('tourInvite')).toBe(true);
        expect(tour.isOpen()).toBe(false); // never pops up uninvited
    });

    test('the invite starts the tour; finishing it hides the invite for good', () => {
        makeUI();
        $('tourInviteStart').click();
        expect(tour.isOpen()).toBe(true);
        expect(visible('tourInvite')).toBe(false);
        tour.close();
        expect(localStorage.getItem('giftExchange.tourSeen')).toBe('1');

        document.body.innerHTML = APP_DOM;
        makeUI();
        expect(visible('tourInvite')).toBe(false);
    });

    test('“No thanks” hides the invite and remembers it', () => {
        makeUI();
        $('tourInviteDismiss').click();
        expect(visible('tourInvite')).toBe(false);
        expect(localStorage.getItem('giftExchange.tourSeen')).toBe('1');
        expect(tour.isOpen()).toBe(false);
    });

    test('the “How it works” button replays the tour any time', () => {
        localStorage.setItem('giftExchange.tourSeen', '1');
        makeUI();
        expect(visible('tourInvite')).toBe(false);
        $('tourBtn').click();
        expect(tour.isOpen()).toBe(true);
        expect($('tourTitle').textContent).toBe('Welcome');
    });

    test('starting the tour from Bad Santa mode switches back to Secret Santa first', () => {
        makeUI();
        const toSecretSanta = jest.fn();
        document.querySelector('[data-mode="secret-santa"]').addEventListener('click', toSecretSanta);
        document.body.dataset.mode = 'bad-santa';
        $('tourBtn').click();
        expect(toSecretSanta).toHaveBeenCalled();
    });
});
