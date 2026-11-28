const { test, expect } = require('@playwright/test');

test.describe('Countdown to Christmas', () => {
    test('opens from the main page, counts down over a drawn night scene, and closes', async ({ page }) => {
        await page.clock.install({ time: new Date(2026, 10, 28, 8, 17, 30) });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto('/');
        await expect(page.locator('#countdownBtn')).toContainText('27 sleeps until Christmas');
        await expect(page.locator('#countdownScreen')).toBeHidden();

        await page.click('#countdownBtn');
        const screen = page.locator('#countdownScreen');
        await expect(screen).toBeVisible();
        await expect(page.locator('#countdownTitle')).toHaveText('Christmas is coming');
        await expect(page.locator('[data-unit="days"] .cd-digits')).toHaveAttribute('data-value', '26');
        await expect(page.locator('[data-unit="hours"] .cd-digits')).toHaveAttribute('data-value', '15');
        await expect(page.locator('#countdownSleeps')).toHaveText('27 sleeps to go');
        await expect(page).toHaveURL(/#countdown$/);

        // The seconds really tick.
        const before = await page.locator('[data-unit="seconds"] .cd-digits').getAttribute('data-value');
        await page.clock.runFor(3000);
        await expect(page.locator('[data-unit="seconds"] .cd-digits')).not.toHaveAttribute('data-value', before);

        // The scene is actually painted: the sky canvas is not blank, and it fills the screen.
        const painted = await page.evaluate(() => {
            const c = document.getElementById('countdownSky');
            const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            const colours = new Set();
            for (let i = 0; i < data.length; i += 4 * 997) colours.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
            return { colours: colours.size, width: c.clientWidth, height: c.clientHeight };
        });
        expect(painted.colours).toBeGreaterThan(12);
        expect(painted.width).toBe(page.viewportSize().width);
        expect(painted.height).toBe(page.viewportSize().height);

        await page.keyboard.press('Escape');
        await expect(screen).toBeHidden();
        await expect(page).not.toHaveURL(/#countdown/);
        expect(errors).toEqual([]);
    });

    test('the finale link runs the last seconds and arrives at Merry Christmas', async ({ page }) => {
        await page.clock.install({ time: new Date(2026, 10, 28, 8, 17, 30) });
        await page.goto('/#countdown=finale');
        await expect(page.locator('#countdownScreen')).toBeVisible();
        await page.clock.runFor(12000);
        await expect(page.locator('#countdownScreen')).toHaveClass(/final-ten/);
        await expect(page.locator('#countdownBig')).toBeVisible();
        await page.clock.runFor(10000);
        await expect(page.locator('#countdownTitle')).toHaveText('Merry Christmas!');
        await expect(page.locator('#countdownClock')).toBeHidden();
    });

    test('fits a phone screen without anything spilling off the side', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/#countdown');
        await expect(page.locator('#countdownClock')).toBeVisible();
        const box = await page.locator('#countdownClock').boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
        const title = await page.locator('#countdownTitle').boundingBox();
        expect(title.x + title.width).toBeLessThanOrEqual(390);
    });
});
