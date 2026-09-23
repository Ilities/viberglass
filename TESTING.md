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
    ├── tests/smoke/                      # The smoke journeys (default run)
    ├── tests/<feature>/                  # Quarantined legacy specs (opt-in)
    ├── playwright/
    │   ├── e2eEnvironment.ts             # Ports, URLs, accounts, backend env
    │   ├── globalSetup.ts                # Git fixture server + database seed
    │   ├── seedWorkspace.ts              # Seeds through the public API
    │   ├── smokeFixtures.ts              # Signed-in pages and API clients
    │   └── tasks.ts                      # Task, run and session helpers
    ├── docker/
    │   └── docker-compose.e2e.yaml       # Postgres for the E2E stack
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

The smoke suite drives the product the way a person does: the real backend and
frontend, real Docker worker containers, and a deterministic **fake agent**
instead of a model. It needs no API keys and runs in about a minute and a half.

### What it covers

| Journey | Spec |
|---|---|
| Sign in as the seeded admin | `sign-in.e2e.test.ts` |
| Automatic research writes a document, which is approved | `research-and-approve.e2e.test.ts` |
| A message queued during a live turn reaches the agent, then the session completes | `live-session-message.e2e.test.ts` |
| Cancel stops the worker container; the run stays cancelled and writes nothing | `cancel-run.e2e.test.ts` |
| A phase can't start a second run or session while one is in progress; the page re-enables when it ends | `no-duplicate-runs.e2e.test.ts` |
| Status says "Not started", "Agent working" only while a run is active, then "Awaiting review"; a failed run shows as failed | `status-truth.e2e.test.ts` |
| Failures read by cause: agent failures offer a retry, a missing document is named, a setup failure sends admins to the fix and tells members an admin is needed | `failure-copy.e2e.test.ts` |
| Members can't reach secrets, runner changes or project deletion, and don't see plumbing | `member-permissions.e2e.test.ts` |
| A backend that starts before Postgres recovers once it is up | `late-database.e2e.test.ts` |

### One-time setup

```bash
npm install
npx playwright install chromium        # from tests/e2e

# The fake worker image. Rebuild after changing apps/viberator or packages/agent*.
docker build -f infra/workers/docker/base/base-worker.Dockerfile -t base-worker .
docker build -f infra/workers/docker/generated/fake.Dockerfile \
  --build-arg BASE_IMAGE=base-worker -t viberator-worker-fake:latest .
```

### Running

```bash
npm run test:e2e                       # resets the database, runs the smoke journeys
npm run test:e2e -- cancel-run         # one spec (still resets first)
npm run test:e2e:teardown              # stop the e2e Postgres
npm run test:legacy -w @viberator/e2e-tests   # quarantined older specs
```

The suite runs beside the dev stack. It uses its own ports: frontend 3100,
backend 8988, Postgres 5433, git fixture 8989, and 8990/5434 for the
late-database journey. `npx playwright test` on its own refuses to run
against a database that isn't empty; use `npm run test:e2e`, which resets it.

### How it works

- **Stack.** `docker-compose.e2e.yaml` runs Postgres on a tmpfs, so each run
  starts empty. Playwright starts the backend (`tsx`) and frontend (Vite) on the
  host. Workers reach the backend through `host.docker.internal`.
- **Seed.** `globalSetup` serves a one-commit fixture repository over plain HTTP
  and seeds through the public API: first admin, a member, a runner using the
  fake agent image, and a space whose repository is the fixture.
- **Fake agent** (`packages/agents/agent-fake`). It writes `RESEARCH.md` or
  `PLAN.md` depending on the prompt, echoing the prompt so tests can see what
  reached the agent. Directives in the task description steer it:
  `[fake:sleep=N]`, `[fake:no-document]`, `[fake:fail]`. It is test-only: not in
  the runner picker, not provisioned or pushed by infrastructure.

### Writing a journey

```typescript
import { createTask, startResearch } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("...", async ({ adminApi, adminPage: page, workspace }) => {
  const task = await createTask(adminApi, workspace.projectId, "Do X. [fake:sleep=5]");
  const jobId = await startResearch(adminApi, task.id, workspace.clankerId);
  await page.goto(`/project/${workspace.projectSlug}/jobs/${jobId}`);
  // ...
});
```

- Set up through the API, then drive the step under test in the UI.
- Assert outcomes through the API where the UI is ambiguous (`runStatus`,
  `researchDocument`, `sessionStatus`, `taskPhase`).
- Starting a worker container changes the host's network interfaces, and
  Chromium aborts loads that are in flight with `ERR_NETWORK_CHANGED`. Navigate
  after the container is up, and retry the navigation with `expect(...).toPass()`.

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
- Docker, for the e2e Postgres and the worker containers

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
lsof -i :8988  # E2E backend
lsof -i :3100  # E2E frontend

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
