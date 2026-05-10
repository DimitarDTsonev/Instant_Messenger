import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/src/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.test.json" }],
  },
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/db/seed.ts",
    "!src/db/database.ts",   // SQLite connection setup — pure infrastructure, no app logic
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

export default config;
