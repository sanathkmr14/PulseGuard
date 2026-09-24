export default {
    testEnvironment: 'node',
    transform: {}, // Disable transforms for native ESM
    setupFiles: ['./tests/setup-env.js'],
    setupFilesAfterEnv: ['./tests/setup.js'],
    verbose: true,
    testMatch: ['**/tests/**/*.test.js'],
    roots: ['<rootDir>/tests']
};
