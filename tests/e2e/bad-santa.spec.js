const { test, expect } = require('@playwright/test');

test.describe('Bad Santa', () => {
    test('plays a short game: draw, unwrap, steal, refresh mid-game, final steal, summary', async ({ page }) => {
        await page.goto('/');

        // Players come from the Secret Santa list.
        await page.click('#toggleBulkBtn');
        await page.fill('#bulkInput', 'Ann Frost [A], Ben Pike [B], Cy Lane [C]');
        await page.click('#importBtn');
        await expect(page.locator('#nameList li')).toHaveCount(3);

        // Bad Santa is hidden until it's turned on in Settings.
        await expect(page.locator('#modeSwitch')).toBeHidden();
        await page.click('#toggleSettingsBtn');
        await page.click('label[for="showBadSantaToggle"]');
        await page.click('#toggleSettingsBtn');
        await page.click('#modeSwitch [data-mode="bad-santa"]');
        await expect(page.locator('#badSantaSection')).toBeVisible();
        await expect(page.locator('.input-section')).toBeHidden();
        await expect(page.locator('#badSantaSection')).toContainText('3 players from your list');

        await page.click('[data-action="draw"]');
        await expect(page.locator('.bs-draw-item')).toHaveCount(3);
        await page.click('[data-action="start-turns"]');
        await expect(page.locator('.bs-turn-label')).toHaveText('Turn 1 of 3');

        // #1 unwraps.
        await page.fill('#bsGiftInput', 'Bluetooth speaker');
        await page.click('.bs-open-btn');
        await expect(page.locator('.bs-gift-name')).toHaveText(['Bluetooth speaker']);

        // #2 steals it -> #1 has to go again and can't steal it back.
        await expect(page.locator('.bs-turn-label')).toHaveText('Turn 2 of 3');
        await page.click('[data-action="steal"][data-gift="g1"]');
        await expect(page.locator('.bs-robbed')).toBeVisible();
        await expect(page.locator('.bs-steals')).toHaveText(['Stolen 1/3']);

        // Refresh mid-chain: the game resumes in Bad Santa mode.
        await page.reload();
        await expect(page.locator('#badSantaSection')).toBeVisible();
        await expect(page.locator('.bs-robbed')).toBeVisible();
        await expect(page.locator('[data-action="steal"][data-gift="g1"]')).toBeDisabled();

        await page.fill('#bsGiftInput', 'Coffee mug');
        await page.click('.bs-open-btn');
        await expect(page.locator('.bs-turn-label')).toHaveText('Turn 3 of 3');
        await page.fill('#bsGiftInput', 'Wool hat');
        await page.click('.bs-open-btn');

        // Player #1's final steal, then the summary.
        await expect(page.locator('.bs-turn-label')).toHaveText('Final steal');
        await page.click('[data-action="keep"]');
        await expect(page.locator('.bs-result')).toHaveCount(3);
        await expect(page.locator('.bs-done')).toContainText('Bluetooth speaker');
        await expect(page.locator('.bs-done')).toContainText('Coffee mug');
        await expect(page.locator('.bs-done')).toContainText('Wool hat');

        // Back to Secret Santa: the list is still there.
        await page.click('#modeSwitch [data-mode="secret-santa"]');
        await expect(page.locator('#nameList li')).toHaveCount(3);
        await expect(page.locator('#badSantaSection')).toBeHidden();
    });
});
