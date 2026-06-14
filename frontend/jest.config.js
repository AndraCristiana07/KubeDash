module.exports = {
  testEnvironment: "jsdom",
  transform: {
    // Make sure the regex captures both ts and tsx extensions!
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json", // Ensures Jest reads your TSX configuration rules
      },
    ],
  },
  setupFilesAfterEnv: ["<rootDir>/src/testing/setupTests.ts"],
  moduleNameMapper: {
    // Identity mapping to stub out plain CSS stylesheets safely
    "\\.css$": "<rootDir>/src/testing/mocks/styleMock.js",
  },
};
