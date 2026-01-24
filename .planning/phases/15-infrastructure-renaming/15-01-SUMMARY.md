---
phase: 15-infrastructure-renaming
plan: 01
subsystem: pulumi
tags: [pulumi, aws, infrastructure, stack-configuration]

# Dependency graph
requires:
  - phase: 14-code-and-ui-branding
    provides: Branding terminology established (Viberglass platform, Viberator workers)
provides:
  - Pulumi stack renamed from "viberator" to "viberglass"
  - Pulumi config key prefixes updated to "viberglass:"
  - Tag values updated to "viberglass"
  - Resource names updated to "viberglass" pattern
  - SSM parameter paths updated to /viberglass/
  - Backward-compatible alias SSM parameters created
affects: [15-02, 15-03, 15-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pulumi resource naming with backward-compatible aliases
    - SSM parameter path versioning for smooth migration

key-files:
  created: []
  modified:
    - infrastructure/Pulumi.yaml
    - infrastructure/Pulumi.dev.yaml (gitignored)
    - infrastructure/Pulumi.staging.yaml (gitignored)
    - infrastructure/Pulumi.prod.yaml (gitignored)
    - infrastructure/config.ts
    - infrastructure/index.ts
    - infrastructure/components/amplify-frontend.ts
    - infrastructure/components/amplify-oidc.ts
    - infrastructure/components/registry.ts
    - infrastructure/components/vpc.ts
    - infrastructure/components/kms.ts
    - infrastructure/package.json

key-decisions:
  - "SSM alias parameters: Created /viberator/ paths as aliases to /viberglass/ for backward compatibility during migration"
  - "Pulumi stack configs remain gitignored for security - updated locally without commit"

patterns-established:
  - "Pattern 1: SSM parameter migration - create new paths with old paths as aliases"
  - "Pattern 2: Resource name changes require Pulumi refresh/rename to avoid recreation"

# Metrics
duration: 4m 11s
completed: 2026-01-24
---

# Phase 15 Plan 01: Pulumi Stack and Amplify Naming Summary

**Pulumi stack configuration renamed from viberator to viberglass with SSM parameter aliases for backward compatibility**

## Performance

- **Duration:** 4m 11s
- **Started:** 2026-01-24T10:09:39Z
- **Completed:** 2026-01-24T10:13:50Z
- **Tasks:** 6
- **Files modified:** 12 (9 committed, 3 gitignored)

## Accomplishments

- Pulumi stack renamed from "viberator" to "viberglass" in Pulumi.yaml
- All Pulumi stack config key prefixes changed from `viberator:` to `viberglass:`
- Project tag updated to "viberglass" in config.ts
- All resource names in index.ts updated to use "viberglass" naming
- Amplify frontend app renamed with backward-compatible SSM parameter aliases
- All component files (amplify-oidc, registry, vpc, kms) updated to viberglass naming
- Package name updated from @viberator/infrastructure to @viberglass/infrastructure

## Task Commits

Each task was committed atomically:

1. **Task 1: Update Pulumi.yaml stack name and description** - `9b78b29` (feat)
2. **Task 2: Update Pulumi stack config key prefixes** - (gitignored - not committed)
3. **Task 3: Update config.ts Project tag value** - `7d380e9` (feat)
4. **Task 4: Update index.ts resource name references** - `b3dc8d7` (feat)
5. **Task 5: Update Amplify frontend component naming** - `3957697` (feat)
6. **Task 6: Update other component files with viberator references** - `1b810c3` (feat)

**Plan metadata:** To be created after SUMMARY.md

_Note: Task 2 modified gitignored files (Pulumi.*.yaml) which were not committed._

## Files Created/Modified

- `infrastructure/Pulumi.yaml` - Stack name changed to "viberglass", description updated
- `infrastructure/Pulumi.dev.yaml` - Config key prefixes changed to `viberglass:` (gitignored)
- `infrastructure/Pulumi.staging.yaml` - Config key prefixes changed to `viberglass:` (gitignored)
- `infrastructure/Pulumi.prod.yaml` - Config key prefixes changed to `viberglass:` (gitignored)
- `infrastructure/config.ts` - Project tag changed to "viberglass"
- `infrastructure/index.ts` - All resource names updated (VPC, S3, KMS, database, IAM roles, etc.)
- `infrastructure/components/amplify-frontend.ts` - App renamed, SSM paths updated with aliases
- `infrastructure/components/amplify-oidc.ts` - OIDC provider and role names updated
- `infrastructure/components/registry.ts` - ECR repository name updated
- `infrastructure/components/vpc.ts` - Default project name parameter updated
- `infrastructure/components/kms.ts` - KMS key alias updated
- `infrastructure/package.json` - Package name changed to "@viberglass/infrastructure"

## Decisions Made

1. **SSM Parameter Aliases**: Created backward-compatible SSM parameters with old `/viberator/` paths pointing to the same values as new `/viberglass/` paths. This allows gradual migration of systems reading from SSM without breaking existing deployments.

2. **Gitignored Stack Configs**: Pulumi stack configuration files (Pulumi.*.yaml) are gitignored for security reasons. These were updated locally but not committed, which is the correct behavior.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Issue 1: Gitignored Pulumi stack config files**

- **Problem:** Task 2 attempted to commit Pulumi.{dev,staging,prod}.yaml files, but they are gitignored
- **Resolution:** Files were updated correctly on disk but not committed. This is expected behavior - stack configs contain secrets and should remain gitignored.
- **Impact:** No impact. The changes are valid and will be used by Pulumi when running commands.

## User Setup Required

None - no external service configuration required.

**Note:** Users running `pulumi up` after this change will need to:
1. Run `pulumi refresh` to update state with new resource names
2. Review the plan carefully - some resources may show as "will be replaced" due to name changes
3. The SSM parameter aliases will be created as new resources, which is correct

## Next Phase Readiness

Pulumi foundation is ready for Phase 15-02 (CloudWatch and SSM renaming).

**Important:** When running `pulumi up` for the first time after this change:
- The Pulumi stack name in Pulumi.yaml changed from "viberator" to "viberglass"
- This may require `pulumi stack init viberglass` or updating existing stack references
- Resource names have changed, so Pulumi may detect replacements rather than updates
- The SSM parameter aliases (old `/viberator/` paths) will be created as new resources

**Blockers:** None

---
*Phase: 15-infrastructure-renaming*
*Completed: 2026-01-24*
