"use strict";

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  watchPathIgnorePatterns: ["__fixtures__/output"],
  testTimeout: 30000,
};
