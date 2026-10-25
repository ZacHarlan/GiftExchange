const { defineConfig } = require('@playwright/test');

const PORT = Number(process.env.PORT || 8085);

module.exports = defineConfig({
    testDir: './tests/e2e',
    testMatch: '**/*.spec.js',
    use: {
        baseURL: `http://localhost:${PORT}`,
        headless: true,
        viewport: { width: 1280, height: 720 },
    },
    // Starts scripts/serve.js unless init.sh already has it running.
    webServer: {
        command: 'node scripts/serve.js',
        url: `http://localhost:${PORT}/health`,
        reuseExistingServer: true,
        env: { PORT: String(PORT) },
    },
});
