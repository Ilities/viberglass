# AWS E2E Tests

End-to-end tests against real AWS staging infrastructure (not mocked).

## Setup

Create `.env.aws-test`:

```bash
AWS_API_URL=https://api.staging.yourdomain.com
AWS_REGION=us-east-1
TEST_TENANT_ID=staging-e2e-test
TEST_API_KEY=your-test-api-key
GITHUB_TEST_REPO=your-org/test-repo
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_TOKEN=your-github-token
ECS_CLUSTER_NAME=viberglass-staging-backend-cluster
S3_BUCKET_NAME=viberglass-staging-uploads
```

## Run

```bash
npm install
npm run provision-test-data
npm test
```
