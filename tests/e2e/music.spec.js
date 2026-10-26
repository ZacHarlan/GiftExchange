const { test, expect } = require('@playwright/test');

test.describe('Background music', () => {
    test('starts quietly after the first click, and the 🎵 button turns it off and remembers', async ({ page }) => {
        await page.goto('/');
        const music = page.waitForRequest(/assets\/music-christmas\.mp3/);
        await page.click('#firstNameInput'); // any first interaction
        await music;
        await expect(page.locator('#musicToggle')).toHaveAttribute('aria-pressed', 'true');

        await page.click('#musicToggle');
        await expect(page.locator('#musicToggle')).toHaveAttribute('aria-pressed', 'false');
        await page.reload();
        await expect(page.locator('#musicToggle')).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator('#musicToggle')).toHaveClass(/muted/);
    });
});
