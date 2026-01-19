# Testing Patterns

**Analysis Date:** 2025-01-19

## Test Framework

**Runner:**
- Jest 29.x with ts-jest for TypeScript
- Config: individual `jest.config.js` in each package

**Assertion Library:**
- Built-in Jest matchers (`expect`)
- `@testing-library/jest-dom` for frontend DOM matchers

**E2E Framework:**
- Playwright for end-to-end testing

**Run Commands:**
```bash
# Run all unit tests across monorepo
npm run test:unit

# Run unit tests for specific package
npm run test:unit -w @viberator/orchestrator
npm run test:unit -w @viberator/platform-backend
npm run test:unit -w @viberator/frontend

# Run integration tests
npm run test:integration
npm run test:integration -w @viberator/platform-backend

# Run E2E tests
npm run test:e2e

# Setup E2E services
npm run test:e2e:setup

# Teardown E2E services
npm run test:e2e:teardown
```

## Test File Organization

**Location:**
- **Co-located for unit tests**: Place test files next to source files
  - `/home/jussi/Development/viberator/viberator/app/src/agents/AgentFactory.test.ts`
  - `/home/jussi/Development/viberator/viberator/app/src/services/GitService.test.ts`

**Naming:**
- Unit tests: `*.test.ts` or `*.test.tsx` (co-located)
- Integration tests: `*.integration.test.ts` (in `__tests__/integration/`)
- E2E tests: `*.e2e.test.ts` (in separate `e2e-tests/` package)

**Structure:**
```
viberator/
├── viberator/app/src/
│   ├── agents/
│   │   ├── AgentFactory.ts
│   │   └── AgentFactory.test.ts          # Co-located unit test
│   ├── services/
│   │   ├── GitService.ts
│   │   └── GitService.test.ts            # Co-located unit test
├── platform/backend/src/
│   ├── __tests__/integration/            # Integration tests only
│   │   ├── api.integration.test.ts
│   │   └── database.integration.test.ts
│   └── __tests__/helpers/                # Test utilities
│       ├── testContainers.ts
│       ├── testServer.ts
│       └── index.ts
├── platform/frontend/
│   ├── jest.setup.js
│   └── jest.config.js
└── e2e-tests/                            # Separate E2E test package
    ├── tests/
    │   └── example.e2e.test.ts
    ├── playwright/
    │   ├── fixtures.ts
    │   ├── setupServices.ts
    │   └── teardownServices.ts
    └── playwright.config.ts
```

## Test Structure

**Suite Organization:**

**Backend unit tests pattern from `/home/jussi/Development/viberator/viberator/app/src/agents/AgentFactory.test.ts`:**

```typescript
import { describe, it, expect, vi } from '@jest/globals';
import { AgentFactory } from './AgentFactory';

describe('AgentFactory', () => {
  describe('createAgent', () => {
    it('should create a Claude Code agent', () => {
      const config = {
        type: 'claude-code',
        apiKey: 'test-key',
      };
      const agent = AgentFactory.createAgent(config);
      expect(agent).toBeDefined();
      expect(agent.getType()).toBe('claude-code');
    });

    it('should throw error for unsupported agent type', () => {
      const config = {
        type: 'unsupported-agent',
        apiKey: 'test-key',
      };
      expect(() => AgentFactory.createAgent(config)).toThrow();
    });
  });
});
```

**Service test pattern from `/home/jussi/Development/viberator/viberator/app/src/services/GitService.test.ts`:**

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GitService } from './GitService';

describe('GitService', () => {
  let gitService: GitService;

  beforeEach(() => {
    gitService = new GitService('/tmp/test-repo');
  });

  afterEach(() => {
    // Cleanup if needed
  });

  describe('clone', () => {
    it('should clone a repository', async () => {
      const url = 'https://github.com/example/repo.git';
      const result = await gitService.clone(url);
      expect(result).toBeDefined();
    });

    it('should handle clone errors', async () => {
      const url = 'invalid-url';
      await expect(gitService.clone(url)).rejects.toThrow();
    });
  });
});
```

**Patterns:**
- Use `describe` blocks for test suites
- Nest `describe` for grouping related tests
- Use `beforeEach`/`afterEach` for per-test setup/teardown
- Use `beforeAll`/`afterAll` for suite-level setup/teardown
- Use `it` or `test` for individual test cases

## Mocking

**Framework:** Jest built-in mocking (`vi` from `@jest/globals`)

**Patterns:**
```typescript
import { vi } from '@jest/globals';

// Mock a module
vi.mock('../services/SomeService');

// Spy on a method
const spy = vi.spyOn(someObject, 'someMethod');

// Mock return value
spy.mockResolvedValue({ data: 'test' });

// Restore mock
spy.mockRestore();
```

**What to Mock:**
- External API calls (HTTP requests)
- Database queries (in unit tests)
- File system operations
- Third-party library dependencies

**What NOT to Mock:**
- Pure functions
- Data transformations
- Business logic

## Fixtures and Factories

**Test Data:**
- Use inline test data for simple cases
- Use factory functions for reusable test data

**Test Helpers from `/home/jussi/Development/viberator/platform/backend/src/__tests__/helpers/`:**

**`testContainers.ts` - Database test setup:**

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

export class TestDatabase {
  private static container: StartedPostgreSqlContainer | null = null;
  private static db: Kysely<any> | null = null;

  static async start(): Promise<{ connectionString: string; db: Kysely<any> }> {
    if (this.container) {
      return {
        connectionString: this.container.getConnectionUri(),
        db: this.db!,
      };
    }

    this.container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('testdb')
      .withUsername('test')
      .withPassword('test')
      .start();

    const pool = new Pool({
      connectionString: this.container.getConnectionUri(),
    });

    this.db = new Kysely<any>({
      dialect: new PostgresDialect(pool),
    });

    return {
      connectionString: this.container.getConnectionUri(),
      db: this.db,
    };
  }

  static async stop(): Promise<void> {
    if (this.db) {
      await this.db.destroy();
      this.db = null;
    }
    if (this.container) {
      await this.container.stop();
      this.container = null;
    }
  }
}

export async function setupTestDatabase(): Promise<{
  connectionString: string;
  db: Kysely<any>;
}> {
  return TestDatabase.start();
}

export async function teardownTestDatabase(): Promise<void> {
  await TestDatabase.stop();
}
```

**Location:**
- Test helpers: `/home/jussi/Development/viberator/platform/backend/src/__tests__/helpers/`
- E2E fixtures: `/home/jussi/Development/viberator/e2e-tests/playwright/fixtures.ts`

## Coverage

**Requirements:** No enforced coverage target

**View Coverage:**
```bash
# Run with coverage
npm run test:coverage -w @viberator/platform-backend
npm run test:coverage -w @viberator/orchestrator
npm run test:coverage -w @viberator/frontend
```

**Coverage collection from jest configs:**
```javascript
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/**/*.d.ts',
  '!src/**/index.ts'
],
```

## Test Types

**Unit Tests:**
- Scope: Individual functions, classes, React components
- Approach: Isolate the unit under test, mock dependencies
- Location: Co-located with source files as `*.test.ts`

**Integration Tests:**
- Scope: API endpoints, database interactions
- Approach: Use real services (testcontainers for database, supertest for HTTP)
- Location: `src/__tests__/integration/`

**Integration test pattern from `/home/jussi/Development/viberator/platform/backend/src/__tests__/integration/api.integration.test.ts`:**

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import { setupTestDatabase, teardownTestDatabase } from '../helpers';

describe('API Integration Tests', () => {
  let app: Express;
  let db: any;

  beforeAll(async () => {
    const testDb = await setupTestDatabase();
    db = testDb.db;

    app = express();
    app.use(express.json());

    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok' });
    });
  }, 30000);

  afterAll(async () => {
    await teardownTestDatabase();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
    });
  });
});
```

**E2E Tests:**
- Framework: Playwright
- Scope: Full application flows, cross-stack testing
- Location: Separate `e2e-tests/` package

**E2E test pattern from `/home/jussi/Development/viberator/e2e-tests/tests/example.e2e.test.ts`:**

```typescript
import { test, expect } from '../playwright/fixtures';

test.describe('Example E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the homepage', async ({ page }) => {
    await expect(page).toHaveTitle(/Viberator/);
  });

  test('should interact with a form', async ({ page }) => {
    await page.click('text=Login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe('API E2E Tests', () => {
  test('should call backend API', async ({ request, backendURL }) => {
    const response = await request.get(`${backendURL}/api/health`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('status');
  });
});
```

## Common Patterns

**Async Testing:**

```typescript
it('should handle async operations', async () => {
  const result = await someAsyncFunction();
  expect(result).toBe('expected');
});

it('should handle async errors', async () => {
  await expect(someAsyncFunction()).rejects.toThrow('Expected error');
});
```

**Error Testing:**

```typescript
it('should throw error for invalid input', () => {
  expect(() => AgentFactory.createAgent(config)).toThrow();
});

it('should handle errors gracefully', async () => {
  await expect(gitService.clone('invalid-url')).rejects.toThrow();
});
```

**Database integration testing:**

```typescript
describe('CRUD Operations', () => {
  it('should insert a record', async () => {
    const result = await db
      .insertInto('test_table')
      .values({ name: 'Test Record' })
      .returning('id')
      .execute();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBeDefined();
  });

  it('should update a record', async () => {
    const inserted = await db
      .insertInto('test_table')
      .values({ name: 'Update Test' })
      .returning('id')
      .execute();

    await db
      .updateTable('test_table')
      .set({ name: 'Updated Name' })
      .where('id', '=', inserted[0].id)
      .execute();

    const updated = await db
      .selectFrom('test_table')
      .where('id', '=', inserted[0].id)
      .selectAll()
      .executeFirst();

    expect(updated?.name).toBe('Updated Name');
  });

  it('should delete a record', async () => {
    const inserted = await db
      .insertInto('test_table')
      .values({ name: 'Delete Test' })
      .returning('id')
      .execute();

    await db
      .deleteFrom('test_table')
      .where('id', '=', inserted[0].id)
      .execute();

    const deleted = await db
      .selectFrom('test_table')
      .where('id', '=', inserted[0].id)
      .executeFirst();

    expect(deleted).toBeUndefined();
  });
});
```

## Jest Configuration

**Backend/Orchestrator (`jest.config.js`):**

```javascript
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/index.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
};
```

**Integration test config (`jest.integration.config.js`):**

```javascript
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  testMatch: ['**/*.integration.test.ts'],
  testTimeout: 60000,
  maxWorkers: 1,
};
```

**Frontend (`jest.config.js`):**

```javascript
import nextJest from 'next/jest'

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.tsx'],
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
}

export default createJestConfig(customJestConfig)
```

## Playwright Configuration

**`playwright.config.ts`:**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html'], ['list'], ['junit', { outputFile: 'test-results/junit.xml' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: [
    {
      command: 'npm run dev --prefix ../platform/frontend',
      port: 3000,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev --prefix ../platform/backend',
      port: 3001,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

**Custom fixtures (`e2e-tests/playwright/fixtures.ts`):**

```typescript
import { test as base } from '@playwright/test';

export interface E2EFixtures {
  baseURL: string;
  backendURL: string;
}

export const test = base.extend<E2EFixtures>({
  baseURL: async ({}, use) => {
    await use(process.env.BASE_URL || 'http://localhost:3000');
  },
  backendURL: async ({}, use) => {
    await use(process.env.BACKEND_URL || 'http://localhost:3001');
  },
});

export { expect } from '@playwright/test';
```

---

*Testing analysis: 2025-01-19*
