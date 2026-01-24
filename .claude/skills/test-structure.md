# Test Structure Convention

Follow this test structure convention when creating or moving tests in this codebase.

## Test Location Rules

1. **Unit Tests** - Place next to the file being tested (co-located)
2. **Integration Tests** - Place in `__tests__/integration/` directory within the package
3. **E2E Tests** - Place in the separate `tests/e2e/` package

## File Naming Conventions

- Unit tests: `Filename.test.ts` (same name as source file)
- Integration tests: `Filename.integration.test.ts`
- E2E tests: `FeatureName.e2e.test.ts`

## Examples

### Unit Test (Co-located)
```
src/
  services/
    UserService.ts
    UserService.test.ts        # Unit test next to source
    EmailService.ts
    EmailService.test.ts       # Unit test next to source
  __tests__/
    integration/               # Integration tests only
      api.integration.test.ts
```

### Integration Test
```
apps/platform-backend/
  src/
    services/
      UserService.ts
      UserService.test.ts     # Unit test co-located
    __tests__/
      integration/
        users.integration.test.ts  # Integration test
        database.integration.test.ts
```

### E2E Test
```
tests/e2e/
  tests/
    auth.e2e.test.ts
    workflows.e2e.test.ts
```

## When Adding Tests

1. **Creating unit tests**: Place the `.test.ts` file next to the source file
2. **Creating integration tests**: Place in `__tests__/integration/` directory
3. **Creating E2E tests**: Place in `tests/e2e/tests/` directory

## Moving Existing Tests

If you encounter tests in the wrong location:
- Move unit tests from `__tests__/unit/` to be co-located with their source files
- Ensure integration tests are in `__tests__/integration/`
- E2E tests should already be in `tests/e2e/`

## Test Type Guidelines

- **Unit tests**: Test individual functions/classes in isolation, mock external dependencies
- **Integration tests**: Test API endpoints, database interactions, service integrations with real containers
- **E2E tests**: Test full user flows across the application stack
