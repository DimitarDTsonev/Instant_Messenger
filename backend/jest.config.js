/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/src/__tests__/**/*.test.js"],
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/db/seed.js",
    "!src/db/database.js",   // SQLite connection setup — pure infrastructure, no app logic
  ],
  coverageThreshold: {
    global: {
      lines:      90,
      functions:  90,
      branches:   85,
      statements: 90,
    },
  },
};
