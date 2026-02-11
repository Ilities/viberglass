# AGENTS.md

## Backend Architecture Rules (Mandatory)

These rules are mandatory for all backend changes in this repository.

1. Keep classes small and single-purpose.
2. Do not create or expand "monster" services.
3. Prefer composition via dependency injection over provider-specific `if/else` branching.
4. Follow Spring/Nest-style structure: clear module boundaries, interfaces/contracts, focused services.
5. For utility functions, create a dedicated file and expose them as named exports.

## Dead Code Policy (Mandatory)

1. Do not keep dead code, unused wrappers, or compatibility facades after refactors.
2. If a class/file has no references in the codebase, delete it in the same change.
3. Do not preserve old APIs “just in case” unless the task explicitly requires backward compatibility.
4. Prefer hard cleanup over transitional layers when there are zero callers.

## File Naming Convention

1. **Class files**: Use PascalCase matching the primary exported class name.
   - Examples: `FeedbackService.ts`, `GitHubWebhookProvider.ts`, `TicketingIntegrationRegistry.ts`
   - The filename should exactly match the class name it contains.

2. **Utility/function files**: Use camelCase (lowercase starting).
   - Examples: `feedbackHelpers.ts`, `jiraUtils.ts`, `routeHelpers.ts`
   - For files containing only exported functions, not classes.

3. **Type/interface-only files**: Use camelCase.
   - Examples: `types.ts`, `config.ts`

4. **Index files**: Always `index.ts` (lowercase).

## Class and File Size Limits

1. One primary class per file.
2. Do not place multiple concrete service classes in one file.
3. Keep files short and readable.
4. Soft limits:
- Service class: <= 200 lines.
- Any class: <= 150 lines.
- File: <= 350 lines.
5. If limits are exceeded, split immediately into smaller collaborators.

## Branching and Provider Logic

1. Shared orchestration stays in orchestrator/service classes.
2. Integration/provider-specific behavior must live in its own implementation class.
3. Route behavior through interfaces/strategies/resolvers, not inline provider conditionals.
4. Avoid hardcoded provider-specific logic in shared services.

## Dependency Injection Rules

1. All collaborator classes must be injected (constructor injection).
2. No hidden internal instantiation for business collaborators.
3. Composition root wires concrete implementations.

## Refactor Standard

When touching a large service:

1. Extract contracts first.
2. Move provider-specific behavior to dedicated implementations.
3. Keep orchestrator focused on workflow coordination.
4. Preserve behavior with tests.

## PR/Change Checklist (Required)

Before finishing:

1. Confirm no new multi-hundred-line "god service" was introduced.
2. Confirm provider-specific logic is in provider-specific classes.
3. Confirm DI wiring is explicit in composition root.
4. Confirm tests cover orchestration and each extracted behavior.

If a requested change conflicts with these rules, the agent must still implement the request but call out the conflict explicitly.
