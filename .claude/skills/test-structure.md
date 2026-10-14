# Test Structure Convention

Follow this test structure convention when creating or moving tests in this codebase.

## Test Location Rules

1. **Unit Tests**
   - Backend (`apps/platform-backend`): in `src/__tests__/unit/`, in the folder that mirrors the source. `npm run test:unit` there selects tests by the `unit` path, so a test next to its source won't run with it.
   - Frontend, worker (`apps/viberator`), `packages/telemetry`: next to the file being tested (co-located)
   - Plugin packages (`packages/agents/*`, `packages/integrations/*`) and `packages/cli`: in the package's `test/` folder
2. **Integration Tests** - Place in `apps/platform-backend/src/__tests__/integration/`
3. **E2E Tests** - Place in the separate `tests/e2e/` package, under `tests/smoke/`

## File Naming Conventions

- Unit tests: `Filename.test.ts` (same name as source file)
- Integration tests: `Filename.integration.test.ts`
- E2E tests: `feature-name.e2e.test.ts`

## Examples

### Unit Test (Co-located: frontend, worker)
```
apps/platform-frontend/src/
  pages/
    SomePage.tsx
    SomePage.test.tsx          # Unit test next to source
```

### Backend Unit and Integration Tests
```
apps/platform-backend/
  src/
    services/
      UserService.ts
    __tests__/
      unit/
        services/
          UserService.test.ts        # Unit test, mirroring src/
      integration/
        database.integration.test.ts # Integration test
      helpers/                       # Test database, test server, fakes
```

### E2E Test
```
tests/e2e/
  tests/
    smoke/
      sign-in.e2e.test.ts
      cancel-run.e2e.test.ts
```

## When Adding Tests

1. **Creating unit tests**: Follow the package's existing layout (see above)
2. **Creating integration tests**: Place in `apps/platform-backend/src/__tests__/integration/`
3. **Creating E2E tests**: Place in `tests/e2e/tests/smoke/`; the other specs under `tests/e2e/tests/` are quarantined legacy specs

## Test Type Guidelines

- **Unit tests**: Test individual functions/classes in isolation, mock external dependencies
- **Integration tests**: Test API endpoints, database interactions, service integrations with real containers
- **E2E tests**: Test full user flows across the application stack
