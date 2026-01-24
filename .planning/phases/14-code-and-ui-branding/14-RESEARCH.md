# Phase 14: Code and UI Branding - Research

**Researched:** 2026-01-24
**Domain:** Frontend UI, API responses, environment variables, package naming
**Confidence:** HIGH

## Summary

This phase applies the Viberglass/Viberator branding split to the actual codebase. Phase 13 completed documentation branding; Phase 14 applies branding changes to code, UI, and configuration. The branding split is: **Viberglass** (platform name) and **Viberators** (worker/agent name).

**Key findings:**
1. Frontend UI currently displays "Viberator" as platform name - needs to change to "Viberglass"
2. "Clanker" is used throughout the UI to refer to worker configurations - this is a separate concern from branding
3. Package names use `@viberator/*` scope - changing these has significant implications
4. Environment variables use lowercase `viberator` prefix, not uppercase `VIBERATOR_`
5. Worker classes in `viberator/app/` already use "Viberator" naming (e.g., BaseAgent) - per CODE-06 these should stay as-is
6. No `VIBERATOR_` prefixed environment variables were found - the requirement may be based on an assumption

**Primary recommendation:** Focus changes on user-visible UI text (titles, headings) and API response labels. Package renaming should be carefully evaluated as it breaks all imports across the monorepo.

## Standard Stack

This phase does not involve new libraries. The existing stack includes:

| Component | Technology | Branding Location |
|-----------|------------|-------------------|
| Frontend UI | Next.js 15, React 19 | Component text, metadata, SVG logos |
| Backend API | Express, TypeScript | API responses, User-Agent headers, SSM paths |
| Shared Types | TypeScript package | Package name, JSDoc comments |
| Worker Code | Node.js, TypeScript | Package name, class names |
| Environment | dotenv, Docker | Environment variable names, container names |

## Architecture Patterns

### Pattern 1: UI Branding Constants (Recommended for New Code)

**What:** Centralize branding strings in configuration rather than hardcoding throughout components.

**When to use:** For any new branding-related additions going forward.

**Example pattern:**
```typescript
// src/lib/branding.ts
export const BRANDING = {
  platformName: 'Viberglass',
  workerName: 'Viberator',
  workerNamePlural: 'Viberators',
} as const
```

**Note:** This pattern is NOT currently used in the codebase. All branding is currently hardcoded.

### Pattern 2: Package Scope Naming

The monorepo uses `@viberator/*` package scope across all packages:

```
@viberglass/types          - Shared types
@viberator/frontend       - Frontend app
@viberator/platform-backend - Backend API
@viberator/orchestrator   - Worker code
```

**Implications of renaming:**
- All `import` statements across the monorepo would need updating
- `package.json` files would need version bumps
- Docker build caches would be invalidated
- Published packages (if any) would break for consumers

### Pattern 3: Environment Variable Prefixes

The codebase uses lowercase environment variables:
```
DB_NAME=viberator
DB_USER=viberator
NEXT_PUBLIC_API_URL
PLATFORM_API_URL
```

**Finding:** No uppercase `VIBERATOR_` prefixed environment variables were found in the codebase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Branding string management | Scattered hardcoded strings | Centralized constants (future) | Easier updates, consistency |
| Package renaming automation | Manual find/replace | Search tools + verification | Avoid breaking imports |

**Key insight:** The codebase already has scattered branding strings. For this phase, focus on user-visible changes rather than establishing a new constant system (that can be a future improvement).

## Common Pitfalls

### Pitfall 1: Breaking Package Imports

**What goes wrong:** Renaming packages without updating all import statements causes TypeScript errors and runtime failures.

**Why it happens:** Package names are used in `import` statements, `package.json` dependencies, and Docker build contexts.

**How to avoid:** If renaming packages, use a phased approach:
1. Update package names in `package.json`
2. Update all import statements
3. Run full build and test suite
4. Commit as atomic change

**Warning signs:** TypeScript errors about missing modules after renaming.

### Pitfall 2: Missing Runtime Branding

**What goes wrong:** Updating metadata and static text, but missing dynamic API responses.

**Why it happens:** API responses often contain hardcoded strings separate from UI components.

**How to avoid:** Search for branding in:
- API response objects
- Webhook User-Agent headers
- SSM parameter paths
- Error messages

**Warning signs:** UI shows "Viberglass" but API responses return "viberator".

### Pitfall 3: Docker Configuration Drift

**What goes wrong:** Container names and environment variables in docker-compose.yml don't match application code.

**Why it happens:** Docker configuration is often updated separately from application code.

**How to avoid:** When renaming, check:
- Container names
- Volume names
- Network names
- Environment variable references

**Warning signs:** Docker containers with old names running alongside updated application.

### Pitfall 4: Forgetting Asset Files

**What goes wrong:** Code shows "Viberglass" but SVG logos and favicons still say "Viberator".

**Why it happens:** Image and SVG assets are in separate directories and not caught by text searches.

**How to avoid:** Manually review:
- `/public/logos/`
- `/public/teams/`
- `/public/*.svg`
- Favicon files

**Warning signs:** Browser tab shows updated title but logo is unchanged.

## Code Examples

### Current UI Title Branding (needs change)

**Source:** `/home/jussi/Development/viberator/platform/frontend/src/app/layout.tsx`

```typescript
export const metadata: Metadata = {
  title: {
    template: '%s - Viberator',
    default: 'Viberator',
  },
  description: 'AI-powered bug fixing orchestrator',
}
```

**Change needed:** Replace "Viberator" with "Viberglass".

### Current Logo SVG (needs change)

**Source:** `/home/jussi/Development/viberator/platform/frontend/src/app/logo.tsx`

```typescript
<text x="30" y="20" ...>
  VIBERATOR
</text>
```

**Change needed:** Replace "VIBERATOR" with "VIBERGLASS".

### Current User-Agent Header (needs change)

**Source:** `/home/jussi/Development/viberator/platform/backend/src/webhooks/providers/base-provider.ts`

```typescript
'User-Agent': 'Viberator-Webhook/1.0',
```

**Change needed:** Replace with "Viberglass-Webhook/1.0".

### Current SSM Path Pattern (already correct)

**Source:** `/home/jussi/Development/viberator/platform/backend/src/config/deployment/SsmSecretProvider.ts`

```typescript
* - Path: /viberator/{environment}/{category}/{key}
* - /viberator/dev/database/url
* - /viberator/prod/amplify/appId
```

**Note:** These paths reference the worker subsystem and use "viberator" - this is appropriate per the branding split (workers = Viberators).

### Current Package Import (evaluating whether to change)

**Source:** Multiple files across the codebase

```typescript
import type { Clanker } from '@viberglass/types';
```

**Decision needed:** Whether to rename `@viberglass/types` to `@viberglass/types`. This has significant impact.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A (initial state) | Mixed branding in code | Phase 14 | Currently inconsistent |
| Documentation | "Viberglass" platform, "Viberators" workers | Phase 13 (complete) | Documentation is consistent |
| Code/UI | "Viberator" everywhere | Pre-Phase 14 | Needs updates |

**Deprecated/outdated:**
- UI title "Viberator" - should be "Viberglass"
- Logo text "VIBERATOR" - should be "VIBERGLASS"
- Webhook User-Agent "Viberator-Webhook" - should be "Viberglass-Webhook"

**Stays as-is:**
- "Clanker" terminology for worker configurations (separate from branding)
- "Viberator" naming in worker code (per CODE-06)
- `viberator` directory name (contains worker code)

## Open Questions

### 1. Package Scope Renaming (@viberator/* -> @viberglass/*)

**What we know:**
- All packages use `@viberator/*` scope
- Renaming affects 4+ packages
- Requires updating all import statements
- Breaks any external consumers

**What's unclear:**
- Are these packages published to npm? (checking package.json shows `"private": true`)
- Is the package renaming required for this phase?

**Recommendation:** Given packages are private and the rename impact, consider keeping `@viberator/*` for worker-related packages and only renaming platform packages if absolutely necessary. Alternatively, defer package renaming to a future migration phase.

### 2. Environment Variable Prefix (VIBERATOR_ requirement)

**What we know:**
- No `VIBERATOR_` prefixed environment variables were found
- Current env vars use lowercase: `DB_NAME=viberator`, `DB_USER=viberator`
- Docker container names use lowercase: `viberator-dev-postgres`

**What's unclear:**
- Is CODE-05 based on an assumption about existing env vars?
- Should new env vars use `VIBERGLASS_` prefix going forward?
- Do existing lowercase env vars need changing?

**Recommendation:** Clarify whether CODE-05 applies only to new env vars or requires renaming existing ones. The lowercase naming for database/users may be intentional (PostgreSQL conventions).

### 3. "Clanker" vs "Viberator" Terminology

**What we know:**
- UI uses "Clanker" to refer to worker configuration entities
- CODE-02 says UI should display "Viberators" when referencing workers/agents
- There's an inconsistency between the entity name (Clanker) and the branding (Viberators)

**What's unclear:**
- Should "Clanker" entity be renamed to "Viberator"?
- Or should "Clanker" remain as the technical term with "Viberator" as the display name?
- Is this a separate decision from the branding split?

**Recommendation:** This may need to be addressed as part of this phase or deferred as a terminology decision. The UI currently shows "Clankers" extensively.

## Branding Locations Inventory

### Frontend UI (CODE-01: Viberglass platform name)

| Location | Current Value | Change Needed |
|----------|---------------|---------------|
| `/platform/frontend/src/app/layout.tsx` | Title: "Viberator" | Change to "Viberglass" |
| `/platform/frontend/src/app/logo.tsx` | SVG text: "VIBERATOR" | Change to "VIBERGLASS" |
| `/platform/frontend/public/logos/viberator.svg` | SVG filename and content | Rename and update |
| `/platform/frontend/public/teams/viberator.svg` | SVG filename and content | Rename and update |

### Frontend UI (CODE-02: Viberators for workers)

| Location | Current Value | Change Needed |
|----------|---------------|---------------|
| `/platform/frontend/src/app/(app)/clankers/` | "Clankers" throughout | Clarify: rename or display name? |
| Various component text | "viberator tasks" | Should use "Viberators" |

**Note:** The UI uses "Clanker" extensively. This appears to be the entity name for worker configurations. Whether this should change to "Viberator" or keep "Clanker" as technical name needs clarification.

### API Responses (CODE-03: Viberglass platform references)

| Location | Current Value | Change Needed |
|----------|---------------|---------------|
| `/platform/backend/src/webhooks/providers/base-provider.ts` | User-Agent: "Viberator-Webhook/1.0" | Change to "Viberglass-Webhook/1.0" |
| `/platform/backend/src/webhooks/providers/github-provider.ts` | User-Agent: "Viberator-Webhook/1.0" | Change to "Viberglass-Webhook/1.0" |

### Environment Variables (CODE-05: VIBERGLASS_ prefix)

**Finding:** No uppercase `VIBERATOR_` prefixed environment variables found.

Current env vars:
- Database: `DB_NAME=viberator`, `DB_USER=viberator` (lowercase, PostgreSQL names)
- SSM path: `/viberator/...` (references worker subsystem)
- Docker: `viberator-dev-network`, `viberator-dev-postgres` (container names)

**Recommendation:** Confirm whether these lowercase instances need changing or if CODE-05 only applies to new environment variables.

### TypeScript Classes (CODE-04: platform components)

**Finding:** The classes in `viberator/app/src/agents/` (BaseAgent, ClaudeCodeAgent, etc.) are worker classes, which per CODE-06 should retain "Viberator" naming.

**No platform component classes requiring rename were identified.**

### Worker Classes (CODE-06: retain Viberator naming)

**Already compliant:** Worker classes in `/home/jussi/Development/viberator/viberator/app/src/agents/` use "Agent" terminology (BaseAgent, ClaudeCodeAgent, etc.) which is appropriate.

## Dependencies and Execution Order

### Recommended Change Sequence

1. **First:** Update user-visible UI text (titles, logos)
   - Low risk, immediately visible
   - No breaking changes

2. **Second:** Update API response labels
   - Affects webhook integrations
   - May need consumer notification

3. **Third:** Update environment variables (if required)
   - May require redeployment
   - Update docker-compose files

4. **Fourth (deferred):** Package renaming
   - Highest risk, most breaking changes
   - Consider doing as separate migration

### Potential Breaking Changes

| Change | Breaking Impact | Mitigation |
|--------|-----------------|------------|
| UI text changes | None | Purely cosmetic |
| API response labels | Low (webhook consumers) | Version headers, documentation |
| User-Agent changes | Low (server logs) | Monitoring for filtering issues |
| Package renaming | High (all imports) | Full test suite required |
| Environment variables | Medium (deployments) | Staged rollout |

## Sources

### Primary (HIGH confidence)

- Codebase inspection of `/home/jussi/Development/viberator/`
- Phase 13 completion state (documentation branding)
- CODE-01 through CODE-06 requirements

### Secondary (MEDIUM confidence)

- Package.json files confirming private packages
- Docker configuration files
- Environment variable examples

### Tertiary (LOW confidence)

- None - all findings directly from source code inspection

## Metadata

**Confidence breakdown:**
- Frontend UI branding locations: HIGH - directly inspected source files
- API response branding: HIGH - found and verified in webhook providers
- Environment variable patterns: HIGH - comprehensive search found no uppercase VIBERATOR_ vars
- Package renaming implications: HIGH - standard monorepo patterns
- Clanker vs Viberator terminology: MEDIUM - requires clarification of requirements

**Research date:** 2026-01-24
**Valid until:** 30 days (codebase may change)

## Recommendations for Planning

1. **Clarify scope:** Confirm whether package renaming (`@viberator/*`) is in scope for this phase
2. **Clarify terminology:** Decide on "Clanker" vs "Viberator" for worker entities
3. **Clarify environment variables:** Confirm CODE-05 applies to new vars only or requires renaming existing lowercase vars
4. **Consider phased approach:** Split into low-risk (UI) and high-risk (packages) changes
5. **Update success criteria:** Current criteria don't account for the "Clanker" terminology question
