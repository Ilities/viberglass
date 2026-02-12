---
phase: 01-multi-tenant-security-foundation
plan: 03
subsystem: credentials
tags: [typescript, credentials, aws, ssm, security]
wave: 2

requires: [01-01]
provides: [AwsSsmProvider]
affects: [01-04]

tech-stack:
  added: []
  patterns:
    - AWS credential chain pattern
    - Hierarchical SSM path structure
    - In-memory caching with TTL

key-files:
  created:
    - platform/backend/src/credentials/providers/AwsSsmProvider.ts
  modified: []
---

# Phase 1 Plan 3: AwsSsmProvider Summary

**One-liner:** AWS SSM Parameter Store credential provider with hierarchical tenant-scoped paths, SecureString encryption, and 5-minute in-memory caching.

## Implementation Summary

Implemented AwsSsmProvider for production credential storage using AWS SSM Parameter Store. This provider completes the credential provider triangle (Environment, File, AWS) enabling secure multi-tenant credential management for production deployments.

### SSM Path Structure

Hierarchical paths enable tenant-scoped IAM policies and logical organization:

```
/viberator/tenants/{tenantId}/{key}
```

Example paths:
- `/viberator/tenants/tenant-123/GITHUB_TOKEN`
- `/viberator/tenants/tenant-123/CLAUDE_API_KEY`
- `/viberator/tenants/acme-corp/GITLAB_TOKEN`

### Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `platform/backend/src/credentials/providers/AwsSsmProvider.ts` | AWS SSM Parameter Store provider | 231 |

### Key Features

1. **AWS SDK v3 Integration**
   - SSMClient with credential chain (Lambda, EC2, ECS, local dev)
   - Uses `@aws-sdk/client-ssm` and `@aws-sdk/credential-provider-node`

2. **SecureString Parameters**
   - All parameters use `Type: 'SecureString'`
   - Encrypted at rest using AWS KMS
   - Decrypted on retrieval with `WithDecryption: true`

3. **In-Memory Caching**
   - 5-minute TTL reduces SSM API calls
   - Cache invalidation on errors
   - Cache updates on put operations

4. **Security**
   - Tenant and key sanitization prevents path traversal
   - Replaces invalid characters with safe alternatives
   - Error messages don't expose sensitive paths

5. **LocalStack Support**
   - Optional `endpoint` config for local testing
   - Enables development without AWS credentials

6. **Efficient Listing**
   - `listKeys()` uses GetParametersByPathCommand
   - Returns credential keys for a tenant without values
   - Respects tenant boundaries

## AWS IAM Permissions Required

For production use, the AWS credentials used by AwsSsmProvider need:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:PutParameter",
        "ssm:DeleteParameter",
        "ssm:GetParametersByPath"
      ],
      "Resource": "arn:aws:ssm:*:*:parameter/viberator/tenants/*"
    }
  ]
}
```

For stricter tenant isolation, IAM policies can restrict to specific tenant prefixes:

```json
{
  "Resource": "arn:aws:ssm:*:*:parameter/viberator/tenants/${aws:userid}/*"
}
```

## Configuration Options

| Option | Environment Variable | Default | Purpose |
|--------|---------------------|---------|---------|
| `region` | `AWS_REGION` | `eu-west-1` | AWS region for SSM |
| `pathPrefix` | `SSM_PARAMETER_PREFIX` | `/viberator/tenants` | Base path for parameters |
| `endpoint` | none | none | LocalStack endpoint (testing) |

### Usage Examples

```typescript
// Production with defaults
const ssmProvider = new AwsSsmProvider({});

// Custom region and prefix
const ssmProvider = new AwsSsmProvider({
  region: 'eu-west-1',
  pathPrefix: '/myapp/creds'
});

// LocalStack for testing
const ssmProvider = new AwsSsmProvider({
  endpoint: 'http://localhost:4566'
});
```

## LocalStack Testing Setup

For local development without AWS credentials:

1. Install LocalStack:
   ```bash
   pip install localstack
   ```

2. Start LocalStack:
   ```bash
   localstack start
   ```

3. Configure provider:
   ```typescript
   const provider = new AwsSsmProvider({
     endpoint: 'http://localhost:4566'
   });
   ```

4. Verify connectivity:
   ```bash
   awslocal ssm put-parameter \
     --name "/viberator/tenants/test/GITHUB_TOKEN" \
     --value "ghp_test" \
     --type "SecureString"
   ```

## Integration Points

- **Plan 01-01**: Implements CredentialProvider interface defined there
- **Plan 01-04**: ProviderFactory will include AwsSsmProvider in fallback chain
- **Plan 01-05**: Tenant validation middleware will use provider for credential access

## Deviations from Plan

None - plan executed exactly as written.

## Duration

**Start:** 2026-01-19T11:26:55Z
**End:** 2026-01-19T11:28:17Z
**Elapsed:** ~1.5 minutes

## Commit

bdc7fe1 - feat(01-03): implement AwsSsmProvider for SSM Parameter Store
