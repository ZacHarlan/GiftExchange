const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    testMatch: '**/*.spec.js',
    use: {
        headless: true,
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
    },
});
