# AGENTS.md

## Unified Instruction Set (Mandatory)

These are the single source of truth instructions for agent behavior and backend implementation in this repository.

### 1) Think Before Coding

- State assumptions explicitly.
- If multiple interpretations exist, surface them instead of silently choosing.
- If something is unclear, ask before implementing.
- Call out simpler alternatives and meaningful tradeoffs.

### 2) Simplicity First

- Implement only what was requested.
- Avoid speculative abstractions, extra configurability, or future-proofing not asked for.
- Prefer the smallest change that fully solves the problem.

### 3) Surgical Changes and Dead Code

- Touch only code required for the request.
- Avoid unrelated refactors, formatting churn, or side cleanups.
- Match existing local style unless the task asks for style changes.
- Remove unused imports/variables/functions introduced by your change.
- In touched areas, remove dead code with zero callers in the same change.
- Do not perform repo-wide dead code cleanup unless requested.

### 4) Backend Architecture

- Keep classes small and single-purpose.
- Do not create or expand "monster" services.
- Use one primary class per file.
- Prefer composition via dependency injection over provider-specific branching.
- Keep provider-specific behavior in dedicated implementation classes.
- Route provider behavior through interfaces/strategies/resolvers, not inline `if/else`.
- Use constructor injection for collaborators; no hidden business-collaborator instantiation.
- Wire concrete implementations in the composition root.

### 5) Naming Conventions

- Class files: PascalCase matching the primary exported class name.
- Utility/function-only files: camelCase.
- Type/interface-only files: camelCase.
- Index files: `index.ts`.

### 6) Size Limits

- Service class: <= 200 lines.
- Any class: <= 150 lines.
- File: <= 350 lines.
- If limits are exceeded, split into smaller collaborators.

### 7) Verification and Execution

- Define clear, testable success criteria before implementing.
- For bug fixes: reproduce first, then fix, then verify.
- For refactors: preserve behavior with tests before/after.
- For multi-step tasks, state a brief plan and verify each step.

### 8) Completion Criteria

- Confirm the change complies with sections 2 through 7.
- Ensure tests cover orchestration and extracted behaviors for touched logic.
- If a user request conflicts with these rules, implement the request and explicitly call out the conflict.

### 9) UI Change Verification

When making UI changes, verify them visually using the agent-browser skill:

1. Read credentials from `.agent-browser-creds` (gitignored file)
2. Use the agent-browser skill to:
   - Navigate to the application
   - Log in with the credentials
   - Take screenshots of affected UI areas
   - Interact with forms/components as needed to verify functionality
3. Review screenshots to confirm visual changes match expectations

**Credential file format:**
```
VIBERATOR_USERNAME=<email>
VIBERATOR_PASSWORD=<password>
```
