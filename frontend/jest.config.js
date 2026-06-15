module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/src/testing/*.test.{ts,tsx}"],
  watchPathIgnorePatterns: ["<rootDir>/src/testing/e2e"],
  modulePathIgnorePatterns: ["<rootDir>/src/testing/e2e"],

  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },
  setupFilesAfterEnv: ["<rootDir>/src/testing/setupTests.ts"],
  moduleNameMapper: {
    "\\.css$": "<rootDir>/src/testing/mocks/styleMock.js",
  },
};
