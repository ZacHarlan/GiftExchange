module.exports = {
    testEnvironment: 'jsdom',
    testMatch: ['**/tests/unit/**/*.test.js', '**/tests/architecture/**/*.test.js'],
    // Coverage is opt-in (npm run test:coverage) so plain test runs don't rewrite coverage/.
    collectCoverage: false,
    coverageReporters: ['text', 'lcov'],
    collectCoverageFrom: ['script.js', 'scripts/serve.js'],
};
