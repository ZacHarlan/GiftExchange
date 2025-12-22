module.exports = {
    testEnvironment: 'jsdom',
    testMatch: ['**/tests/unit/**/*.test.js'],
    collectCoverage: true,
    coverageReporters: ['text', 'lcov'],
    collectCoverageFrom: ['script.js'],
};
