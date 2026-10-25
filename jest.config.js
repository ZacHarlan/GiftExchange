module.exports = {
    testEnvironment: 'jsdom',
    testMatch: ['**/tests/unit/**/*.test.js', '**/tests/architecture/**/*.test.js'],
    // Agent worktrees live under .claude/ — their tests belong to their own runs.
    testPathIgnorePatterns: ['/node_modules/', '/\\.claude/'],
    modulePathIgnorePatterns: ['/\\.claude/'],
    // Coverage is opt-in (npm run test:coverage) so plain test runs don't rewrite coverage/.
    collectCoverage: false,
    coverageReporters: ['text', 'lcov'],
    collectCoverageFrom: ['script.js', 'scripts/serve.js'],
};
