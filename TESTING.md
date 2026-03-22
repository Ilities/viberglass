# Testing Structure

This document describes the testing setup for the Viberator monorepo.

## Overview

The project has three layers of tests:

1. **Unit Tests** - Test individual functions, classes, and React components
2. **Integration Tests** - Test API endpoints and database interactions with testcontainers
3. **E2E Tests** - Test full application flows with Playwright

## Project Structure

```
viberator/
├── apps/viberator/
│   ├── src/
│   │   ├── agents/
│   │   │   ├── AgentFactory.ts
│   │   │   └── AgentFactory.test.ts      # Unit tests co-located
│   │   ├── services/
│   │   │   ├── GitService.ts
│   │   │   └── GitService.test.ts        # Unit tests co-located
│   │   └── __tests__/
│   │       └── integration/              # Integration tests only
│   └── jest.config.js
├── apps/platform-backend/
│   ├── src/
│   │   ├── services/
│   │   │   ├── UserService.ts
│   │   │   └── UserService.test.ts       # Unit tests co-located
│   │   └── __tests__/
│   │       ├── integration/              # Integration tests only
│   │       └── helpers/                  # Test utilities
│   ├── jest.config.js
│   └── jest.integration.config.js
├── apps/platform-frontend/
│   ├── src/
│   │   └── pages/
│   │       └── SomePage.tsx
│   │       └── SomePage.test.tsx         # Unit tests co-located
│   ├── components/
│   │   ├── Button.tsx
│   │   └── Button.test.tsx               # Unit tests co-located
│   ├── jest.config.js
│   └── jest.setup.js
└── tests/e2e/                            # Separate E2E test package
    ├── tests/                            # Playwright E2E tests
    ├── playwright/
    │   ├── fixtures.ts                   # Custom test fixtures
    │   ├── setupServices.ts              # Setup testcontainers
    │   └── teardownServices.ts           # Teardown testcontainers
    ├── docker/
    │   └── docker-compose.e2e.yaml       # Docker compose for E2E stack
    ├── playwright.config.ts
    └── package.json
```

## Test Location Rules

- **Unit Tests**: Place next to the file being tested (co-located)
  - Pattern: `Filename.test.ts` or `Filename.test.tsx`
  - Example: `UserService.ts` → `UserService.test.ts`

- **Integration Tests**: Place in `src/__tests__/integration/` directory
  - Pattern: `*.integration.test.ts`
  - Test database operations, API endpoints with testcontainers

- **E2E Tests**: Place in separate `tests/e2e/tests/` package
  - Pattern: `FeatureName.e2e.test.ts`
  - Test full user flows across the stack

## Unit Tests

Unit tests use Jest and test individual pieces of code in isolation.

### Running Unit Tests

```bash
# Run all unit tests
npm run test:unit

# Run unit tests for a specific package
npm run test:unit -w @viberator/orchestrator
npm run test:unit -w @viberglass/platform-backend
npm run test:unit -w @viberglass/frontend

# Run unit tests in watch mode
npm run test:watch -w @viberglass/platform-backend

# Run unit tests with coverage
npm run test:coverage -w @viberglass/platform-backend
```

### Writing Unit Tests

Unit tests should be placed in `__tests__/unit/` directories and named with the pattern `*.unit.test.ts` or `*.unit.test.tsx`.

#### Backend (Node.js/Express)

```typescript
import { describe, it, expect } from '@jest/globals';
import { MyService } from '../services/MyService';

describe('MyService', () => {
  it('should do something', () => {
    const service = new MyService();
    const result = service.doSomething();
    expect(result).toBe('expected value');
  });
});
```

#### Frontend (React)

```typescript
import { render, screen } from '@testing-library/react';
import { MyComponent } from '../components/MyComponent';

test('renders component', () => {
  render(<MyComponent />);
  expect(screen.getByText('Hello')).toBeInTheDocument();
});
```

## Integration Tests

Integration tests use Jest with testcontainers to test API endpoints and database interactions.

### Running Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run integration tests for a specific package
npm run test:integration -w @viberglass/platform-backend
```

### Writing Integration Tests

Integration tests use testcontainers to spin up real PostgreSQL databases for testing.

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { setupTestDatabase, teardownTestDatabase } from '../helpers';

describe('My API Integration Tests', () => {
  let db;

  beforeAll(async () => {
    const testDb = await setupTestDatabase();
    db = testDb.db;
  }, 30000);

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('should interact with database', async () => {
    const result = await db.selectFrom('users').selectAll().execute();
    expect(result).toBeDefined();
  });
});
```

### Testcontainers Setup

The integration tests use `testcontainers` to automatically:
- Start a PostgreSQL container before tests
- Run tests against the test database
- Stop the container after tests complete

No manual database setup required!

## E2E Tests

E2E tests use Playwright to test the full application stack.

### Setup

First, install the dependencies:

```bash
npm install
```

Then, install Playwright browsers:

```bash
npx playwright install
```

### Running E2E Tests

There are two ways to run E2E tests:

#### Method 1: Using Docker Compose (Recommended)

```bash
# Start the E2E stack (PostgreSQL, LocalStack)
npm run test:e2e:setup

# Run E2E tests
npm run test:e2e

# Stop the E2E stack
npm run test:e2e:teardown
```

#### Method 2: Using Programmatic Testcontainers

```bash
# Setup services programmatically
npm run setup:services -w @viberator/e2e-tests

# Run E2E tests
npm run test -w @viberator/e2e-tests

# Teardown services
npm run teardown:services -w @viberator/e2e-tests
```

### E2E Test Commands

```bash
# Run E2E tests
npm run test:e2e

# Run E2E tests in headed mode (see browser)
npm run test:e2e -- --headed

# Run E2E tests in debug mode
npm run test:e2e -- --debug

# Run E2E tests with UI
npm run test:e2e -- --ui

# View test report
npm run test:e2e -- --report
```

### Writing E2E Tests

E2E tests are written using Playwright and use custom fixtures:

```typescript
import { test, expect } from '../playwright/fixtures';

test('should load homepage', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Viberator/);
});

test('should login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
});

test('should call API', async ({ request, backendURL }) => {
  const response = await request.get(`${backendURL}/api/health`);
  expect(response.ok()).toBeTruthy();
});
```

### E2E Stack Components

The E2E test stack includes:
- **PostgreSQL** - Test database (port 5433)
- **LocalStack** - AWS services mock (S3, SQS, Lambda)

## Test Configuration

### Jest Configuration Files

- `apps/viberator/jest.config.js` - Orchestrator unit tests
- `apps/platform-backend/jest.config.js` - Backend unit tests
- `apps/platform-backend/jest.integration.config.js` - Backend integration tests
- `apps/platform-frontend/jest.config.js` - Frontend unit tests

### Playwright Configuration

- `tests/e2e/playwright.config.ts` - Playwright configuration

## Dependencies

### Unit Tests
- `jest` - Test framework
- `ts-jest` - TypeScript preprocessor
- `@testing-library/react` - React component testing
- `@testing-library/jest-dom` - Custom Jest matchers

### Integration Tests
- `testcontainers` - Docker containers for testing
- `supertest` - HTTP assertion library

### E2E Tests
- `@playwright/test` - E2E test framework
- `@testcontainers/postgresql` - PostgreSQL container
- `@testcontainers/localstack` - LocalStack container
- `dockerode` - Docker control

## Best Practices

### Unit Tests
- Test individual functions and classes in isolation
- Mock external dependencies (API calls, database)
- Keep tests fast and simple
- Aim for high code coverage

### Integration Tests
- Test API endpoints from request to database
- Use testcontainers for real databases
- Test database operations (CRUD)
- Test service integrations

### E2E Tests
- Test critical user flows
- Don't test every edge case (use unit/integration tests)
- Keep tests maintainable
- Use page objects for complex interactions

## Troubleshooting

### Port Conflicts

If tests fail due to port conflicts:
```bash
# Check what's using the port
lsof -i :5433  # PostgreSQL
lsof -i :4566  # LocalStack

# Kill the process or change ports in docker-compose.e2e.yaml
```

### Docker Issues

If Docker containers fail to start:
```bash
# Check Docker is running
docker ps

# Restart Docker daemon
sudo systemctl restart docker

# Clean up dangling containers
docker container prune
```

### Testcontainers Issues

If testcontainers fail to connect:
```bash
# Make sure Docker daemon is running
docker ps

# Check testcontainers configuration
# See: https://testcontainers.org/guides/getting-started/
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# Example GitHub Actions
- name: Run unit tests
  run: npm run test:unit

- name: Run integration tests
  run: npm run test:integration

- name: Setup E2E stack
  run: npm run test:e2e:setup

- name: Run E2E tests
  run: npm run test:e2e

- name: Teardown E2E stack
  if: always()
  run: npm run test:e2e:teardown
```
