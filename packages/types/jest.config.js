/** @type {import('ts-jest').JestConfigWithTSJest} */
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/scripts"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: { module: "commonjs", target: "ES2022", esModuleInterop: true } },
    ],
  },
};
