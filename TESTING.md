# Testing Structure

This document describes the testing setup for the Viberglass monorepo.

## Overview

The project has three layers of tests:

1. **Unit Tests** - Test individual functions, classes, and React components
2. **Integration Tests** - Test API endpoints and database interactions with testcontainers
3. **E2E Tests** - Test full application flows with Playwright

## Project Structure

```
viberglass/
├── apps/viberator/
│   ├── src/
│   │   ├── services/
│   │   │   ├── GitService.ts
│   │   │   └── GitService.branch.test.ts  # Unit tests co-located
│   │   └── workers/core/*.test.ts
│   └── jest.config.js
├── apps/platform-backend/
│   ├── src/
│   │   └── __tests__/
│   │       ├── unit/                     # Unit tests, mirroring src/
│   │       ├── integration/              # Integration tests (testcontainers)
│   │       └── helpers/                  # Test database, test server, fakes
│   └── jest.config.js
├── apps/platform-frontend/
│   ├── src/
│   │   └── pages/
│   │       ├── SomePage.tsx
│   │       └── SomePage.test.tsx         # Unit tests co-located
│   └── jest.config.js
│   └── jest.setup.ts
├── packages/agents/agent-*/test/         # Plugin package tests
├── packages/integrations/integration-*/test/
├── packages/cli/test/
└── tests/e2e/                            # Separate E2E test package
    ├── tests/smoke/                      # The smoke journeys (default run)
    ├── tests/<feature>/                  # Quarantined specs (opt-in)
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

- **Unit Tests**
  - Backend: `apps/platform-backend/src/__tests__/unit/`, in the folder matching the source (`services/Foo.ts` → `__tests__/unit/services/Foo.test.ts`)
  - Frontend and worker: next to the file being tested, `Filename.test.ts` or `Filename.test.tsx`
  - Plugin packages and the CLI: the package's `test/` folder

- **Integration Tests**: `apps/platform-backend/src/__tests__/integration/`
  - Pattern: `*.integration.test.ts`
  - Test database operations, API endpoints with testcontainers

- **E2E Tests**: `tests/e2e/tests/smoke/`
  - Pattern: `feature-name.e2e.test.ts`
  - Test full user flows across the stack

## Unit Tests

Unit tests use Jest and test individual pieces of code in isolation.

### Running Unit Tests

Run one suite at a time, and cap Jest's workers; the backend suite in particular is heavy:

```bash
(cd apps/platform-backend && npx jest --maxWorkers=2 src/__tests__/unit)
```

```bash
# Run all unit tests (every workspace in turn)
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

See [Test Location Rules](#test-location-rules) for where they go. Test files are named `*.test.ts` or `*.test.tsx`.

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
| Creating a task through the form lands on it in the plan step, with *Write the plan* offered | `create-task.e2e.test.ts` |
| Asking the agent for the plan (a suggested action) writes a document that's ready with nothing to approve | `write-the-plan.e2e.test.ts` |
| @agent writes plan v1; a comment; "Revise the plan with 1 comment" gives v2 from the resumed session with only what's new | `task-conversation.e2e.test.ts` |
| A message queued during a live turn reaches the agent in its next turn, then the session waits on people | `live-session-message.e2e.test.ts` |
| A session is titled with its task and opens with what the person wrote (which reaches the agent); the full prompt is behind "View full prompt" | `session-opening.e2e.test.ts` |
| A live turn that writes no document leaves the session waiting on the person; their reply starts the next turn | `session-waits-on-person.e2e.test.ts` |
| A task says whose move it is at the top: the agent working (cancel), plan ready, then *Build it* offered with no Approve anywhere | `task-next-moves.e2e.test.ts` |
| Only people on the task (and maintainers and admins) are offered *Build it*, and the API refuses anyone else; a guest off the task can't ask at all, and once on it their build runs as theirs; a space's default reviewers join each new task and the agent mentions them when the plan is ready | `ask-policy.e2e.test.ts` |
| A reviewer comments on text in the rendered plan; the comment follows its text through an edit, reaches the agent with its quote, and is outdated once the text is gone | `rendered-document-comments.e2e.test.ts` |
| The audit log records secrets and role changes (never a secret's value), is admin-only, and filters by area | `audit-log.e2e.test.ts` |
| A task worked through as a conversation: three people invited by link; the PM asks, the designer is @mentioned and replies, the agent mentions the reviewer when the plan is ready, the reviewer comments on the rendered plan, has it revised with the comment and asks for the build; Home's Needs you and the thread name each person | `team-review-conversation.e2e.test.ts` |
| A turn whose context is past the threshold is followed by Summary v1, unasked and compacted, pinned in the thread; a second agent brought in starts cold from the summary | `summary-and-second-agent.e2e.test.ts` |
| Home per role: a mentioned member sees it under Needs you with an unread count, and replying clears it; a new task is its owner's move, and the agent's plan mentions the owner; a guest on a task is mentioned and replies; a viewer lands on Overview | `home.e2e.test.ts` |
| Cancel stops the worker container; the run stays cancelled and writes nothing. A run stopped after writing its plan keeps it as a version, and says who stopped it | `cancel-run.e2e.test.ts` |
| The agent asks the requester a question with `ask_human`; it's in the thread and their move on Home; answering with an option resumes the plan, which has the answer | `agent-question.e2e.test.ts` |
| The owner interrupts a slow turn with an instruction, and the next turn has it; pausing stops the run and holds an ask, and letting it carry on finishes the plan with that ask | `steer-the-agent.e2e.test.ts` |
| The owner takes the work over, a commit is pushed to the task's branch, and after handing back the agent's next turn is told about the commit | `take-over-and-hand-back.e2e.test.ts` |
| Asking again while the agent works joins its turn instead of starting another run; the next turn answers both asks | `no-duplicate-runs.e2e.test.ts` |
| Status says "Not started", "Agent working" only while a run is active, then "Awaiting review"; a failed run shows as failed | `status-truth.e2e.test.ts` |
| Failures read by cause: agent failures offer *Try again* in the thread (a new run), a plan turn that writes no document is an answer rather than a failure, a setup failure sends admins to the fix and tells members an admin is needed, and pauses the agent until an admin fixes it and retries every paused run | `failure-copy.e2e.test.ts` |
| Members can't reach secrets, runner changes or project deletion, and don't see plumbing | `member-permissions.e2e.test.ts` |
| A backend that starts before Postgres recovers once it is up | `late-database.e2e.test.ts` |
| On an empty workspace, the first admin goes through setup (a wrong key is explained; key → repository → space → agent) and the first task's plan appears | `first-run-setup.e2e.test.ts` |
| A new admin explores the demo workspace (sample tasks, a readable failure), removes it, and lands back in setup | `first-run-setup.e2e.test.ts` |
| Workspace plumbing sits under Settings → Advanced, for admins only | `member-permissions.e2e.test.ts` |
| An invite link works once and a revoked one not at all; a viewer reads but changes nothing; deactivating someone ends their session | `invites-and-roles.e2e.test.ts` |
| Viewers and guests are offered no action they can't take | `role-aware-actions.e2e.test.ts` |
| A private space and its tasks stay hidden until you're added; only maintainers change a space's settings; a guest sees only their space | `space-visibility.e2e.test.ts` |
| A space's connections page lists the connection linked to it | `space-connections.e2e.test.ts` |
| Only a task's requester and owner, maintainers and admins change it; only admins delete it | `task-changes.e2e.test.ts` |
| Tasks get distinct keys per space, a requester and an owner, open by key, and anyone can watch them | `task-keys-and-people.e2e.test.ts` |
| A task's thread shows messages, document versions and events in order | `task-thread.e2e.test.ts` |
| An issue a webhook builds on its own becomes a task whose build is a turn in its thread | `webhook-build.e2e.test.ts` |

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
npm run test:legacy -w @viberator/e2e-tests   # quarantined specs
```

The suite runs beside the dev stack. It uses its own ports: frontend 3100,
backend 8988, Postgres 5433, git fixture 8989, and 8990/5434 for the
late-database journey, and 8991/5435 plus a stub on 8992 for the first-run
setup journey. `npx playwright test` on its own refuses to run
against a database that isn't empty; use `npm run test:e2e`, which resets it.

### How it works

- **First run.** The seeded workspace is already set up, so the setup journey
  starts its own backend on an empty database (`FirstRunScenario`) and reroutes
  the page's API calls to it. Setup's outside checks go to `SetupStubServer`
  through real configuration: `GITHUB_API_URL` for the GitHub API, and
  `VIBERGLASS_FAKE_PROVIDER_URL` for the test-only "Fake provider (tests)",
  which runs on the fake agent and is offered only when that variable is set.
  The stub's repository points at the git fixture, so the plan really runs.
  That backend's output goes to `test-results/first-run-backend.log`.
- **Stack.** `docker-compose.e2e.yaml` runs Postgres on a tmpfs, so each run
  starts empty. Playwright starts the backend (`tsx`) and frontend (Vite) on the
  host. Workers reach the backend through `host.docker.internal`.
- **Seed.** `globalSetup` serves a one-commit fixture repository over plain HTTP
  and seeds through the public API: first admin, a member, a runner using the
  fake agent image, and a space whose repository is the fixture.
- **Fake agent** (`packages/agents/agent-fake`). It writes the document a
  turn's `<what-to-do>` names (or the one people asked for in the thread),
  echoing the prompt so tests can see what reached the agent, and says which
  turn of its session it is: it keeps sessions in its state directory, so it
  resumes like a real harness. Directives in people's words (a message, or
  the task description on a first turn) steer it: `[fake:sleep=N]`,
  `[fake:no-document]`, `[fake:code]` (changes `fake-change.txt`), `[fake:usage=N]` (reports N of 200,000 tokens in its context),
  `[fake:fail]`, `[fake:sleep-after=N]` (writes its document, then waits), `[fake:ask=Q|A|B]` (asks Q
  with `ask_human` and stops; `[fake:ask-later=Q]` carries on, `[fake:ask-of=WHO]` names whom). It is test-only: not in the runner picker, not provisioned or
  pushed by infrastructure.

### Writing a journey

```typescript
import { createTask, startPlan } from "../../playwright/tasks";
import { expect, test } from "../../playwright/smokeFixtures";

test("...", async ({ adminApi, adminPage: page, workspace }) => {
  const task = await createTask(adminApi, workspace.projectId, "Do X. [fake:sleep=5]");
  const jobId = await startPlan(adminApi, task.id, workspace.clankerId);
  await page.goto(`/spaces/${workspace.projectSlug}/runs/${jobId}`);
  // ...
});
```

- Set up through the API, then drive the step under test in the UI.
- Assert outcomes through the API where the UI is ambiguous (`runStatus`,
  `planDocument`, `sessionStatus`, `taskPhase`).
- Starting a worker container changes the host's network interfaces, and
  Chromium aborts loads that are in flight with `ERR_NETWORK_CHANGED`. Navigate
  after the container is up, and retry the navigation with `expect(...).toPass()`.

## Test Configuration

### Jest Configuration Files

- `apps/viberator/jest.config.js` - Orchestrator unit tests
- `apps/platform-backend/jest.config.js` - Backend tests; `test:unit` and `test:integration` select by path
- `apps/platform-frontend/jest.config.js` - Frontend unit tests
- `jest.config.js` in each plugin package, `packages/cli`, `packages/telemetry` and `packages/agent-core`

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
- Share setup through the helpers in `tests/e2e/playwright/`

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

`backend-ci.yml` and `frontend-ci.yml` run on pull requests: the backend's unit tests, build and a startup smoke check, and the frontend's lint, unit tests and build. Integration and E2E tests aren't run in CI; run them locally before changes that need them.
