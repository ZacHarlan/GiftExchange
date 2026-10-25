const { test, expect } = require('@playwright/test');

test.describe('Gift Exchange App', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should add a name to the list', async ({ page }) => {
        await page.fill('#firstNameInput', 'John');
        await page.fill('#lastNameInput', 'Doe');
        await page.click('#addBtn');

        const listItems = page.locator('#nameList li');
        await expect(listItems).toHaveCount(1);
        await expect(listItems.first()).toContainText('John Doe');
    });

    test('should show error for duplicate name', async ({ page }) => {
        // Add first time
        await page.fill('#firstNameInput', 'John');
        await page.fill('#lastNameInput', 'Doe');
        await page.click('#addBtn');

        // Add second time
        await page.fill('#firstNameInput', 'John');
        await page.fill('#lastNameInput', 'Doe');
        await page.click('#addBtn');

        const errorMsg = page.locator('#errorMsg');
        await expect(errorMsg).toBeVisible();
        await expect(errorMsg).toContainText('already on the list');
    });

    test('should shuffle and show results', async ({ page }) => {
        // Add 2 people
        await page.fill('#firstNameInput', 'Alice');
        await page.fill('#lastNameInput', 'A');
        await page.fill('#groupInput', 'GroupA');
        await page.click('#addBtn');

        await page.fill('#firstNameInput', 'Bob');
        await page.fill('#lastNameInput', 'B');
        await page.fill('#groupInput', 'GroupB');
        await page.click('#addBtn');

        // Click Shuffle
        await page.click('#shuffleBtn');

        // Wait for animation overlay to appear and then disappear
        const overlay = page.locator('#loadingOverlay');
        await expect(overlay).toBeVisible();
        await expect(overlay).toBeHidden({ timeout: 10000 });

        // Verify results section
        const resultsSection = page.locator('#resultsSection');
        await expect(resultsSection).toBeVisible();

        const resultCards = page.locator('.result-card');
        await expect(resultCards).toHaveCount(2);
    });

    test('should support bulk import', async ({ page }) => {
        await page.click('#toggleBulkBtn');
        await page.fill('#bulkInput', 'Alice A [GroupA], Bob B [GroupB]');
        await page.click('#importBtn');

        const listItems = page.locator('#nameList li');
        await expect(listItems).toHaveCount(2);
    });

    test('should persist the participant list across reloads and clear it', async ({ page }) => {
        await page.click('#toggleBulkBtn');
        await page.fill('#bulkInput', 'Alice A [GroupA] {Books}, Bob B [GroupB]');
        await page.click('#importBtn');
        await expect(page.locator('#nameList li')).toHaveCount(2);

        await page.reload();
        await expect(page.locator('#nameList li')).toHaveCount(2);
        await expect(page.locator('#nameCount')).toHaveText('2');
        await expect(page.locator('#shuffleBtn')).toBeEnabled();

        page.once('dialog', dialog => dialog.accept());
        await page.click('#clearListBtn');
        await expect(page.locator('#nameList li')).toHaveCount(0);

        await page.reload();
        await expect(page.locator('#nameList li')).toHaveCount(0);
        await expect(page.locator('#emptyState')).toBeVisible();
    });

    test('should scroll the results into view after the shuffle animation', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.click('#toggleBulkBtn');
        await page.fill('#bulkInput', 'Al A [A], Bo B [B], Cy C [C], Di D [D], Ed E [E], Fy F [F]');
        await page.click('#importBtn');
        await expect(page.locator('#resultsSection')).toBeHidden();

        // Start from the top of the page (Playwright's clicks scroll on their own).
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.locator('#shuffleBtn').dispatchEvent('click');
        await expect(page.locator('#loadingOverlay')).toBeHidden({ timeout: 10000 });
        await expect(page.locator('#resultsSection h2')).toBeInViewport();
    });
});
