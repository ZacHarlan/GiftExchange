const { test, expect } = require('@playwright/test');

test.describe('Guided tour', () => {
    test('first visit invites; the tour spotlights each part and is remembered', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#tourInvite')).toBeVisible();
        await expect(page.locator('#tourOverlay')).toBeHidden(); // no uninvited pop-up

        await page.click('#tourInviteStart');
        await expect(page.locator('#tourOverlay')).toBeVisible();
        await expect(page.locator('#tourTitle')).toHaveText('Welcome! 🎄');
        await expect(page.locator('#tourSpotlight')).toBeHidden();

        await page.click('#tourNext');
        await expect(page.locator('#tourTitle')).toHaveText('Add everyone');
        await expect(page.locator('#tourSpotlight')).toBeVisible();

        // The spotlight sits around the name inputs, and the card doesn't cover them.
        // Wait for the smooth scroll and the slide-in transitions to finish first.
        const boxes = async () => JSON.stringify([
            await page.locator('#tourSpotlight').boundingBox(),
            await page.locator('#tourCard').boundingBox(),
        ]);
        let last = '';
        await expect.poll(async () => {
            const now = await boxes();
            const settled = now === last;
            last = now;
            return settled;
        }, { intervals: [150] }).toBe(true);
        const spot = await page.locator('#tourSpotlight').boundingBox();
        const inputs = await page.locator('.input-group').boundingBox();
        const card = await page.locator('#tourCard').boundingBox();
        expect(spot.x).toBeLessThanOrEqual(inputs.x);
        expect(spot.y).toBeLessThanOrEqual(inputs.y);
        expect(spot.x + spot.width).toBeGreaterThanOrEqual(inputs.x + inputs.width);
        const overlaps = card.y < spot.y + spot.height && card.y + card.height > spot.y;
        expect(overlaps).toBe(false);

        // Results aren't on screen yet, so that step falls back to a centered card.
        const total = Number((await page.locator('#tourProgress').textContent()).split(' of ')[1]);
        for (let i = 2; i < total; i++) await page.keyboard.press('ArrowRight');
        await expect(page.locator('#tourNext')).toHaveText('Let’s go!');
        await page.click('#tourNext');
        await expect(page.locator('#tourOverlay')).toBeHidden();

        await page.reload();
        await expect(page.locator('#tourInvite')).toBeHidden();

        // "How it works" replays it; Escape closes.
        await page.click('#tourBtn');
        await expect(page.locator('#tourTitle')).toHaveText('Welcome! 🎄');
        await page.keyboard.press('Escape');
        await expect(page.locator('#tourOverlay')).toBeHidden();
    });

    test('works on a phone-sized screen', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 700 });
        await page.goto('/');
        await page.click('#tourBtn');
        await page.click('#tourNext');
        const card = await page.locator('#tourCard').boundingBox();
        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.x + card.width).toBeLessThanOrEqual(375);
        expect(card.y + card.height).toBeLessThanOrEqual(700);
    });
});
