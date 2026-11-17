/**
 * @jest-environment jsdom
 */

const { AnalyticsService, AnimationService, GiftExchangeService, UIManager } = require('../../script.js');

const LIVE_HOST = 'zacharlan.github.io';
const ID = 'G-TEST123456';

// A live service wired to a fake window, so nothing real is loaded.
function liveService(overrides = {}) {
    const global = { location: { hostname: LIVE_HOST } };
    const loadScript = jest.fn();
    const analytics = new AnalyticsService({ measurementId: ID, global, loadScript, ...overrides });
    return { analytics, global, loadScript };
}

// gtag pushes `arguments` objects; turn them into arrays to compare.
const sent = global => (global.dataLayer || []).map(args => Array.from(args));

describe('AnalyticsService', () => {
    test('on the live site it loads gtag.js for the property and configures it once', () => {
        const { analytics, global, loadScript } = liveService();
        analytics.start();
        analytics.start();
        expect(loadScript).toHaveBeenCalledTimes(1);
        expect(loadScript).toHaveBeenCalledWith(`https://www.googletagmanager.com/gtag/js?id=${ID}`);
        const calls = sent(global);
        expect(calls[0][0]).toBe('js');
        expect(calls[1]).toEqual(['config', ID]);
        // gtag.js ignores plain arrays: each entry must be an `arguments` object.
        expect(Object.prototype.toString.call(global.dataLayer[0])).toBe('[object Arguments]');
    });

    test('a GTM- tag loads gtm.js and sends no config command, as in Google\'s install snippet', () => {
        const { analytics, global, loadScript } = liveService({ measurementId: 'GTM-TEST123' });
        analytics.start();
        analytics.track('tour_start');
        expect(loadScript).toHaveBeenCalledWith('https://www.googletagmanager.com/gtm.js?id=GTM-TEST123');
        const calls = sent(global);
        expect(calls.map(c => c[0])).toEqual(['js', 'event']);
        expect(calls[1]).toEqual(['event', 'tour_start', {}]);
    });

    test('the shipped tag is the one issued for this site and is live on the Pages host', () => {
        const loadScript = jest.fn();
        const analytics = new AnalyticsService({ global: { location: { hostname: LIVE_HOST } }, loadScript });
        analytics.start();
        expect(loadScript).toHaveBeenCalledWith('https://www.googletagmanager.com/gtm.js?id=GTM-MF62QPXB');
    });

    test.each([
        ['no Measurement ID is set', { measurementId: '' }],
        ['the Measurement ID is malformed', { measurementId: 'UA-12345-1' }],
        ['the page is on localhost', { hostname: 'localhost' }],
        ['the page is opened from a file', { hostname: '' }],
        ['the page is on another host', { hostname: 'example.com' }],
    ])('stays off when %s', (_, overrides) => {
        const { analytics, global, loadScript } = liveService(overrides);
        analytics.start();
        analytics.track('tour_start');
        expect(analytics.live).toBe(false);
        expect(loadScript).not.toHaveBeenCalled();
        expect(global.dataLayer).toBeUndefined();
        expect(analytics.log).toEqual([{ name: 'tour_start', params: {} }]); // still logged for tests
    });

    test('the shipped default is off in tests (jsdom is localhost) and adds no script tag', () => {
        const analytics = new AnalyticsService();
        analytics.start();
        expect(analytics.live).toBe(false);
        expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
        expect(window.dataLayer).toBeUndefined();
    });

    test('appendScript adds an async script tag to the page head', () => {
        AnalyticsService.appendScript('https://www.googletagmanager.com/gtag/js?id=G-X');
        const tag = document.head.querySelector('script[src*="googletagmanager"]');
        expect(tag.async).toBe(true);
        tag.remove();
    });

    test('sends listed events with their listed parameters', () => {
        const { analytics, global } = liveService();
        analytics.start();
        analytics.track('draw_names', { participants: 6, theme: 'hanukkah' });
        analytics.track('share', { method: 'email' });
        expect(sent(global).slice(2)).toEqual([
            ['event', 'draw_names', { participants: 6, theme: 'hanukkah' }],
            ['event', 'share', { method: 'email' }],
        ]);
    });

    test('never sends personal data: unknown events, unknown parameters and free text are dropped', () => {
        const { analytics, global } = liveService();
        analytics.start();
        analytics.track('add_person', { name: 'Alice Smith' });
        analytics.track('draw_names', {
            participants: 4,
            theme: 'Alice Smith',            // free text in a listed parameter
            names: ['Alice Smith'],          // parameter that is not listed
            wishlist: 'a red bike',
        });
        analytics.track('share', { method: { toString: () => 'copy' } });
        expect(sent(global).slice(2)).toEqual([
            ['event', 'draw_names', { participants: 4 }],
            ['event', 'share', {}],
        ]);
        expect(JSON.stringify(sent(global))).not.toMatch(/Alice|bike/);
    });

    test('keeps only the 50 most recent events in the log', () => {
        const { analytics } = liveService();
        for (let i = 0; i < 60; i++) analytics.track('tour_start');
        expect(analytics.log).toHaveLength(50);
    });
});

describe('UIManager analytics', () => {
    beforeEach(() => localStorage.clear());

    function setup() {
        document.body.innerHTML = `
            <div id="loadingOverlay" class="hidden"><div id="giftIcon"></div><p id="loadingText"></p></div>
            <input id="firstNameInput" /><input id="lastNameInput" /><input id="groupInput" /><input id="wishlistInput" />
            <button id="addBtn"></button><ul id="nameList"></ul>
            <button id="shuffleBtn"></button><button id="resetBtn" class="hidden"></button>
            <div id="resultsSection" class="hidden"></div><div id="resultsList"></div><p id="errorMsg"></p>
            <button id="tourBtn"></button>
            <select id="themeSelect"><option value="christmas">c</option><option value="hanukkah">h</option></select>
            <button id="emailBtn"></button><button id="copyBtn"></button>
            <button id="printBtn"></button><div id="printSheet"></div>`;
        const { analytics, global } = liveService();
        const service = new GiftExchangeService();
        const animation = new AnimationService();
        animation.play = (theme, done) => done();
        const tour = { start: jest.fn(), isOpen: () => false };
        const storage = { getItem: () => null, setItem: () => { }, removeItem: () => { } };
        const { ParticipantStore, MatchHistory } = require('../../script.js');
        const ui = new UIManager(service, animation, new ParticipantStore(storage), new MatchHistory(storage),
            undefined, undefined, tour, undefined, analytics);
        ui.print = jest.fn();
        return { ui, service, analytics, global };
    }

    test('starts analytics when the app starts', () => {
        const { global } = setup();
        expect(sent(global)[1]).toEqual(['config', ID]);
    });

    test('a draw reports how many people and which theme, and nothing about who', () => {
        const { ui, service, analytics, global } = setup();
        [['Alice', 'Smith'], ['Bob', 'Jones'], ['Cara', 'Lee']].forEach(([f, l]) => service.addPerson(f, l));
        ui.handleShuffle();
        expect(analytics.log).toEqual([{ name: 'draw_names', params: { participants: 3, theme: 'christmas' } }]);
        expect(JSON.stringify(sent(global))).not.toMatch(/Alice|Smith|Bob|Jones|Cara|Lee/);
    });

    test('tour, theme change, email and print are reported', () => {
        const { ui, service, analytics } = setup();
        [['Alice', 'Smith'], ['Bob', 'Jones'], ['Cara', 'Lee']].forEach(([f, l]) => service.addPerson(f, l));
        document.getElementById('tourBtn').click();
        const select = document.getElementById('themeSelect');
        select.value = 'hanukkah';
        select.dispatchEvent(new Event('change'));
        ui.handleShuffle();
        ui.handlePrintTags();
        expect(analytics.log.map(e => [e.name, e.params])).toEqual([
            ['tour_start', {}],
            ['theme_change', { theme: 'hanukkah' }],
            ['draw_names', { participants: 3, theme: 'hanukkah' }],
            ['share', { method: 'print' }],
        ]);
    });

    test('a UIManager built without an analytics service sends nothing', () => {
        const { ui } = setup();
        const plain = new UIManager(new GiftExchangeService(), new AnimationService(), ui.participantStore, ui.matchHistory);
        expect(plain.analytics.live).toBe(false);
        expect(window.dataLayer).toBeUndefined();
    });
});
