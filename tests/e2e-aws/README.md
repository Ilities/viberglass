# AWS End-to-End Tests

This test suite validates the entire Viberglass platform running on real AWS infrastructure (staging environment). Unlike local or mocked tests, these tests verify actual AWS service integrations including S3, RDS, ECS, ALB, and CloudWatch.

## Purpose

- Validate end-to-end flows against staging environment before production deployment
- Test actual AWS service integrations (not mocked)
- Verify webhook processing with real GitHub integration
- Validate worker execution on ECS Fargate
- Test database operations on RDS PostgreSQL
- Ensure file uploads work with real S3 buckets

## Prerequisites

### AWS Access

You need AWS credentials configured with permissions to access:
- ALB/API Gateway endpoints
- CloudWatch Logs (for worker execution verification)
- S3 buckets (for file upload testing)
- ECS tasks (for worker status checking)
- RDS connection (for direct database queries)

### Environment Configuration

Create a `.env.aws-test` file in this directory:

```bash
# API endpoint (ALB DNS or custom domain)
AWS_API_URL=https://api.staging.yourdomain.com

# Frontend URL
AWS_FRONTEND_URL=https://staging.yourdomain.com

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012

# Test credentials (staging tenant)
TEST_TENANT_ID=staging-e2e-test
TEST_API_KEY=your-test-api-key

# GitHub integration (for webhook tests)
GITHUB_TEST_REPO=your-org/test-repo
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_TOKEN=your-github-token

# AWS Resources (for verification)
ECS_CLUSTER_NAME=viberglass-staging-backend-cluster
ECS_SERVICE_NAME=viberglass-staging-backend-service
S3_BUCKET_NAME=viberglass-staging-uploads
RDS_ENDPOINT=viberglass-staging-db.xxxxx.us-east-1.rds.amazonaws.com
DATABASE_NAME=viberglass
```

### Install Dependencies

```bash
npm install
```

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Suites
```bash
# Full ticket flow
npm test ticket-to-viberator-flow

# Webhook integration
npm test github-webhook-integration

# S3 file upload
npm test s3-file-upload

# ECS worker execution
npm test ecs-worker-execution

# RDS connection
npm test rds-connection
```

### Debug Mode
```bash
DEBUG=pw:api npm test
```

### Headed Mode (see browser)
```bash
npm test -- --headed
```

## Test Data Provisioning

Before running tests, provision test data in the staging environment:

```bash
npm run provision-test-data
```

This creates:
- Test user account
- Test project
- Test integration configurations
- Sample tickets

## Test Architecture

Each test follows this pattern:

1. **Setup**: Provision necessary data via API
2. **Execute**: Trigger the action (webhook, API call, etc.)
3. **Verify**: Check results via API, CloudWatch logs, or direct AWS service queries
4. **Cleanup**: Delete test data

## CI Integration

These tests run:
- On every merge to `main` (post-deployment to staging)
- Nightly at 2 AM UTC
- Manually via workflow dispatch

See `.github/workflows/e2e-aws.yml` for CI configuration.

## Troubleshooting

### Test Timeouts

If tests timeout waiting for worker execution:
- Check ECS cluster has capacity
- Verify CloudWatch logs for worker errors
- Ensure RDS is accepting connections
- Check IAM role permissions for ECS tasks

### Authentication Failures

- Verify `TEST_TENANT_ID` matches staging database
- Check `TEST_API_KEY` is valid
- Ensure IAM credentials have necessary permissions

### Webhook Tests Failing

- Verify GitHub webhook is configured correctly
- Check `GITHUB_WEBHOOK_SECRET` matches GitHub settings
- Ensure ALB is publicly accessible
- Check security group rules allow GitHub webhook IPs

### Database Connection Issues

- Verify RDS security group allows connections from test runner IP
- Check database credentials in SSM Parameter Store
- Ensure database name matches configuration

## Writing New Tests

Use the provided fixtures for common setup:

```typescript
import { test, expect } from '@playwright/test';
import { setupAWSTest, createTestProject } from '../fixtures/aws-setup';

test.describe('My New Feature', () => {
  let testContext;

  test.beforeAll(async () => {
    testContext = await setupAWSTest();
  });

  test('should do something', async ({ request }) => {
    const project = await createTestProject(request, testContext.tenantId);

    // Your test logic here

    await cleanupProject(project.id);
  });
});
```

## AWS Resource Verification

### Check ECS Task Status
```bash
aws ecs describe-tasks \
  --cluster viberglass-staging-backend-cluster \
  --tasks $(aws ecs list-tasks --cluster viberglass-staging-backend-cluster --query 'taskArns[0]' --output text)
```

### View Worker Logs
```bash
aws logs tail /aws/lambda/viberglass-staging-worker --follow
```

### Check S3 Files
```bash
aws s3 ls s3://viberglass-staging-uploads/ --recursive
```

### Query RDS
```bash
psql $RDS_CONNECTION_STRING -c "SELECT * FROM jobs ORDER BY created_at DESC LIMIT 10;"
```

## Performance Benchmarks

Target performance metrics for staging:
- API response time: p95 < 500ms
- Webhook processing: < 2s from receipt to job creation
- Worker execution: < 5min for standard ticket
- S3 upload: < 10s for files up to 10MB
- Database query: p95 < 100ms

## Cleanup

After test runs, orphaned test data may remain. Run cleanup script:

```bash
npm run cleanup-test-data
```

This removes:
- Test projects older than 7 days
- Test tickets marked with `e2e-test-` prefix
- Test users with email `*@test.viberglass.dev`
