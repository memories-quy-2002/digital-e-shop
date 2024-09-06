/** @type {import('ts-jest').JestConfigWithTsJest} **/
/** @type { import('jest').Config } **/
const config = {
    preset: 'ts-jest',
    testEnvironment: "jsdom",
    testEnvironmentOptions: {
        url: 'https://localhost',
        referrer: 'https://localhost',
        performance: true,
    },
    setupFilesAfterEnv: ['../client/src/setupTests.ts'],
    setupFiles: ["../client/jest.setup.ts"],
    transformIgnorePatterns: [
        '/node_modules/(?!(axios|query-string)/)',
        '/node_modules/'
    ],
    transform: {
        "^.+\\.js$": "babel-jest",
        "^.+\\.jsx$": "babel-jest",
        "^.+\\.ts$": "ts-jest",
        "^.+\\.tsx$": "ts-jest"
    },
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
    moduleNameMapper: {
        "\\.(css|scss|less)$": "identity-obj-proxy",
        "^axios$": "axios/dist/node/axios.cjs",
    },
};
module.exports = config