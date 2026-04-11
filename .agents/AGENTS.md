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
- Follow SOLID principles. Adhere to Single Responsibility (classes/functions do one thing), Open/Closed (open for extension, closed for modification), Liskov Substitution (subtypes must be substitutable), Interface Segregation (small, specific interfaces), and Dependency Inversion (depend on abstractions).


### 3) Surgical Changes and Dead Code

- Touch only code required for the request.
- Avoid unrelated refactors, formatting churn, or side cleanups.
- Match existing local style unless the task asks for style changes.
- Remove unused imports/variables/functions introduced by your change.
- In touched areas, remove dead code with zero callers in the same change.
- Do not perform repo-wide dead code cleanup unless requested.

### 3a) Type Safety - No Casting to Bypass Linting

**NEVER use type assertions (`as`) to bypass TypeScript errors or linting violations.** This includes:
- `as any`, `as unknown`, `as SomeType`
- `as unknown as SomeType` chains
- Type assertions in mapper functions like `row: any`

**Instead, properly type the data:**
- Define interfaces/types for database rows
- Use proper generic parameters (e.g., Kysely's type parameters)
- Use type guards for runtime validation
- If truly impossible, use `unknown` + validation, never `as`

**Exception:** Only allowed when the type is genuinely unknowable at compile time AND you've exhausted all proper typing approaches. Must add a comment explaining why.

### 4) Backend Architecture

- Keep classes small and single-purpose.
- Do not create or expand "monster" services.
- Use one primary class per file.
- Prefer composition via dependency injection over provider-specific branching.
- Keep provider-specific behavior in dedicated implementation classes.
- Route provider behavior through interfaces/strategies/resolvers, not inline `if/else`.
- Use constructor injection for collaborators; no hidden business-collaborator instantiation.
- Wire concrete implementations in the composition root.

**Extension Package Pattern:** When a capability has multiple swappable implementations (chat adapters, SCM providers, agent types, secret backends), use the extension package pattern documented in `.claude/skills/extension-pattern.md`. Key rules:
- Extension logic lives in `packages/<name>` and is injected with a narrow `*Services` interface.
- Domain types used by extensions belong in `@viberglass/types` — import them, never redefine them.
- Generic infrastructure (DAOs, registries, bridges) must not reference any specific provider by name.

**Adding a new agent:** The agent system uses a plugin registry. Use `npm run new:agent <name>` to scaffold from the template, then:
1. Implement the agent class in `packages/agents/agent-<name>/src/<Name>Agent.ts` (extend `BaseAgent`).
2. Fill in `plugin.ts` — `defaultConfig`, `envAliases`, `stateDir`, `docker` metadata.
3. Write `Dockerfile.fragment` — install command, ENV, LABEL.
4. Add `"@viberglass/agent-<name>": "*"` to `apps/viberator/package.json`.
5. Add one line in `apps/viberator/src/agents/registerPlugins.ts`: `.register(myPlugin)`.
6. Run: `npm install && npm run build && npm run generate:catalog && npm run generate:dockerfiles`

No other files need to change — `SessionStateManager`, `InstructionFileManager`, `ClankerAgent*Factory`, `ConfigManager` are all registry-driven. For a full guide see `packages/agents/README.md`.

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
- **Always fix ALL failing tests before considering a task done — regardless of whether you caused the failure.** If tests were already failing before your changes, fix them anyway.

### 9) UI Change Verification

When making UI changes, verify them visually using the agent-browser skill:

1. Read credentials from `.agent-browser-creds` (gitignored file):
   - `cat .agent-browser-creds`
2. Login flow (run each command as its own standalone command; do not chain):
   - `agent-browser --session ui-verify open http://localhost:3000/login`
   - `agent-browser --session ui-verify wait --load networkidle`
   - `agent-browser --session ui-verify snapshot -i`
   - `agent-browser --session ui-verify fill @e1 "<username-from-.agent-browser-creds>"`
   - `agent-browser --session ui-verify fill @e2 "<password-from-.agent-browser-creds>"`
   - `agent-browser --session ui-verify click @e5`
   - `agent-browser --session ui-verify wait --fn "location.pathname !== '/login'"`
   - If the wait command returns an intermittent daemon read error, use `agent-browser --session ui-verify wait 1500` and then verify with `get url` + `snapshot -i`.
   - `agent-browser --session ui-verify get url`
   - `agent-browser --session ui-verify snapshot -i`
3. Success criteria:
   - URL is not `/login` (in this app successful login usually lands on `/`, not `/dashboard`).
   - Authenticated navigation elements are present (e.g. `Dashboard`, `Clankers`, `Secrets`).
4. If still on `/login`, retry once:
   - `agent-browser --session ui-verify open http://localhost:3000/login`
   - Repeat snapshot/fill/click/wait commands.
5. Only after successful auth, navigate to the target page and validate UI behavior:
   - Re-run `snapshot -i` after each major page change before interacting.
   - For async forms, wait for data/options before asserting state.
   - Take screenshots of affected areas: `agent-browser --session ui-verify screenshot --full`
6. Review screenshots to confirm visual changes match expectations.

Agent-browser reliability guardrails in this environment:
- Never chain agent-browser commands with shell operators (`;`, `&&`, `||`, `|`) or command substitution (`$()`).
- Never run multiple agent-browser commands in parallel against the same session.
- Prefer one explicit `agent-browser ...` command per tool invocation.
- If `@e*` refs change, use semantic locators instead (for example: `agent-browser --session ui-verify find label "Email" fill "<username>"`).

**Credential file format:**
```
VIBERATOR_USERNAME=<email>
VIBERATOR_PASSWORD=<password>
```
