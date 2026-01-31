# Phase 15: Infrastructure Renaming - Research

**Researched:** 2026-01-24
**Domain:** AWS Infrastructure with Pulumi IaC
**Confidence:** HIGH

## Summary

This research documents all infrastructure resource naming changes required to rename AWS resources from "viberator" to "viberglass" branding. The infrastructure uses Pulumi for IaC, and all changes involve updating resource names in Pulumi configuration files and TypeScript component files.

**Key findings:**
- 22 infrastructure files contain "viberator" references requiring changes
- Changes affect: Pulumi stack configuration, Amplify app, CloudWatch log groups, SSM parameter paths, ECS task definitions, Lambda functions, RDS instances, SQS queues, S3 buckets, IAM roles, and ALB configuration
- Resource naming follows pattern: `{environment}-viberator-{resource}` or `/viberator/{environment}/{category}`
- **Critical:** Some AWS resources (RDS, SSM parameters) require special handling to avoid data loss during rename
- **Recommended approach:** Use Pulumi `aliases` for resources where physical name changes, or create-replace-delete pattern for non-critical resources

**Primary recommendation:** Deploy to dev first to validate changes, then staging, then production. Use `pulumi up --target` to control resource replacement order.

## Standard Stack

### Core Infrastructure
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Pulumi | Latest | Infrastructure as Code | Industry-standard IaC with AWS provider |
| AWS SDK | @pulumi/aws | AWS resource provisioning | Official Pulumi AWS provider |
| TypeScript | 5.x | Infrastructure code language | Type-safe infrastructure definition |
| Node.js | 20.x | Runtime for Pulumi | Required by Pulumi AWS provider |

### AWS Resources Being Renamed
| Resource Type | Current Naming Pattern | New Naming Pattern | Count |
|--------------|----------------------|-------------------|-------|
| Pulumi Stack | `viberator` | `viberglass` | 1 (project-level) |
| Amplify App | `{env}-viberator-frontend` | `{env}-viberglass-frontend` | 3 (dev/staging/prod) |
| CloudWatch Log Groups | `/aws/lambda/viberator-*`, `/ecs/viberator-*` | `/aws/lambda/viberglass-*`, `/ecs/viberglass-*` | 9 log groups |
| SSM Parameters | `/viberator/{env}/*` | `/viberglass/{env}/*` | 30+ parameters |
| ECS Task Definitions | `{env}-viberator-{service}` | `{env}-viberglass-{service}` | 2 families |
| Lambda Functions | `viberator-{env}-worker` | `viberglass-{env}-worker` | 3 functions |
| RDS Instances | `{env}-viberator-db` | `{env}-viberglass-db` | 3 instances |
| SQS Queues | `{env}-viberator-worker-*` | `{env}-viberglass-worker-*` | 6 queues |
| S3 Buckets | `{env}-viberator-uploads-*` | `{env}-viberglass-uploads-*` | 3 buckets |
| IAM Roles | `{env}-viberator-*` | `{env}-viberglass-*` | 15+ roles |
| ALB/LB Resources | `{env}-viberator-alb*` | `{env}-viberglass-alb*` | Multiple |

### Files Requiring Changes

**Pulumi Configuration (4 files):**
- `/home/jussi/Development/viberator/infrastructure/Pulumi.yaml` - Stack name and description
- `/home/jussi/Development/viberator/infrastructure/Pulumi.dev.yaml` - Config key prefixes
- `/home/jussi/Development/viberator/infrastructure/Pulumi.staging.yaml` - Config key prefixes
- `/home/jussi/Development/viberator/infrastructure/Pulumi.prod.yaml` - Config key prefixes

**TypeScript Components (13 files):**
- `/home/jussi/Development/viberator/infrastructure/config.ts` - Project tag value
- `/home/jussi/Development/viberator/infrastructure/index.ts` - Resource names and references
- `/home/jussi/Development/viberator/infrastructure/components/amplify-frontend.ts` - App name, SSM paths
- `/home/jussi/Development/viberator/infrastructure/components/amplify-oidc.ts` - Resource names
- `/home/jussi/Development/viberator/infrastructure/components/backend-ecs.ts` - Task definitions, service names
- `/home/jussi/Development/viberator/infrastructure/components/worker-ecs.ts` - Cluster, task definitions
- `/home/jussi/Development/viberator/infrastructure/components/worker-lambda.ts` - Function names, env vars
- `/home/jussi/Development/viberator/infrastructure/components/database.ts` - Instance identifiers, SSM paths
- `/home/jussi/Development/viberator/infrastructure/components/logging.ts` - Log group names
- `/home/jussi/Development/viberator/infrastructure/components/secrets.ts` - SSM parameter paths
- `/home/jussi/Development/viberator/infrastructure/components/queue.ts` - Queue names
- `/home/jussi/Development/viberator/infrastructure/components/storage.ts` - Bucket names
- `/home/jussi/Development/viberator/infrastructure/components/load-balancer.ts` - ALB resource names
- `/home/jussi/Development/viberator/infrastructure/components/registry.ts` - Repository names
- `/home/jussi/Development/viberator/infrastructure/components/vpc.ts` - VPC resource names
- `/home/jussi/Development/viberator/infrastructure/components/kms.ts` - KMS resource names

**Package Files (2 files):**
- `/home/jussi/Development/viberator/infrastructure/package.json` - Package name
- `/home/jussi/Development/viberator/infrastructure/package-lock.json` - Package references

**Documentation (1 file):**
- `/home/jussi/Development/viberator/infrastructure/README.md` - All documentation references

## Architecture Patterns

### Resource Naming Pattern

The infrastructure follows consistent naming patterns:

```typescript
// Current pattern
const resourceName = `${environment}-viberator-${resourceType}`;
const ssmPath = `/viberator/${environment}/${category}/${key}`;
const logGroupName = `/aws/lambda/viberator-${environment}-worker`;

// New pattern
const resourceName = `${environment}-viberglass-${resourceType}`;
const ssmPath = `/viberglass/${environment}/${category}/${key}`;
const logGroupName = `/aws/lambda/viberglass-${environment}-worker`;
```

### Pulumi Resource Identity

**Critical Concept:** Pulumi tracks resources by URN (Uniform Resource Name), which includes:
- Project name (from Pulumi.yaml)
- Stack name (dev/staging/prod)
- Resource logical name
- Resource type

Changing any component of the URN causes Pulumi to see it as a **new resource** and delete the old one.

**Source:** [Pulumi Resource Names Documentation](https://www.pulumi.com/docs/iac/concepts/resources/names/)

### Resource Replacement Strategies

#### Strategy 1: Aliases (Recommended for most resources)

Use Pulumi's `aliases` option to tell Pulumi that a renamed resource is the same:

```typescript
// Example for Lambda function
const workerLambda = new aws.lambda.Function(
  `${options.config.environment}-viberglass-worker`,
  {
    name: `viberglass-${options.config.environment}-worker`,
    // ... other properties
  },
  {
    // Tell Pulumi this is the same as the old resource
    aliases: [{ name: `${options.config.environment}-viberator-worker` }],
  }
);
```

**When to use:**
- Lambda functions
- ECS task definitions
- IAM roles
- Most AWS resources

**Benefits:**
- No downtime
- Preserves resource state
- No manual data migration

**Source:** [Pulumi Blog - Refactoring with Aliases](https://www.pulumi.com/blog/cumundi-guest-post/)

#### Strategy 2: Create-Replace-Delete (Default Pulumi behavior)

For resources that don't support aliases or when creating completely new resources:

```typescript
// Old resource will be deleted, new one created
const bucket = new aws.s3.BucketV2(`${env}-viberglass-uploads-bucket`, {
  bucket: pulumi.interpolate`${env}-viberglass-uploads-${randomSuffix}`,
  // Pulumi will create this, then delete the old viberator bucket
});
```

**When to use:**
- S3 buckets (need manual data migration first)
- CloudWatch log groups (logs are ephemeral)
- Resources where data loss is acceptable

**Risks:**
- Data loss for S3, RDS
- Downtime for critical services
- Must migrate data before deployment

**Mitigation:**
- Backup S3 data before rename
- Export/import RDS snapshots
- Use `deleteBeforeReplace: false` (default) for zero-downtime

#### Strategy 3: Manual State Management (Advanced)

Use `pulumi state rename` for stack-level resources:

```bash
# Rename stack (NOT supported directly, use workarounds)
pulumi stack init viberglass-dev
pulumi state move <urn> --dest-stack viberglass-dev
```

**When to use:**
- Stack renaming (no direct command exists)
- Moving resources between stacks

**Source:** [Pulumi Blog - Move Resources Between Stacks](https://www.pulumi.com/blog/move-resources-between-stacks/)

### Deployment Order Pattern

**Critical:** Deploy in order: dev → staging → prod

**Reasoning:**
1. Dev has no data loss risk (can be destroyed/recreated)
2. Staging validates changes before production
3. Production requires careful migration planning

**Per-environment considerations:**

| Environment | Data Loss Risk | Rollback Strategy | Testing |
|------------|----------------|-------------------|---------|
| **dev** | Low (can recreate) | `pulumi destroy && pulumi up` | Full acceptance testing |
| **staging** | Medium (has test data) | Keep old stack for rollback | Integration tests, smoke tests |
| **prod** | High (real user data) | Blue-green deployment, manual rollback | Extensive validation, gradual cutover |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resource renaming without recreation | Custom scripts with `aws cli` | Pulumi `aliases` option | Built-in state management, no manual URN tracking |
| Stack renaming | Manual YAML edits + state file manipulation | Create new stack, use `pulumi state move` | Avoids state file corruption |
| RDS instance rename | `aws rds modify-db-instance --db-instance-identifier` | Snapshot + restore with new name | RDS doesn't support in-place rename |
| SSM parameter migration | Get all params → put with new paths | New resources with old as `aliases` | Preserves encryption, versioning |
| CloudWatch log migration | Export logs → re-import | New log groups (logs are ephemeral) | Log retention handles cleanup |

**Key insight:** Pulumi's state management is designed for these changes. Leveraging built-in features avoids manual error-prone steps.

## Common Pitfalls

### Pitfall 1: Changing Physical Name Without Aliases

**What goes wrong:** Pulumi sees it as a new resource, deletes the old one after creating the new one, causing:
- Data loss (S3 buckets, RDS)
- Downtime (ECS services, Lambda functions)
- Broken references (IAM policies, security groups)

**Why it happens:** Physical name changes (e.g., `name` property in AWS resources) don't automatically update Pulumi's understanding of resource identity.

**How to avoid:**
```typescript
// WRONG - Will delete and recreate
const lambda = new aws.lambda.Function("my-func", {
  name: "viberglass-worker",  // Changed from "viberator-worker"
});

// CORRECT - Preserves resource identity
const lambda = new aws.lambda.Function("my-func", {
  name: "viberglass-worker",
}, {
  aliases: [{ name: "viberator-worker" }],  // Tell Pulumi it's the same
});
```

**Warning signs:** Pulumi preview shows "create" and "delete" for same resource type with similar names.

### Pitfall 2: Forgetting SSM Parameter Path References

**What goes wrong:** Code references `/viberator/dev/database/url` but new parameter is at `/viberglass/dev/database/url`, causing:
- Database connection failures
- Application crashes on startup
- Secrets not found at runtime

**Why it happens:** SSM parameter paths are hardcoded in multiple places (Pulumi code, application env vars, CI/CD configs).

**How to avoid:**
1. Search codebase for `/viberator/` references **outside** of infrastructure directory
2. Update application code to use environment variables or configuration
3. Verify all references before deployment

**Example search:**
```bash
grep -r "/viberator/" --exclude-dir=infrastructure --exclude-dir=node_modules .
```

**Warning signs:** Application fails to start after infrastructure rename with "Parameter not found" errors.

### Pitfall 3: RDS Instance Rename Requires Downtime

**What goes wrong:** Attempting to rename RDS instance identifier causes:
- Database unavailable during snapshot/restore
- Lost transactions if not stopped first
- Connection string changes required in all services

**Why it happens:** AWS RDS doesn't support in-place identifier changes. Must snapshot, restore with new name.

**How to avoid:**
1. Plan maintenance window (5-15 minutes downtime per DB)
2. Create final snapshot before rename
3. Update application connection strings **before** DNS propagates
4. Verify with smoke tests before cutover

**Process:**
```bash
# 1. Create snapshot
aws rds create-db-snapshot --db-instance-identifier dev-viberator-db \
  --db-snapshot-id pre-rename-backup

# 2. Pulumi up (creates new DB, destroys old one)
# Note: Data loss risk! Export data first if needed

# 3. Verify new DB is accessible
psql $DATABASE_URL -c "SELECT 1"
```

**Warning signs:** Database becomes inaccessible after `pulumi up` completes.

### Pitfall 4: CloudWatch Log Groups Retain Old Logs

**What goes wrong:** New log groups are empty, old logs still in `/viberator/` groups:
- Difficult to debug issues during/after deployment
- Logs split across two groups
- Old logs expire based on retention policy

**Why it happens:** CloudWatch log groups are immutable resources with their physical name as part of identity.

**How to avoid:**
1. Accept that old logs remain in old groups (this is fine)
2. Update CloudWatch dashboards and alarms to reference new log groups
3. Consider exporting critical logs before rename if needed for compliance

**Alternative:** Use CloudWatch Logs Insights queries across both log groups:
```sql
fields @timestamp, @message
| filter @logGroup like /viberator/ or @logGroup like /viberglass/
| sort @timestamp desc
```

**Warning signs:** No logs appear in CloudWatch after deployment (check log group names in alarms).

### Pitfall 5: Amplify App Name Change Causes Domain Change

**What goes wrong:** Amplify app name change can cause:
- Frontend domain changes (e.g., `dev-viberator.amplifyapp.com` → new domain)
- Broken links and bookmarks
- SEO impact from domain change

**Why it happens:** Amplify app name is part of the default domain URL.

**How to avoid:**
1. Use custom domains (not default Amplify domains) if possible
2. If using default domains, update DNS and set up redirects
3. Communicate domain change to users in advance

**Note:** The current code uses `${config.environment}-viberator-frontend` as the app name.

**Warning signs:** Frontend becomes inaccessible after deployment at old URLs.

### Pitfall 6: IAM Role References Break

**What goes wrong:** IAM policies reference old role names:
- Lambda functions can't assume roles
- ECS tasks can't get credentials
- SSM parameter access denied

**Why it happens:** IAM role names are used in trust relationships and policy ARNs.

**How to avoid:**
1. Use `aliases` for IAM roles to preserve role identity
2. Verify trust relationships after deployment
3. Test least-privilege access still works

**Example:**
```typescript
// ECS task role with alias
const taskRole = new aws.iam.Role(`${env}-viberglass-ecs-task-role`, {
  assumeRolePolicy: /* ... */,
}, {
  aliases: [{ name: `${env}-viberator-ecs-task-role` }],
});
```

**Warning signs:** "Access denied" or "Unauthorized operation" errors in CloudWatch logs.

## Code Examples

### Example 1: Rename Lambda Function with Aliases

```typescript
// Source: infrastructure/components/worker-lambda.ts
// OLD:
const workerLambda = new aws.lambda.Function(`${options.config.environment}-viberator-worker`, {
  name: `viberator-${options.config.environment}-worker`,
  packageType: "Image",
  // ... other properties
});

// NEW (with alias to prevent recreation):
const workerLambda = new aws.lambda.Function(`${options.config.environment}-viberglass-worker`, {
  name: `viberglass-${options.config.environment}-worker`,  // NEW physical name
  packageType: "Image",
  // ... same other properties
}, {
  aliases: [{ name: `${options.config.environment}-viberator-worker` }],  // OLD logical name
});
```

**Verification:**
```bash
pulumi preview
# Should show: "update" for Lambda function, NOT "create" and "delete"
```

### Example 2: Rename SSM Parameter Paths

```typescript
// Source: infrastructure/components/secrets.ts
// OLD:
const ssmAppIdPath = `/viberator/${config.environment}/amplify/appId`;
const ssmAppId = new aws.ssm.Parameter(`${env}-viberator-amplify-appId`, {
  name: ssmAppIdPath,
  value: app.id,
  type: "String",
});

// NEW (with alias):
const ssmAppIdPath = `/viberglass/${config.environment}/amplify/appId`;  // NEW path
const ssmAppId = new aws.ssm.Parameter(`${env}-viberglass-amplify-appId`, {  // NEW logical name
  name: ssmAppIdPath,  // NEW physical path
  value: app.id,
  type: "String",
}, {
  aliases: [{ name: `${env}-viberator-amplify-appId` }],  // OLD logical name
});
```

**Note:** SSM parameter `name` property is the physical path. The logical name (first constructor arg) is what Pulumi uses for tracking.

### Example 3: Rename ECS Task Definition Family

```typescript
// Source: infrastructure/components/backend-ecs.ts
// OLD:
const backendTaskDefinition = new aws.ecs.TaskDefinition(
  `${options.config.environment}-viberator-backend`,
  {
    family: `${options.config.environment}-viberator-backend`,
    // ... other properties
  }
);

// NEW (with alias):
const backendTaskDefinition = new aws.ecs.TaskDefinition(
  `${options.config.environment}-viberglass-backend`,  // NEW logical name
  {
    family: `${options.config.environment}-viberglass-backend`,  // NEW family name
    // ... same other properties
  },
  {
    aliases: [{ name: `${options.config.environment}-viberator-backend` }],  // OLD logical name
  }
);
```

**Important:** Both the logical name (first arg) AND the `family` property need to change. The alias references the old logical name.

### Example 4: Rename CloudWatch Log Group

```typescript
// Source: infrastructure/components/logging.ts
// OLD:
const lambdaLogGroup = new aws.cloudwatch.LogGroup(`${env}-viberator-lambda-logs`, {
  name: `/aws/lambda/viberator-${env}-worker`,
  retentionInDays: retentionInDays,
});

// NEW (data loss acceptable for logs - no alias needed):
const lambdaLogGroup = new aws.cloudwatch.LogGroup(`${env}-viberglass-lambda-logs`, {
  name: `/aws/lambda/viberglass-${env}-worker`,  // NEW log group name
  retentionInDays: retentionInDays,
});
// Pulumi will create new log group, old one will be deleted after retention expires
```

**Note:** CloudWatch log groups can be recreated without aliases since old logs persist until retention expires. Export critical logs before deployment if needed.

### Example 5: Update Pulumi Stack Name

```typescript
// Source: infrastructure/Pulumi.yaml
// OLD:
name: viberator
description: Viberator AWS Infrastructure
runtime: nodejs

// NEW:
name: viberglass  # Stack/project name
description: Viberglass AWS Infrastructure
runtime: nodejs
```

**Important:** This changes the project name in Pulumi, affecting all stack URNs.

**Process:**
1. Update Pulumi.yaml
2. Run `pulumi stack init viberglass-dev` (create new stack)
3. Or use `pulumi state move` to move resources (advanced)
4. Update all Pulumi.{stack}.yaml config keys from `viberator:xxx` to `viberglass:xxx`

**Example config change:**
```yaml
# OLD:
config:
  viberator:awsRegion: eu-west-1
  viberator:environment: dev

# NEW:
config:
  viberglass:awsRegion: eu-west-1
  viberglass:environment: dev
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual resource rename → state file edit | Pulumi `aliases` option | 2020+ | Prevents resource recreation |
| `pulumi stack rename` (doesn't exist) | Create new stack + `pulumi state move` | 2024+ | Proper stack renaming workflow |
| Destroy & recreate for all name changes | Selective aliases + state management | 2020+ | Zero-downtime infrastructure refactoring |
| Custom naming with `name` property | Configurable auto-naming patterns | 2025 | Flexible naming without manual tracking |

**Deprecated/outdated:**
- **Manual state file editing**: Previously used to rename resources, now superseded by `aliases` and `pulumi state` commands
- **Destroy-recreate pattern**: Still works but causes downtime; use `aliases` for critical resources
- **Hardcoded physical names**: Use `${pulumi.getProject()}` or auto-naming patterns instead

**New in 2025:**
- **Pulumi auto-naming configuration**: Can set global naming patterns in Pulumi.yaml
  ```yaml
  config:
    pulumi:autonaming:
      pattern: ${name}-${project}-${stack}
  ```
- **Source:** [Pulumi Auto-Naming Documentation](https://www.pulumi.com/docs/iac/concepts/resources/names/)

## Open Questions

### Question 1: RDS Data Migration Strategy

**What we know:**
- RDS instance identifier change requires snapshot/restore
- Dev/staging have minimal data (can recreate)
- Production has real user data requiring migration

**What's unclear:**
- Acceptable downtime window for production RDS rename
- Whether to use AWS Database Migration Service (DMS) or manual export/import

**Recommendation:**
1. **Dev/Staging:** Allow data loss, recreate from scratch (faster, simpler)
2. **Production:**
   - Option A: Use AWS DMS for zero-downtime migration (complex, costly)
   - Option B: Maintenance window with snapshot/restore (simpler, 5-15 min downtime)
   - **Default to Option B** unless business requires zero-downtime

### Question 2: Amplify App Domain Impact

**What we know:**
- Amplify app name is part of default domain: `{app-name}.amplifyapp.com`
- Frontend uses custom domain (if configured)
- Current code doesn't show custom domain configuration

**What's unclear:**
- Whether production uses custom domain or default Amplify domain
- Impact of domain change on SEO and user bookmarks

**Recommendation:**
1. Check current Amplify configuration: `aws amplify get-app --app-id <APP-ID>`
2. If using default domain, plan communication strategy for domain change
3. Consider adding custom domain before rename to avoid disruption

### Question 3: SSM Parameter Replication

**What we know:**
- SSM parameter paths change from `/viberator/` to `/viberglass/`
- Application code reads from these paths
- CI/CD workflows may reference these paths

**What's unclear:**
- Are there hardcoded SSM path references outside infrastructure code?
- Do CI/CD workflows need updates?

**Recommendation:**
1. Search codebase for `/viberator/` references:
   ```bash
   grep -r "/viberator/" --exclude-dir=infrastructure --exclude-dir=node_modules .
   ```
2. Update application environment variables or configuration
3. Update GitHub Actions workflows that reference SSM parameters
4. Test thoroughly in dev before staging/production

## Sources

### Primary (HIGH confidence)
- [Pulumi Resource Names Documentation](https://www.pulumi.com/docs/iac/concepts/resources/names/) - Official Pulumi docs on resource naming, URNs, and identity
- [Pulumi Blog - Refactoring with Aliases](https://www.pulumi.com/blog/cumundi-guest-post/) - Official guide on using aliases for zero-downtime resource renaming
- [Pulumi Blog - Move Resources Between Stacks](https://www.pulumi.com/blog/move-resources-between-stacks/) - Official guide on `pulumi state move` command
- [Infrastructure codebase analysis](/home/jussi/Development/viberator/infrastructure/) - Direct examination of all infrastructure files requiring changes

### Secondary (MEDIUM confidence)
- [GitHub Issue - Pulumi Stack Rename](https://github.com/pulumi/pulumi/issues/2402) - Discussion on stack rename feature request
- [GitHub Issue - Resource Parenting](https://github.com/pulumi/pulumi/issues/837) - Using aliases to change parent without replacement
- [StackOverflow - Rename Resources](https://stackoverflow.com/questions/72421214/how-to-force-pulumi-to-create-a-resource-after-deleting-one) - Community discussion on Lambda resource renaming

### Tertiary (LOW confidence)
- [Pulumi IaC Best Practices 2025](https://www.pulumi.com/blog/iac-best-practices-structuring-pulumi-projects/) - Recent best practices (may need verification for specific renaming patterns)
- [Pulumi Auto-Naming Feature](https://www.pulumi.com/blog/autonaming-configuration/) - 2025 feature for configurable naming patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Based on official Pulumi documentation and codebase analysis
- Architecture: HIGH - Pulumi resource identity and URN behavior are well-documented
- Pitfalls: HIGH - Based on common AWS resource rename scenarios and Pulumi limitations

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - infrastructure patterns are stable)

## Implementation Checklist by INFRA Requirement

### INFRA-01: Amplify app name changed to "viberglass"

**Files:**
- `infrastructure/components/amplify-frontend.ts` (lines 67-69)
  - Line 67: Resource logical name
  - Line 68: App name (physical name)
  - Line 69: Description

**Changes:**
```typescript
// Line 67: Change logical name and add alias
const app = new aws.amplify.App(`${config.environment}-viberglass-frontend`, {
  // ... properties
}, {
  aliases: [{ name: `${config.environment}-viberator-frontend` }],
});

// Line 68-69: Update name and description
name: `${config.environment}-viberglass-frontend`,
description: `Viberglass frontend - ${config.environment} environment`,
```

**Risk:** Medium - May change default Amplify domain

**Validation:** `aws amplify get-app --app-id <NEW_APP_ID>`

---

### INFRA-02: Pulumi stack name updated to "viberglass-{environment}"

**Files:**
- `infrastructure/Pulumi.yaml` (line 1: `name: viberglass`)
- `infrastructure/Pulumi.dev.yaml` (lines 10, 14: config keys)
- `infrastructure/Pulumi.staging.yaml` (lines 10, 14)
- `infrastructure/Pulumi.prod.yaml` (lines 10, 14)

**Changes:**
```yaml
# Pulumi.yaml
name: viberglass
description: Viberglass AWS Infrastructure

# Pulumi.{stack}.yaml - Update all config keys
config:
  viberglass:awsRegion: eu-west-1
  viberglass:environment: dev  # or staging/prod
  viberglass:enableSpot: "true"
  # ... etc (all keys)
```

**Risk:** High - Changes all stack URNs, may require state migration

**Validation:**
```bash
pulumi stack ls
pulumi config
```

---

### INFRA-03: CloudWatch log groups use "viberglass" prefix

**Files:**
- `infrastructure/components/logging.ts` (lines 73-90)
  - Line 73: Lambda log group resource name
  - Line 74: Lambda log group physical name
  - Line 80: ECS worker log group
  - Line 81: ECS worker log group name
  - Line 87: Backend log group
  - Line 88: Backend log group name

**Changes:**
```typescript
// Line 73-77: Lambda log group (no alias - logs are ephemeral)
const lambdaLogGroup = new aws.cloudwatch.LogGroup(`${env}-viberglass-lambda-logs`, {
  name: `/aws/lambda/viberglass-${env}-worker`,
  retentionInDays: retentionInDays,
  tags: defaultTags,
});

// Line 80-84: ECS worker log group
const ecsWorkerLogGroup = new aws.cloudwatch.LogGroup(`${env}-viberglass-ecs-worker-logs`, {
  name: `/ecs/viberglass-${env}-worker`,
  retentionInDays: retentionInDays,
  tags: defaultTags,
});

// Line 87-91: Backend log group
const backendLogGroup = new aws.cloudwatch.LogGroup(`${env}-viberglass-backend-logs`, {
  name: `/ecs/viberglass-${env}-backend`,
  retentionInDays: retentionInDays,
  tags: defaultTags,
});
```

**Risk:** Low - Old logs remain until retention expires

**Validation:**
```bash
aws logs describe-log-groups --log-group-name-prefix /aws/lambda/viberglass-
```

---

### INFRA-04: SSM parameter paths use /viberglass/ prefix

**Files:**
- `infrastructure/components/amplify-frontend.ts` (lines 111-113)
- `infrastructure/components/database.ts` (lines 99, 115, 163, 167, 177, 188, 200, 212)
- `infrastructure/components/secrets.ts` (lines 123-124, 134, 140-141, 144-145, 148-157)
- `infrastructure/components/worker-ecs.ts` (line 116)
- `infrastructure/components/worker-lambda.ts` (line 95, 122)

**Changes (representative):**
```typescript
// amplify-frontend.ts lines 111-113
const ssmAppIdPath = `/viberglass/${config.environment}/amplify/appId`;
const ssmBranchNamePath = `/viberglass/${config.environment}/amplify/branchName`;
const ssmRegionPath = `/viberglass/${config.environment}/amplify/region`;

// Add aliases to each SSM parameter
const ssmAppId = new aws.ssm.Parameter(`${env}-viberglass-amplify-appId`, {
  name: ssmAppIdPath,
  value: app.id,
  type: "String",
  tags: config.tags,
}, {
  aliases: [{ name: `${env}-viberator-amplify-appId` }],
});
```

**Risk:** High - Application code may reference these paths

**Validation:**
```bash
aws ssm get-parameters-by-path --path /viberglass/dev/ --recursive
```

**External changes needed:**
- Search application code for `/viberator/` SSM path references
- Update environment variables or configuration

---

### INFRA-05: ECS task definitions use "viberglass" family name

**Files:**
- `infrastructure/components/backend-ecs.ts` (lines 194, 196, 205)
- `infrastructure/components/worker-ecs.ts` (lines 133, 134, 143)

**Changes:**
```typescript
// backend-ecs.ts line 194-196
const backendTaskDefinition = new aws.ecs.TaskDefinition(
  `${options.config.environment}-viberglass-backend`,
  {
    family: `${options.config.environment}-viberglass-backend`,
    // ... other properties
  },
  {
    aliases: [{ name: `${options.config.environment}-viberator-backend` }],
  }
);

// Line 205: Container name (optional to change, but consistent)
containerDefinitions: pulumi.interpolate`${JSON.stringify([
  {
    name: "viberglass-backend",  // Changed from viberator-backend
    // ...
  },
])}`

// worker-ecs.ts line 133-134
const workerContainer = new aws.ecs.TaskDefinition(
  `${options.config.environment}-viberglass-ecs-worker`,
  {
    family: `${options.config.environment}-viberglass-worker`,
    // ... other properties
  },
  {
    aliases: [{ name: `${options.config.environment}-viberator-ecs-worker` }],
  }
);
```

**Risk:** Medium - Requires ECS service replacement or update

**Validation:**
```bash
aws ecs describe-task-definition --task-definition dev-viberglass-backend
```

---

### INFRA-06: Lambda function names use "viberglass" prefix

**Files:**
- `infrastructure/components/worker-lambda.ts` (lines 109-110, 122)

**Changes:**
```typescript
// Line 109-110
const workerLambda = new aws.lambda.Function(
  `${options.config.environment}-viberglass-worker`,
  {
    name: `viberglass-${options.config.environment}-worker`,  // NEW physical name
    packageType: "Image",
    imageUri: image.imageUri,
    role: lambdaRole.arn,
    timeout: timeout,
    memorySize: memorySize,
    environment: {
      variables: {
        TENANT_CONFIG_PATH_PREFIX: "/viberglass/tenants",  // NEW SSM path
        // ... other env vars
      },
    },
    tags: options.config.tags,
  },
  {
    aliases: [{ name: `${options.config.environment}-viberator-worker` }],
  }
);
```

**Risk:** Low - Lambda aliases prevent recreation

**Validation:**
```bash
aws lambda get-function --function-name viberglass-dev-worker
```

---

### INFRA-07: RDS instance identifiers use "viberglass" prefix

**Files:**
- `infrastructure/components/database.ts` (lines 99, 115, 241, 245-246, 285)

**Changes:**
```typescript
// Line 99: Subnet group name
const subnetGroupName = `${config.environment}-viberglass-db-subnet-group`;

// Line 115: Parameter group name
const parameterGroupName = `${config.environment}-viberglass-db-pg`;

// Line 163: SSM base path
const basePath = `/viberglass/${config.environment}/database`;

// Line 241: Instance name
const instanceName = `${config.environment}-viberglass-db`;

// Line 245-246: Database name and username (optional to change)
const dbName = options.dbName ?? "viberglass";
const masterUsername = options.masterUsername ?? "viberglass";

// Line 285: Tag
tags: {
  ...config.tags,
  Name: instanceName,
  Application: "viberglass",  // Changed from viberator
},
```

**Risk:** High - RDS identifier change requires snapshot/restore, data loss risk

**Validation:**
```bash
aws rds describe-db-instances --db-instance-identifier dev-viberglass-db
```

**Migration process:**
1. Create final snapshot: `aws rds create-db-snapshot --db-instance-identifier dev-viberator-db --db-snapshot-id pre-rename`
2. Run `pulumi up` (creates new DB, destroys old)
3. For production: Export data before, import after deployment

---

## Additional Files Not Covered by INFRA Requirements

### Package Naming (2 files)

**Files:**
- `infrastructure/package.json` (line 2)
- `infrastructure/package-lock.json` (line 2, 8)

**Changes:**
```json
{
  "name": "@viberglass/infrastructure",
  // ... rest of package.json
}
```

**Risk:** Low - Only affects local package references

---

### Tag Values (1 file)

**File:** `infrastructure/config.ts` (line 108)

**Changes:**
```typescript
tags: {
  Environment: environment,
  Project: "viberglass",  // Changed from viberator
  ManagedBy: "pulumi",
},
```

**Risk:** Low - Cosmetic change for resource tagging

---

### Main Index File Resource Names (1 file)

**File:** `infrastructure/index.ts`

**Changes needed in multiple locations:**
- Line 43: VPC resource name prefix
- Line 99, 112, 212: IAM role policy names
- Line 127: S3 bucket prefix
- Line 133, 142, 226: S3/Lambda/ECS role policy attachment names
- Line 159: Load balancer project name
- Line 236: GitHub repository reference (check if correct)
- Line 251-252: Database URL/host interpolation strings
- Line 256: ECR repository name default

**Changes (representative):**
```typescript
// Line 43
const vpc: VpcOutputs = createVpc(`${config.environment}-viberglass`, {
  // ...
});

// Line 159
const loadBalancer: LoadBalancerOutputs = createLoadBalancer({
  environment: config.environment,
  projectName: "viberglass",  // Changed from viberator
  // ...
});

// Line 251-252
databaseUrl: pulumi.interpolate`postgresql://${config.environment}-viberglass-db.${vpc.privateSubnetIds[0]}`,
databaseHost: pulumi.interpolate`${config.environment}-viberglass-db.${vpc.privateSubnetIds[0]}`,
```

**Risk:** Medium - These are resource names that affect infrastructure

---

## Deployment Order and Risk Mitigation

### Step 1: Development Environment (Low Risk)

**Goal:** Validate all changes without data loss impact.

**Process:**
1. Update all infrastructure files (find/replace `viberator` → `viberglass`)
2. Run `pulumi preview` to review changes
3. Run `pulumi up` to deploy changes
4. Verify all resources are created correctly
5. Test application connectivity
6. Run full test suite

**Rollback:** `pulumi destroy && pulumi up` (acceptable in dev)

**Time estimate:** 30-60 minutes

---

### Step 2: Staging Environment (Medium Risk)

**Goal:** Validate changes with test data before production.

**Process:**
1. Create backup of critical staging data
2. Update infrastructure files
3. Run `pulumi preview` (save output for review)
4. Run `pulumi up` with `--target` for specific resources if needed
5. Verify all resources updated correctly
6. Test application end-to-end
7. Run integration tests

**Rollback:** Keep old stack available temporarily: `pulumi stack init viberglass-staging-old && pulumi state move`

**Time estimate:** 1-2 hours (including testing)

---

### Step 3: Production Environment (High Risk)

**Goal:** Deploy to production with zero or minimal downtime.

**Pre-deployment checklist:**
- [ ] All tests pass in dev and staging
- [ ] Rollback plan documented and tested
- [ ] Maintenance window scheduled (if downtime required)
- [ ] Production database backup created
- [ ] Monitoring and alerts configured
- [ ] Team available for immediate response

**Process:**
1. **T-minus 1 hour:** Final production backup
2. **T-minus 30 minutes:** Alert team of upcoming deployment
3. **T-minus 5 minutes:** Verify system health baseline
4. **T-0:** Run `pulumi up` (with `--target` if doing phased rollout)
5. **T+5 minutes:** Verify critical resources (DB, Lambda, ECS)
6. **T+15 minutes:** Full smoke tests
7. **T+30 minutes:** Monitor for errors, rollback if needed

**Rollback strategies:**
1. **If using aliases:** `pulumi up` with reverted code (fastest)
2. **If not using aliases:** Restore from snapshot (for RDS, S3)
3. **Blue-green:** Keep old resources running, switch DNS (requires planning)

**Time estimate:** 2-4 hours (including monitoring)

---

### Risk Assessment by Resource Type

| Resource Type | Data Loss Risk | Downtime Risk | Rollback Complexity |
|--------------|---------------|---------------|-------------------|
| **Pulumi stack** | Low | Low | Medium (state restore) |
| **Amplify app** | Low | Low-Medium | Low (if using custom domain) |
| **CloudWatch logs** | Low | None | Low (logs persist) |
| **SSM parameters** | Medium | Low | Low (recreate with old values) |
| **ECS tasks** | Low | Low-Medium | Low (with aliases) |
| **Lambda functions** | Low | Low | Low (with aliases) |
| **RDS instances** | High | High | High (snapshot restore) |
| **SQS queues** | Low | Low | Low |
| **S3 buckets** | High | Low | Medium (backup/restore) |
| **IAM roles** | Low | High | Low (with aliases) |
| **ALB/LB** | Low | Low | Low |

**Overall risk: HIGH** (due to RDS and potential S3 data loss)

**Mitigation:**
1. Use `aliases` for all resources where possible
2. Export critical data before production deployment
3. Test rollback procedure in staging
4. Consider blue-green deployment for critical services
