const customJestConfig = {
  preset: 'ts-jest/presets/default-esm',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/lib$': '<rootDir>/src/lib/index.test-stub.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
    // Workspace UI packages publish ESM-only builds; tests use their source.
    '^@viberglass/platform-ui$': '<rootDir>/../../packages/platform-ui/src/index.ts',
    '^@viberglass/integration-core/frontend$': '<rootDir>/../../packages/integration-core/src/frontend/index.ts',
    '^@viberglass/integration-([a-z-]+)/frontend$': '<rootDir>/../../packages/integrations/integration-$1/src/frontend/index.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
}

export default customJestConfig
