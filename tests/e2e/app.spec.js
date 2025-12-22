const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Gift Exchange App', () => {
    test.beforeEach(async ({ page }) => {
        // Load the local index.html file
        const filePath = path.resolve(__dirname, '../../index.html');
        await page.goto(`file://${filePath}`);
    });

    test('should add a name to the list', () => {
        return async ({ page }) => {
            await page.fill('#firstNameInput', 'John');
            await page.fill('#lastNameInput', 'Doe');
            await page.click('#addBtn');

            const listItems = page.locator('#nameList li');
            await expect(listItems).toHaveCount(1);
            await expect(listItems.first()).toContainText('John Doe');
        };
    });

    test('should show error for duplicate name', () => {
        return async ({ page }) => {
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
        };
    });

    test('should shuffle and show results', () => {
        return async ({ page }) => {
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
        };
    });

    test('should support bulk import', () => {
        return async ({ page }) => {
            await page.click('#toggleBulkBtn');
            await page.fill('#bulkInput', 'Alice A [GroupA], Bob B [GroupB]');
            await page.click('#importBtn');

            const listItems = page.locator('#nameList li');
            await expect(listItems).toHaveCount(2);
        };
    });
});
