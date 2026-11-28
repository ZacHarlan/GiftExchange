const { test, expect } = require('@playwright/test');

test.describe('Countdown to Christmas', () => {
    test('opens from the main page, counts down over a drawn night scene, and closes', async ({ page }) => {
        await page.clock.install({ time: new Date(2026, 10, 28, 8, 17, 30) });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        const land = page.waitForResponse(r => /assets\/countdown-land\.webp/.test(r.url()));
        await page.goto('/');
        expect((await land).status()).toBe(200);      // the rendered picture of Bethlehem and the Nativity
        await expect(page.locator('#countdownBtn')).toContainText('27 sleeps until Christmas');
        await expect(page.locator('#countdownScreen')).toBeHidden();

        await page.click('#countdownBtn');
        const screen = page.locator('#countdownScreen');
        await expect(screen).toBeVisible();
        await expect(page.locator('#countdownTitle')).toHaveText('Christmas is coming');
        await expect(page.locator('[data-unit="days"] .cd-digits')).toHaveAttribute('data-value', '26');
        await expect(page.locator('[data-unit="hours"] .cd-digits')).toHaveAttribute('data-value', '15');
        await expect(page.locator('#countdownSleeps')).toHaveText('27 sleeps to go');
        await expect(page.locator('#countdownVerse')).toContainText('Glory to God in the highest');
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

    test('snow falls behind the gift picker but not over Bethlehem', async ({ page }) => {
        await page.clock.install({ time: new Date(2026, 11, 20, 18, 0, 0) });
        await page.goto('/');
        await page.clock.runFor(500);
        const lit = await page.evaluate(() => {
            const c = document.getElementById('snowCanvas');
            const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
            let n = 0;
            for (let i = 3; i < data.length; i += 4) if (data[i] > 40) n++;
            return n / (c.width * c.height);
        });
        expect(lit).toBeGreaterThan(0.0005);              // it is snowing on the gift picker

        await page.click('#countdownBtn');
        await expect(page.locator('#countdownScreen')).toBeVisible();
        await expect(page.locator('#countdownScreen canvas')).toHaveCount(1);   // just the scene: no snow layer
        await expect(page.locator('#countdownSnow')).toHaveCount(0);
    });

    test('snow is heavier close to Christmas than a month before', async ({ browser }) => {
        const share = async when => {
            const page = await browser.newPage();
            await page.clock.install({ time: when });
            await page.goto('/');
            await page.clock.runFor(500);
            const n = await page.evaluate(() => {
                const c = document.getElementById('snowCanvas');
                const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                let k = 0;
                for (let i = 3; i < data.length; i += 4) if (data[i] > 40) k++;
                return k;
            });
            await page.close();
            return n;
        };
        const november = await share(new Date(2026, 10, 20, 18, 0, 0));
        const midDecember = await share(new Date(2026, 11, 12, 18, 0, 0));
        const eve = await share(new Date(2026, 11, 24, 18, 0, 0));
        expect(midDecember).toBeGreaterThan(november * 1.5);
        expect(eve).toBeGreaterThan(midDecember * 1.3);
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
