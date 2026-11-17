const { test, expect } = require('@playwright/test');

test.describe('Analytics', () => {
    test('nothing is sent to Google away from the live site (localhost, tests)', async ({ page }) => {
        const google = [];
        page.on('request', r => {
            if (/googletagmanager\.com|google-analytics\.com|analytics\.google\.com/.test(r.url())) google.push(r.url());
        });
        await page.goto('/');
        await page.click('#tourBtn'); // an action that is tracked on the live site
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        expect(google).toEqual([]);
        expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(0);
        expect(await page.evaluate(() => typeof window.dataLayer)).toBe('undefined');
    });
});
