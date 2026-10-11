module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'node16', moduleResolution: 'node16' } }],
  },
  testMatch: ['**/test/**/*.test.ts'],
}
