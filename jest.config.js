module.exports = {
    testEnvironment: 'jsdom',
    testMatch: ['**/tests/unit/**/*.test.js', '**/tests/architecture/**/*.test.js'],
    // Agent worktrees live under <root>/.claude/ — their tests belong to their own runs.
    // Anchored to <rootDir> so a run *inside* a worktree (whose path contains .claude/) still works.
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/\\.claude/'],
    modulePathIgnorePatterns: ['<rootDir>/\\.claude/'],
    // Coverage is opt-in (npm run test:coverage) so plain test runs don't rewrite coverage/.
    collectCoverage: false,
    coverageReporters: ['text', 'lcov'],
    collectCoverageFrom: ['script.js', 'scripts/serve.js'],
};
