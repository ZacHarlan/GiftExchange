/**
 * @jest-environment jsdom
 */

// Regression: a pasted list like
//     Ann Frost, [Frost 1],
//     Ben Frost, [Frost 2],
// put a comma between each name and its [family]. The importer split on commas, so the
// name lost its family (defaulting everyone to "Frost") and the bare "[Frost 1]" was dropped.

const { GiftExchangeService, UIManager, AnimationService } = require('../../script.js');

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

function importText(text) {
    const service = new GiftExchangeService();
    const ui = new UIManager(service, new AnimationService(), memoryStore());
    document.getElementById('bulkInput').value = text;
    ui.handleBulkImport();
    return service.getPeople().map(p => `${p.getFullName()} | ${p.familyGroup}${p.wishlist ? ' | ' + p.wishlist : ''}`);
}

describe('bulk import: family/wishlist separated from the name by a comma', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        setupDOM();
    });
    afterEach(() => jest.useRealTimers());

    test('one person per line with ", [Family]," keeps each family', () => {
        const pasted = [
            'Ann Frost, [Frost 1],',
            'Ben Frost, [Frost 1],',
            'Cal Frost, [Frost 2],',
            'Dee Frost, [Frost 2],',
            'Eve Pike, [Pike],',
            'Fay Pike, [Pike 2],',
            'Gus Lane, [Frost 3],',
            'Hal Lane, [Pike 2]',
        ].join('\n');

        expect(importText(pasted)).toEqual([
            'Ann Frost | Frost 1',
            'Ben Frost | Frost 1',
            'Cal Frost | Frost 2',
            'Dee Frost | Frost 2',
            'Eve Pike | Pike',
            'Fay Pike | Pike 2',
            'Gus Lane | Frost 3',
            'Hal Lane | Pike 2',
        ]);
    });

    test('a separated {wishlist} attaches to the person before it, in either order', () => {
        expect(importText('Ann Frost, [Frost 1], {Books}, Ben Frost, {Tea}, [Frost 2]')).toEqual([
            'Ann Frost | Frost 1 | Books',
            'Ben Frost | Frost 2 | Tea',
        ]);
    });

    test('the original one-line format still works', () => {
        expect(importText('Ann Frost [Frost 1] {Books}, Ben Frost [Frost 2], Cy Pike')).toEqual([
            'Ann Frost | Frost 1 | Books',
            'Ben Frost | Frost 2',
            'Cy Pike | Pike',
        ]);
    });

    test('names on separate lines without commas are separate people', () => {
        expect(importText('Ann Frost [Frost 1]\nBen Frost [Frost 2]\n\nCy Pike')).toEqual([
            'Ann Frost | Frost 1',
            'Ben Frost | Frost 2',
            'Cy Pike | Pike',
        ]);
    });

    test('a [family] with no name before it is ignored, not applied to the next person', () => {
        expect(importText('[Frost 9], Ann Frost [Frost 1]')).toEqual(['Ann Frost | Frost 1']);
    });
});
