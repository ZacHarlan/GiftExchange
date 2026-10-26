/**
 * @jest-environment jsdom
 */

const { GiftExchangeService, UIManager, AnimationService } = require('../../script.js');

const DOM = `
    <div id="modeSwitch"><button data-mode="secret-santa"></button><button data-mode="bad-santa"></button></div>
    <input type="checkbox" id="showBadSantaToggle">
    <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><div id="hanukkahContainer"></div><p id="loadingText"></p></div>
    <input id="firstNameInput"><input id="lastNameInput"><input id="groupInput"><input id="wishlistInput">
    <button id="addBtn"></button><ul id="nameList"></ul>
    <button id="shuffleBtn"></button><button id="resetBtn"></button>
    <div id="resultsSection" class="hidden"></div><div id="resultsList"></div><p id="errorMsg"></p>`;

const toggle = () => document.getElementById('showBadSantaToggle');
const makeUI = () => new UIManager(new GiftExchangeService(), new AnimationService());
const flip = (on) => {
    toggle().checked = on;
    toggle().dispatchEvent(new Event('change'));
};

describe('Show Bad Santa setting', () => {
    beforeEach(() => {
        document.body.innerHTML = DOM;
        document.body.className = '';
        delete document.body.dataset.mode;
        localStorage.clear();
    });

    test('Bad Santa is hidden by default', () => {
        makeUI();
        expect(toggle().checked).toBe(false);
        expect(document.body.classList.contains('bad-santa-off')).toBe(true);
    });

    test('turning it on shows Bad Santa right away and is remembered', () => {
        makeUI();
        flip(true);
        expect(document.body.classList.contains('bad-santa-off')).toBe(false);
        expect(localStorage.getItem('giftExchange.showBadSanta')).toBe('true');

        document.body.innerHTML = DOM;
        makeUI();
        expect(toggle().checked).toBe(true);
        expect(document.body.classList.contains('bad-santa-off')).toBe(false);
    });

    test('turning it off while playing Bad Santa goes back to Secret Santa', () => {
        localStorage.setItem('giftExchange.showBadSanta', 'true');
        makeUI();
        const toSecretSanta = jest.fn();
        document.querySelector('[data-mode="secret-santa"]').addEventListener('click', toSecretSanta);
        document.body.dataset.mode = 'bad-santa';
        flip(false);
        expect(document.body.classList.contains('bad-santa-off')).toBe(true);
        expect(toSecretSanta).toHaveBeenCalled();
        expect(localStorage.getItem('giftExchange.showBadSanta')).toBe('false');
    });
});
