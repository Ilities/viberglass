# Viberator Platform - Testing Plan

## Overview

This document provides a comprehensive testing plan for the Viberator AI Agent Orchestration Platform. The primary focus is the **Main End-to-End Flow**: tickets created in external integrations flow through the system, triggering AI agent execution (Clankers) that create pull requests, with results flowing back to the originating integration.

**Applications:**
- Platform Backend (Express.js API)
- Platform Frontend (Next.js dashboard)
- Viberator Worker (AI agent executor)

**Environments:**
- Local: Docker Compose with PostgreSQL, Redis
- Production: AWS ECS/Lambda with SSM, S3

---

## Table of Contents

1. [Main End-to-End Test Flow](#1-main-end-to-end-test-flow)
2. [Integration-Specific E2E Flows](#2-integration-specific-e2e-flows)
3. [Supporting Test Cases](#3-supporting-test-cases)
   - 3.1 [Project Management](#31-project-management)
   - 3.2 [Integration Configuration](#32-integration-configuration)
   - 3.3 [Ticket Management](#33-ticket-management)
   - 3.4 [Job Execution](#34-job-execution)
   - 3.5 [Clanker Management](#35-clanker-management)
   - 3.6 [Webhook Processing](#36-webhook-processing)
   - 3.7 [Feedback Loop](#37-feedback-loop)
   - 3.8 [Secrets Management](#38-secrets-management)
   - 3.9 [Worker Execution](#39-worker-execution)
   - 3.10 [Frontend UI](#310-frontend-ui)
4. [Error Handling & Edge Cases](#4-error-handling--edge-cases)
5. [Security Testing](#5-security-testing)
6. [Performance Testing](#6-performance-testing)
7. [Environment Testing](#7-environment-testing)
8. [Appendices](#8-appendices)

---

## 1. Main End-to-End Test Flow

This is the **primary test scenario** that validates the core platform functionality. All other tests exist to support this flow.

### Primary Flow: Integration Ticket → PR → Integration Update

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Integration   │───▶│  Webhook Event   │───▶│ Ticket Created  │
│ (Jira/GitHub/   │    │   Received       │    │  in Platform    │
│  Shortcut)      │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
┌─────────────────┐    ┌──────────────────┐    ┌────────▼────────┐
│   Integration   │◀───│  Result Posted   │◀───│  Job Executed   │
│    Updated      │    │   (Comment/      │    │   by Clanker    │
│  (PR URL added) │    │   Labels)        │    │                 │
└─────────────────┘    └──────────────────┘    └────────┬────────┘
                                                        │
┌─────────────────┐    ┌──────────────────┐    ┌────────▼────────┐
│   Verify PR     │◀───│  Pull Request    │◀───│   Code Changes  │
│    in GitHub    │    │    Created       │    │   Pushed        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Test Steps: Main E2E Flow

| Step | Action | Verification | Critical |
|------|--------|--------------|----------|
| 1 | Create project in platform with repository URL | Project exists with correct settings | ✅ |
| 2 | Configure integration (e.g., GitHub) | Integration linked to project | ✅ |
| 3 | Configure webhook for the integration | Webhook URL and secret configured | ✅ |
| 4 | Create and start Clanker | Clanker status: active | ✅ |
| 5 | **Create ticket in external integration** | Ticket/issue created in Jira/GitHub/Shortcut | ✅ |
| 6 | **Webhook delivered to platform** | Webhook received, signature verified | ✅ |
| 7 | **Platform ticket auto-created** | Ticket visible in platform, linked to integration | ✅ |
| 8 | **Job auto-triggered (if auto-execute enabled)** | Job queued with status "queued" | ✅ |
| 9 | **Clanker picks up job** | Job status changes to "active" | ✅ |
| 10 | **Worker clones repository** | Log entry: "Repository cloned" | ✅ |
| 11 | **Worker creates fix branch** | Branch created: `fix/{jobId}` | ✅ |
| 12 | **AI agent executes task** | Progress updates streamed to platform | ✅ |
| 13 | **Changes committed and pushed** | Branch pushed to remote | ✅ |
| 14 | **Pull Request created** | PR visible in GitHub with correct base/compare | ✅ |
| 15 | **Job marked completed** | Job status: "completed", PR URL stored | ✅ |
| 16 | **Result posted back to integration** | Comment with PR URL on original ticket | ✅ |
| 17 | **Labels updated in integration** | Success labels added (e.g., "fix-submitted") | ✅ |
| 18 | **Platform ticket updated** | Ticket shows PR URL and completion status | ✅ |

### Success Criteria

- [ ] Ticket created in external integration appears in platform within 5 seconds
- [ ] Job executes without errors and completes within configured timeout
- [ ] Pull request is created with correct title, description, and branch
- [ ] Original integration ticket/issue is updated with PR URL
- [ ] Labels are updated to reflect completion status
- [ ] Platform ticket reflects final status with all references

---

## 2. Integration-Specific E2E Flows

### 2.1 GitHub Integration Flow

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Create GitHub issue with label "auto-fix" | Issue #N created in GitHub |
| 2 | Webhook delivery | X-GitHub-Delivery header received |
| 3 | Signature verification | HMAC-SHA256 signature validated |
| 4 | Ticket created | Platform ticket linked to issue #N |
| 5 | Auto-execute triggered | Label matches auto-fix configuration |
| 6 | Job completes | PR created referencing issue #N |
| 7 | Feedback posted | Comment on issue #N with PR URL |
| 8 | Labels updated | "fix-submitted" label added |

### 2.2 Jira Integration Flow

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Create Jira issue with "auto-fix" component | Issue PROJ-123 created in Jira |
| 2 | Webhook delivery | Jira webhook received |
| 3 | Ticket created | Platform ticket linked to PROJ-123 |
| 4 | Job executes | Clanker processes ticket |
| 5 | Feedback posted | Comment added to PROJ-123 |
| 6 | Status transition | Issue moved to "In Review" status |

### 2.3 Shortcut Integration Flow

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Create Shortcut story with label | Story #12345 created |
| 2 | Webhook delivery | Shortcut webhook received |
| 3 | Ticket created | Platform ticket linked to story |
| 4 | Job executes | Clanker processes ticket |
| 5 | Feedback posted | Comment on story with PR URL |

### 2.4 Manual Ticket Execution Flow

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Create ticket manually in platform | Ticket visible in UI |
| 2 | Upload screenshot/recording | Media assets stored |
| 3 | Select Clanker | Clanker assigned to ticket |
| 4 | Click "Run" | Job created and queued |
| 5 | Monitor execution | Real-time progress updates |
| 6 | Job completes | PR created, ticket updated |

---

## 3. Supporting Test Cases

All supporting tests validate components that enable the Main E2E Flow.

### 3.1 Project Management

| # | Test Case | Steps | Expected Result | Supports |
|---|-----------|-------|-----------------|----------|
| P-1 | Create project | POST `/api/projects` with name, slug | Project created, returns ID | Main Flow Step 1 |
| P-2 | Configure repositories | Update with `repositoryUrls` | Multiple repos saved | Main Flow Step 1 |
| P-3 | Set auto-fix tags | Update with `autoFixTags: ["bug"]` | Tags trigger auto-execution | Main Flow Step 5 |
| P-4 | Project CRUD | Create, read, update, delete | All operations work | Foundation |
| P-5 | Duplicate slug prevention | Create with existing slug | 409 Conflict error | Data integrity |

### 3.2 Integration Configuration

| # | Test Case | Steps | Expected Result | Supports |
|---|-----------|-------|-----------------|----------|
| I-1 | Create integration | POST `/api/integrations` | Integration created | Main Flow Step 2 |
| I-2 | Link to project | POST `/api/integrations/project/:id/link` | Link created | Main Flow Step 2 |
| I-3 | Test connection | POST `/api/integrations/:id/test` | Connection successful | Main Flow Step 2 |
| I-4 | Configure webhook | PUT `/api/integrations/:id/webhook` | Webhook URL returned | Main Flow Step 3 |
| I-5 | List available types | GET `/api/integrations/types/available` | All integrations listed | UI support |
| I-6 | Set primary integration | PUT primary endpoint | Primary flag set | Default behavior |

### 3.3 Ticket Management

| # | Test Case | Steps | Expected Result | Supports |
|---|-----------|-------|-----------------|----------|
| T-1 | Create ticket | POST `/api/tickets` | Ticket created | Main Flow Step 7 |
| T-2 | Create with screenshot | POST with multipart upload | Media stored | Manual flow |
| T-3 | Create with recording | POST with video file | Video stored | Manual flow |
| T-4 | Run ticket | POST `/api/tickets/:id/run` | Job created | Main Flow Step 8 |
| T-5 | Ticket with PR URL | View completed ticket | PR URL displayed | Main Flow Step 18 |
| T-6 | List by project | GET with project filter | Filtered results | UI support |

### 3.4 Job Execution

| # | Test Case | Steps | Expected Result | Supports |
|---|-----------|-------|-----------------|----------|
| J-1 | Submit job | POST `/api/jobs` | Job queued | Main Flow Step 8 |
| J-2 | Job starts | Worker picks up job | Status: active | Main Flow Step 9 |
| J-3 | Progress updates | POST `/api/jobs/:id/progress` | Progress recorded | Main Flow Step 12 |
| J-4 | Log streaming | POST `/api/jobs/:id/logs` | Logs stored | Observability |
| J-5 | Job completion | POST `/api/jobs/:id/result` | Status: completed | Main Flow Step 15 |
| J-6 | Result with PR URL | Submit result with PR URL | PR URL propagated | Main Flow Step 15 |
| J-7 | Job failure handling | Submit error result | Status: failed, error stored | Error handling |
| J-8 | Duplicate result prevention | Submit result twice | Second rejected | Data integrity |
| J-9 | Heartbeat tracking | Worker sends heartbeat | last_heartbeat updated | Worker health |
| J-10 | Orphan detection | Job without heartbeat | Marked as failed | Reliability |

### 3.5 Clanker Management

| # | Test Case | Steps | Expected Result | Supports |
|---|-----------|-------|-----------------|----------|
| C-1 | Create Clanker | POST `/api/clankers` | Clanker created | Main Flow Step 4 |
| C-2 | Start Clanker (Docker) | POST `/api/clankers/:id/start` | Status: active | Main Flow Step 4 |
| C-3 | Start Clanker (Lambda) | POST start with Lambda strategy | Lambda ready | Production |
| C-4 | Start Clanker (ECS) | POST start with ECS strategy | ECS task running | Production |
| C-5 | Health check | GET `/api/clankers/:id/health` | Health status returned | Main Flow Step 9 |
| C-6 | Stop Clanker | POST `/api/clankers/:id/stop` | Status: inactive | Cleanup |
| C-7 | Associate secrets | Update with secretIds | Secrets linked | Credential injection |
| C-8 | Upload instructions | PUT config file | Instructions stored | Agent behavior |

### 3.6 Webhook Processing

| # | Test Case | Steps | Expected Result | Supports |
|---|-----------|-------|-----------------|----------|
| W-1 | GitHub issue opened | POST `/api/webhooks/github` | Ticket created | Main Flow Step 6 |
| W-2 | Signature validation | Valid HMAC signature | Request processed | Security |
| W-3 | Invalid signature | Wrong HMAC | 401 Unauthorized | Security |
| W-4 | Duplicate delivery | Same X-GitHub-Delivery | Idempotent handling | Reliability |
| W-5 | Jira webhook | POST `/api/webhooks/jira` | Ticket created | Main Flow Step 6 |
| W-6 | Shortcut webhook | POST `/api/webhooks/shortcut` | Ticket created | Main Flow Step 6 |
| W-7 | Custom webhook | POST `/api/webhooks/custom/:id` | Ticket created | Extensibility |
| W-8 | Delivery logging | All webhooks logged | Delivery record created | Observability |
| W-9 | Failed delivery retry | POST retry endpoint | Delivery re-attempted | Reliability |

### 3.7 Feedback Loop

| # | Test Case | Steps | Expected Result | Supports |
|---|-----------|-------|-----------------|----------|
| F-1 | Post result on success | Job completes successfully | Comment posted with PR URL | Main Flow Step 16 |
| F-2 | Post result on failure | Job fails | Comment with error details | Error handling |
| F-3 | Update labels | Success/failure result | Labels added/removed | Main Flow Step 17 |
| F-4 | GitHub comment format | PR URL, execution time | Formatted markdown comment | UX |
| F-5 | Jira comment format | PR URL, details | Formatted comment | UX |
| F-6 | No external ticket | Job without ticket reference | Silent success | Edge case |
| F-7 | Retry failed feedback | POST retry endpoint | Feedback re-attempted | Reliability |

### 3.8 Secrets Management

| # | Test Case | Steps | Expected Result | Supports |
|---|-----------|-------|-----------------|----------|
| S-1 | Create secret | POST `/api/secrets` | Secret encrypted and stored | Foundation |
| S-2 | List secrets | GET `/api/secrets` | Values masked | Security |
| S-3 | Secret resolution | Worker requests credentials | Secrets decrypted | Main Flow Step 9 |
| S-4 | File provider | Local file storage | Secrets from encrypted file | Local dev |
| S-5 | SSM provider | AWS Parameter Store | Secrets from SSM | Production |
| S-6 | No credential logging | Check all logs | No plaintext values | Security |

### 3.9 Worker Execution

| # | Test Case | Steps | Expected Result | Supports |
|---|-----------|-------|-----------------|----------|
| V-1 | Repository clone | Worker starts | Repo cloned to /tmp | Main Flow Step 10 |
| V-2 | Branch creation | Clone succeeds | fix/{jobId} branch created | Main Flow Step 11 |
| V-3 | Instruction loading | Worker initializes | Instructions loaded | Agent behavior |
| V-4 | Credential injection | Worker ready | Credentials in environment | Main Flow Step 9 |
| V-5 | Agent execution | Worker runs | AI agent processes task | Main Flow Step 12 |
| V-6 | Changes committed | Agent completes | Commit with description | Main Flow Step 12 |
| V-7 | Branch pushed | Commit succeeds | Branch pushed to remote | Main Flow Step 13 |
| V-8 | PR creation | Push succeeds | Pull request opened | Main Flow Step 14 |
| V-9 | Result callback | PR created | Platform updated | Main Flow Step 15 |
| V-10 | Workspace cleanup | Job completes | /tmp workspace deleted | Cleanup |
| V-11 | Log forwarding | Throughout execution | Logs batched and sent | Observability |

### 3.10 Frontend UI

| # | Test Case | Steps | Expected Result | Supports |
|---|-----------|-------|-----------------|----------|
| UI-1 | Dashboard loads | Navigate to `/` | Project overview displayed | Foundation |
| UI-2 | Project detail | Navigate to `/project/[slug]` | Project info displayed | Foundation |
| UI-3 | Jobs monitoring | View jobs list | Real-time status updates | Main Flow Step 12 |
| UI-4 | Job logs | Click job row | Log stream displayed | Observability |
| UI-5 | Create ticket form | Navigate to enhance page | Form with media upload | Manual flow |
| UI-6 | Integration settings | Configure integration | Connection test UI | Main Flow Step 2 |
| UI-7 | Webhook configuration | Webhook settings page | URL and secret display | Main Flow Step 3 |
| UI-8 | Clanker management | Clanker list/start/stop | Status and health visible | Main Flow Step 4 |
| UI-9 | Responsive layout | Various viewports | Mobile-friendly | UX |
| UI-10 | Cross-browser | Chrome, Firefox, Safari | All features work | Compatibility |

---

## 4. Error Handling & Edge Cases

### 4.1 Webhook Errors

| # | Test Case | Scenario | Expected Behavior |
|---|-----------|----------|-------------------|
| E-W-1 | Invalid signature | Wrong HMAC in header | 401 Unauthorized, logged |
| E-W-2 | Missing signature | No X-Hub-Signature-256 | 401 Unauthorized |
| E-W-3 | Malformed payload | Invalid JSON | 400 Bad Request |
| E-W-4 | Unknown event type | Unsupported X-GitHub-Event | 200 OK, ignored |
| E-W-5 | Replay attack | Reused delivery ID | Deduplicated/rejected |
| E-W-6 | Integration not found | Webhook for deleted integration | 404, logged |
| E-W-7 | Rate limiting | Too many webhooks | 429 Too Many Requests |

### 4.2 Job Execution Errors

| # | Test Case | Scenario | Expected Behavior |
|---|-----------|----------|-------------------|
| E-J-1 | Clone failure | Invalid repository URL | Job fails with clear error |
| E-J-2 | Auth failure | Invalid Git credentials | Job fails, credentials error |
| E-J-3 | Branch exists | Branch already exists | Unique branch created |
| E-J-4 | No changes | Agent makes no changes | Job completes with warning |
| E-J-5 | Push rejected | Remote rejects push | Job fails with "push failed" |
| E-J-6 | PR creation failure | No repo write access | Job fails, permission error |
| E-J-7 | Agent timeout | Agent exceeds timeout | Job fails, timeout error |
| E-J-8 | Worker crash | Worker killed mid-job | Marked orphaned after heartbeat |
| E-J-9 | Callback failure | Platform unreachable | Logs buffered, continues |

### 4.3 Feedback Loop Errors

| # | Test Case | Scenario | Expected Behavior |
|---|-----------|----------|-------------------|
| E-F-1 | Comment post failure | API error | Logged, job still completes |
| E-F-2 | Label update failure | Permission denied | Logged, comment still posted |
| E-F-3 | Integration API down | External service 5xx | Retry with backoff |
| E-F-4 | Invalid external ticket | Ticket deleted | Logged, silent success |

### 4.4 Integration-Specific Errors

| # | Test Case | Scenario | Expected Behavior |
|---|-----------|----------|-------------------|
| E-I-1 | GitHub API rate limit | 403 rate limit | Backoff and retry |
| E-I-2 | Jira auth expired | 401 unauthorized | Clear error message |
| E-I-3 | Shortcut webhook invalid | Wrong signature | 401 rejected |

---

## 5. Security Testing

### 5.1 Authentication & Authorization

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| SEC-1 | Tenant isolation | Request with different tenant ID | Only own data returned |
| SEC-2 | Cross-tenant access | Try to access other tenant's job | 403 Forbidden |
| SEC-3 | Webhook signature | Valid/invalid HMAC | Processed/rejected |
| SEC-4 | Credential encryption | Store secret | Value encrypted at rest |
| SEC-5 | Credential masking | GET secret endpoint | Value not returned |
| SEC-6 | No credential logging | Check all logs | No plaintext values |

### 5.2 Input Validation

| # | Test Case | Input | Expected Result |
|---|-----------|-------|-----------------|
| SEC-7 | SQL injection | `'; DROP TABLE projects;--` | Sanitized, no injection |
| SEC-8 | XSS in title | `<script>alert('xss')</script>` | HTML escaped |
| SEC-9 | Path traversal | `../../etc/passwd` | Path validated, rejected |
| SEC-10 | Command injection | `; rm -rf /` | Input sanitized |

### 5.3 File Upload Security

| # | Test Case | Input | Expected Result |
|---|-----------|-------|-----------------|
| SEC-11 | Executable upload | Upload .exe file | Rejected |
| SEC-12 | MIME type validation | Fake extension | Rejected |
| SEC-13 | File size limit | Upload >100MB file | 413 Payload Too Large |
| SEC-14 | Signed URL expiration | Use expired URL | Access denied |

---

## 6. Performance Testing

### 6.1 Load Testing

| # | Test Case | Load | Expected Result |
|---|-----------|------|-----------------|
| PERF-1 | Concurrent webhooks | 10/second | All processed |
| PERF-2 | Concurrent jobs | 50 jobs submitted | All queued successfully |
| PERF-3 | API request rate | 100 req/second | <200ms p95 latency |
| PERF-4 | Large job list | 10,000 jobs | Pagination works, <2s |

### 6.2 Worker Performance

| # | Test Case | Scenario | Expected Result |
|---|-----------|----------|-----------------|
| PERF-5 | Job execution time | Standard task | Completes within timeout |
| PERF-6 | Log ingestion | 1000 logs/second | All logs stored |
| PERF-7 | Large file upload | 500MB recording | Upload completes |
| PERF-8 | Many concurrent workers | 20 concurrent jobs | All complete |

---

## 7. Environment Testing

### 7.1 Local Development

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| ENV-L-1 | Docker Compose start | `docker-compose up -d` | All services start |
| ENV-L-2 | Database connectivity | Check backend logs | "Database connected" |
| ENV-L-3 | Frontend accessible | Navigate to localhost:3000 | Dashboard loads |
| ENV-L-4 | API health | GET `/health` | 200 OK |
| ENV-L-5 | Local Clanker execution | Start Docker Clanker | Job executes locally |

### 7.2 Production

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| ENV-P-1 | ECS service health | Check AWS console | Healthy tasks running |
| ENV-P-2 | Lambda functions | Check Lambda console | Functions deployed |
| ENV-P-3 | SSM parameters | Check Parameter Store | Secrets present |
| ENV-P-4 | S3 buckets | Check S3 console | Buckets exist |
| ENV-P-5 | Lambda invocation | Submit job | Function invoked |
| ENV-P-6 | ECS task launch | Submit ECS job | Task started |

---

## 8. Appendices

### Appendix A: Test Data Fixtures

#### Sample Project
```json
{
  "name": "Test Project",
  "slug": "test-project",
  "repositoryUrls": ["https://github.com/org/repo"],
  "agentInstructions": "Focus on code quality",
  "autoFixTags": ["bug", "hotfix"]
}
```

#### Sample Ticket
```json
{
  "title": "Fix login button not responding",
  "description": "The login button on the homepage does not respond to clicks",
  "severity": "high",
  "category": "bug",
  "projectId": "<project-uuid>",
  "autoFixRequested": true
}
```

#### Sample Clanker
```json
{
  "name": "Docker Dev Clanker",
  "slug": "docker-dev",
  "deploymentStrategyId": "<docker-strategy-uuid>",
  "deploymentConfig": {
    "image": "viberator-worker:latest"
  },
  "secretIds": ["<github-token-secret-uuid>"]
}
```

#### Sample GitHub Webhook Payload
```json
{
  "action": "opened",
  "issue": {
    "number": 123,
    "title": "Bug: Login fails",
    "body": "Steps to reproduce...",
    "labels": [{"name": "bug"}, {"name": "auto-fix"}]
  },
  "repository": {
    "full_name": "org/repo"
  }
}
```

### Appendix B: Quick Reference Commands

```bash
# Run all unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Setup E2E environment
npm run test:e2e:setup

# Run E2E tests
npm run test:e2e

# Teardown E2E environment
npm run test:e2e:teardown
```

### Appendix C: Environment Comparison

| Feature | Local (Docker) | Production (ECS) | Production (Lambda) |
|---------|----------------|------------------|---------------------|
| Worker invocation | Docker container | ECS Fargate task | Lambda function |
| Credential storage | Local file | AWS SSM | AWS SSM |
| File storage | Local volume | S3 | S3 |
| Instruction files | Local mount | S3 | S3 |
| Network | Docker bridge | VPC | VPC |
| Scaling | Manual | ECS auto-scaling | Lambda auto-scaling |

### Appendix D: API Endpoints Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects` | GET, POST | List/create projects |
| `/api/projects/:id` | GET, PUT, DELETE | Project CRUD |
| `/api/tickets` | GET, POST | List/create tickets |
| `/api/tickets/:id/run` | POST | Execute ticket |
| `/api/jobs` | GET, POST | List/submit jobs |
| `/api/jobs/:id/result` | POST | Submit result |
| `/api/clankers` | GET, POST | List/create clankers |
| `/api/clankers/:id/start` | POST | Start clanker |
| `/api/clankers/:id/stop` | POST | Stop clanker |
| `/api/integrations` | GET, POST | Manage integrations |
| `/api/integrations/:id/test` | POST | Test connection |
| `/api/integrations/:id/webhook` | PUT | Configure webhook |
| `/api/webhooks/github` | POST | GitHub webhook receiver |
| `/api/webhooks/jira` | POST | Jira webhook receiver |
| `/api/webhooks/shortcut` | POST | Shortcut webhook receiver |
| `/api/secrets` | GET, POST | Manage secrets |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-29 | Claude | Initial draft |
| 1.1 | 2026-01-29 | Claude | Added Section 15: Comprehensive Negative Test Cases |
| 2.0 | 2026-01-31 | Claude | **Major restructuring** - Reorganized around Main E2E Flow as centerpiece, added Integration-Specific Flows section, reorganized all supporting tests to reference which main flow step they support, consolidated error handling, security, and performance sections |
