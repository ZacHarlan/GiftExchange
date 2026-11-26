const { test, expect } = require('@playwright/test');

async function addPerson(page, first, last) {
    await page.fill('#firstNameInput', first);
    await page.fill('#lastNameInput', last);
    await page.click('#addBtn');
}

async function shuffle(page) {
    await page.click('#shuffleBtn');
    const overlay = page.locator('#loadingOverlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toBeHidden({ timeout: 10000 });
}

test.describe('Guaranteed matches', () => {
    test('a match set in Settings is in the results, is remembered, and a wrong name is explained', async ({ page }) => {
        await page.goto('/');
        for (const [first, last] of [['Ann', 'Avery'], ['Ben', 'Brooks'], ['Cal', 'Carter'], ['Dee', 'Dunn'], ['Eve', 'Ellis']]) {
            await addPerson(page, first, last);
        }

        await page.click('#toggleSettingsBtn');
        await page.fill('#guaranteedInput', 'Dee Dunn -> Ann Avery');
        await page.click('#saveCoreFamiliesBtn');

        await shuffle(page);
        await expect(page.locator('.result-card')).toHaveCount(5);
        const deeCard = page.locator('.result-card', { hasText: 'Dee Dunn' }).filter({ hasText: 'Ann Avery' });
        await expect(deeCard).toHaveCount(1);

        // Remembered after a reload, with the list.
        await page.reload();
        await expect(page.locator('#guaranteedInput')).toHaveValue('Dee Dunn -> Ann Avery');
        await expect(page.locator('#nameList li')).toHaveCount(5);

        // A name that is not on the list stops the draw and says why.
        await page.click('#toggleSettingsBtn');
        await page.fill('#guaranteedInput', 'Dee Dunn -> Zed Zimmer');
        await page.click('#shuffleBtn');
        await expect(page.locator('#errorMsg')).toContainText('“Zed Zimmer” isn’t on the list');
        await expect(page.locator('#resultsSection')).toBeHidden();
    });
});
