/**
 * @jest-environment jsdom
 */

const { EventDetails, GiftExchangeService, UIManager, AnimationService } = require('../../script.js');

const day = (y, m, d) => new Date(y, m - 1, d, 15, 30); // mid-afternoon local time

describe('EventDetails (budget, date, countdown)', () => {
    test('formats the budget: bare numbers get a $', () => {
        expect(EventDetails.formatBudget('50')).toBe('$50');
        expect(EventDetails.formatBudget(' 25.50 ')).toBe('$25.50');
        expect(EventDetails.formatBudget('€40')).toBe('€40');
        expect(EventDetails.formatBudget('about $20')).toBe('about $20');
        expect(EventDetails.formatBudget('  ')).toBe('');
    });

    test('daysUntil counts calendar days in local time', () => {
        const today = day(2026, 12, 20);
        expect(EventDetails.daysUntil('2026-12-24', today)).toBe(4);
        expect(EventDetails.daysUntil('2026-12-21', today)).toBe(1);
        expect(EventDetails.daysUntil('2026-12-20', today)).toBe(0);
        expect(EventDetails.daysUntil('2026-12-19', today)).toBe(-1);
        expect(EventDetails.daysUntil('2027-01-01', today)).toBe(12);
        expect(EventDetails.daysUntil('', today)).toBeNull();
        expect(EventDetails.daysUntil('nonsense', today)).toBeNull();
    });

    test('describe builds the banner pieces and the countdown wording', () => {
        const today = day(2026, 12, 12);
        expect(EventDetails.describe({ budget: '50', date: '2026-12-24' }, today)).toEqual({
            budget: '$50 limit',
            date: 'Thu, Dec 24',
            countdown: '12 days to go',
            snow: 'heavy',
        });
        expect(EventDetails.describe({ date: '2026-12-13' }, today).countdown).toBe('Tomorrow!');
        expect(EventDetails.describe({ date: '2026-12-12' }, today).countdown).toBe("Today's the day! 🎉");
        expect(EventDetails.describe({ date: '2026-12-01' }, today).countdown).toBe('');
        expect(EventDetails.describe({}, today)).toEqual({ budget: '', date: '', countdown: '', snow: 'normal' });
    });

    test('snow gets heavier as the day approaches', () => {
        const snowOn = (date) => EventDetails.describe({ date }, day(2026, 12, 1)).snow;
        expect(snowOn('2027-01-20')).toBe('normal'); // 50 days out
        expect(snowOn('2026-12-15')).toBe('heavy');  // 14 days
        expect(snowOn('2026-12-04')).toBe('blizzard'); // 3 days
        expect(snowOn('2026-12-01')).toBe('blizzard'); // today
        expect(snowOn('2026-11-20')).toBe('normal'); // already past
    });

    test('summaryLine is used in copied and emailed results', () => {
        expect(EventDetails.summaryLine({ budget: '50', date: '2026-12-24' })).toBe('Budget: $50 · Exchange: Thu, Dec 24');
        expect(EventDetails.summaryLine({ budget: '50' })).toBe('Budget: $50');
        expect(EventDetails.summaryLine({})).toBe('');
    });
});

describe('UIManager: event banner', () => {
    function setupDOM() {
        document.body.innerHTML = `
            <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><p id="loadingText"></p></div>
            <div id="eventBanner" class="hidden"></div>
            <input id="firstNameInput" /><input id="lastNameInput" /><input id="groupInput" /><input id="wishlistInput" />
            <button id="addBtn"></button><ul id="nameList"></ul>
            <button id="shuffleBtn"></button><button id="resetBtn" class="hidden"></button>
            <div id="resultsSection" class="hidden"></div><div id="resultsList"></div><p id="errorMsg"></p>
            <button id="toggleSettingsBtn"></button><div id="settingsSection" class="hidden"></div>
            <input id="budgetInput" /><input id="exchangeDateInput" type="date" />
            <input id="coreFamiliesInput" /><button id="saveCoreFamiliesBtn"></button>
            <button id="copyBtn">Copy results</button>`;
    }

    const memoryStore = () => ({ load: () => [], save() { }, clear() { } });

    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        setupDOM();
    });
    afterEach(() => {
        jest.useRealTimers();
        localStorage.clear();
    });

    test('saving budget and date shows the banner, persists, and sets the snow level', () => {
        const ui = new UIManager(new GiftExchangeService(), new AnimationService(), memoryStore());
        ui.now = () => day(2026, 12, 20);
        expect(document.getElementById('eventBanner').classList.contains('hidden')).toBe(true);

        document.getElementById('budgetInput').value = '50';
        document.getElementById('exchangeDateInput').value = '2026-12-24';
        document.getElementById('saveCoreFamiliesBtn').click();

        const banner = document.getElementById('eventBanner');
        expect(banner.classList.contains('hidden')).toBe(false);
        expect(banner.textContent).toContain('$50 limit');
        expect(banner.textContent).toContain('Thu, Dec 24');
        expect(banner.textContent).toContain('4 days to go');
        expect(document.body.dataset.snow).toBe('heavy'); // 4 days out
        expect(localStorage.getItem('giftExchange.budget')).toBe('50');
        expect(localStorage.getItem('giftExchange.date')).toBe('2026-12-24');
    });

    test('saved budget and date load on startup', () => {
        localStorage.setItem('giftExchange.budget', '$30');
        localStorage.setItem('giftExchange.date', '2026-12-25');
        new UIManager(new GiftExchangeService(), new AnimationService(), memoryStore());
        expect(document.getElementById('budgetInput').value).toBe('$30');
        expect(document.getElementById('exchangeDateInput').value).toBe('2026-12-25');
        expect(document.getElementById('eventBanner').textContent).toContain('$30 limit');
    });

    test('copied results start with the budget and date', async () => {
        navigator.clipboard = { writeText: jest.fn(() => Promise.resolve()) };
        localStorage.setItem('giftExchange.budget', '50');
        localStorage.setItem('giftExchange.date', '2026-12-24');
        const service = new GiftExchangeService();
        const ui = new UIManager(service, new AnimationService(), memoryStore());
        service.addPerson('Alice', 'A');
        service.addPerson('Bob', 'B');
        ui.displayResults(service.shuffleAndAssign());
        ui.handleCopy();
        const text = navigator.clipboard.writeText.mock.calls[0][0];
        expect(text.split('\n')[0]).toBe('Budget: $50 · Exchange: Thu, Dec 24');
        expect(text).toMatch(/Alice A -> Bob B|Bob B -> Alice A/);
    });
});
