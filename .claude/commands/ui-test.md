# Viberator Platform Testing

Execute tests from the TESTING_PLAN.md for the Viberator platform.

## Usage

```
/ui-test [section]
```

## Available Sections

| Section | Name | Description |
|---------|------|-------------|
| `1` or `env` | Environment Setup | Verify local and production environment prerequisites |
| `2` or `projects` | Project Management | Test project CRUD, configuration, and integrations |
| `3` or `tickets` | Ticket Management | Test ticket CRUD, media assets, and workflow |
| `4` or `jobs` | Job Execution | Test job lifecycle, state machine, heartbeat, and ticket integration |
| `5` or `clankers` | Clanker Management | Test clanker CRUD, deployment, config files, and secrets |
| `6` or `webhooks` | Webhook Integration | Test webhook configuration and GitHub events |
| `7` or `secrets` | Secrets Management | Test secret CRUD and resolution |
| `8` or `worker` | Worker Execution Flows | Test Docker/Lambda/ECS invokers and worker execution |
| `9` or `ui` | Frontend UI Testing | Test dashboard, pages, forms, and responsive design |
| `10` or `integration` | Integration Testing | End-to-end flows: GitHub issue to PR, manual execution |
| `11` or `errors` | Error Handling | Test API error responses, worker recovery, frontend errors |
| `12` or `security` | Security Testing | Test auth, webhook security, credentials, input validation |
| `13` or `performance` | Performance Testing | Load testing, stress testing, database performance |
| `14` or `deployment` | Production Deployment | Pre-deployment checklist, verification, rollback, smoke tests |
| `15` or `negative` | Negative Test Cases | Invalid inputs, auth bypass, rate limiting, edge cases |
| `all` | All Sections | Run all tests (default) |

## Prerequisites

- Local development environment running (`docker-compose up`)
- Frontend accessible at `http://localhost:3000`
- Backend API running at `http://localhost:8888`

---

## Section 1: Environment Setup

### 1.2 Local Environment Verification

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1.2.1 | Start local stack | Run `docker-compose up -d` | All containers start: postgres, backend, frontend |
| 1.2.2 | Database connectivity | Check backend logs | "Database connected" message appears |
| 1.2.3 | Frontend accessible | Navigate to `http://localhost:3000` | Dashboard loads without errors |
| 1.2.4 | API health check | `GET http://localhost:8888/health` | Returns 200 OK |
| 1.2.5 | Database migrations | Check migration status | All migrations applied successfully |

### 1.3 Production Environment Verification

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1.3.1 | ECS service health | Check AWS ECS console | Backend service running, healthy tasks |
| 1.3.2 | Lambda functions | Check AWS Lambda console | Worker functions deployed |
| 1.3.3 | SSM parameters | Check Parameter Store | Required secrets present |
| 1.3.4 | S3 buckets | Check S3 console | File and instruction buckets exist |
| 1.3.5 | API Gateway | Test production URL | Returns 200 OK |

---

## Section 2: Project Management

### 2.1 Project CRUD Operations

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 2.1.1 | Create project | POST `/api/projects` with name, slug | Project created, returns ID |
| 2.1.2 | Create project with duplicate slug | POST with existing slug | 400 error, "slug already exists" |
| 2.1.3 | List projects | GET `/api/projects` | Returns paginated project list |
| 2.1.4 | Get project by ID | GET `/api/projects/:id` | Returns project details |
| 2.1.5 | Get project by slug | GET `/api/projects/by-name/:slug` | Returns project details |
| 2.1.6 | Update project | PUT `/api/projects/:id` | Project updated successfully |
| 2.1.7 | Delete project | DELETE `/api/projects/:id` | Project deleted, cascades to tickets/jobs |

### 2.2 Project Configuration

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 2.2.1 | Set single repository | Update with `repositoryUrls: ["url"]` | Repository saved |
| 2.2.2 | Set multiple repositories | Update with `repositoryUrls: ["url1", "url2"]` | All repositories saved |
| 2.2.3 | Set agent instructions | Update with `agentInstructions` | Instructions persisted |
| 2.2.4 | Configure auto-fix tags | Update with `autoFixTags: ["bug", "hotfix"]` | Tags saved |
| 2.2.5 | Invalid repository URL | Update with malformed URL | Validation error returned |

### 2.3 Project Integrations

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 2.3.1 | List integrations | GET `/api/projects/:id/integrations` | Returns available integrations |
| 2.3.2 | Configure Jira | PUT integration with Jira credentials | Integration saved |
| 2.3.3 | Configure Linear | PUT integration with Linear API key | Integration saved |
| 2.3.4 | Configure GitHub | PUT integration with GitHub token | Integration saved |
| 2.3.5 | Test Jira connection | POST `/integrations/:id/test` | Connection successful or clear error |
| 2.3.6 | Test with invalid creds | POST test with bad credentials | Clear authentication error |
| 2.3.7 | Remove integration | DELETE integration | Integration removed |

---

## Section 3: Ticket Management

### 3.1 Ticket CRUD Operations

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 3.1.1 | Create ticket | POST `/api/tickets` with title, projectId | Ticket created |
| 3.1.2 | Create ticket with screenshot | POST with multipart file upload | Ticket created, media asset stored |
| 3.1.3 | Create ticket with recording | POST with video file | Ticket created, recording stored |
| 3.1.4 | Create ticket with both media | POST with screenshot + recording | Both media assets stored |
| 3.1.5 | List tickets by project ID | GET `/api/tickets?projectId=X` | Filtered ticket list |
| 3.1.6 | List tickets by project slug | GET `/api/tickets?projectSlug=X` | Filtered ticket list |
| 3.1.7 | Get single ticket | GET `/api/tickets/:id` | Full ticket details with media |
| 3.1.8 | Update ticket | PUT `/api/tickets/:id` | Ticket updated |
| 3.1.9 | Delete ticket | DELETE `/api/tickets/:id` | Ticket and media deleted |

### 3.2 Media Asset Handling

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 3.2.1 | Upload PNG screenshot | POST with PNG file | File stored in S3/local |
| 3.2.2 | Upload JPEG screenshot | POST with JPEG file | File stored correctly |
| 3.2.3 | Upload MP4 recording | POST with video/mp4 | Video stored correctly |
| 3.2.4 | Upload WebM recording | POST with video/webm | Video stored correctly |
| 3.2.5 | Get signed URL | GET `/tickets/:id/media/:mediaId/signed-url` | Returns valid signed URL |
| 3.2.6 | Access expired URL | Use expired signed URL | 403 Forbidden |
| 3.2.7 | Large file upload (50MB) | POST with large file | Upload completes successfully |
| 3.2.8 | Invalid file type | POST with .exe file | 400 error, invalid file type |

### 3.3 Ticket Workflow

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 3.3.1 | Request auto-fix | Update `autoFixRequested: true` | Flag set, ready for job |
| 3.3.2 | Run ticket | POST `/api/tickets/:id/run` with clankerId | Job created and queued |
| 3.3.3 | Ticket with completed job | View ticket after job completion | Shows PR URL |
| 3.3.4 | Get ticket stats | GET `/api/tickets/stats` | Returns statistics |

---

## Section 4: Job Execution

### 4.1 Job Lifecycle

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 4.1.1 | Submit job | POST `/api/jobs` with task, repository | Job created with status "queued" |
| 4.1.2 | Job starts | Worker picks up job | Status changes to "active" |
| 4.1.3 | Job progress update | POST `/api/jobs/:id/progress` | Progress recorded |
| 4.1.4 | Job log entry | POST `/api/jobs/:id/logs` | Log entry stored |
| 4.1.5 | Job batch logs | POST `/api/jobs/:id/logs/batch` | All logs stored efficiently |
| 4.1.6 | Job completion | POST `/api/jobs/:id/result` with success | Status "completed", result stored |
| 4.1.7 | Job failure | POST result with error | Status "failed", error stored |
| 4.1.8 | Get job details | GET `/api/jobs/:id` | Returns full job with logs |
| 4.1.9 | List jobs by status | GET `/api/jobs?status=active` | Filtered job list |
| 4.1.10 | List jobs by project | GET `/api/jobs?projectSlug=X` | Filtered job list |

### 4.2 Job State Machine

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 4.2.1 | Queued to active | Worker claims job | Transition allowed |
| 4.2.2 | Active to completed | Submit success result | Transition allowed |
| 4.2.3 | Active to failed | Submit failure result | Transition allowed |
| 4.2.4 | Update completed job | Try to update completed job | 409 Conflict error |
| 4.2.5 | Update failed job | Try to update failed job | 409 Conflict error |
| 4.2.6 | Duplicate result submission | Submit result twice | Second request rejected |

### 4.3 Job Heartbeat & Orphan Detection

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 4.3.1 | Heartbeat update | Worker sends heartbeat | `last_heartbeat` updated |
| 4.3.2 | Stale job detection | Job without heartbeat > grace period | Job marked as orphaned/failed |
| 4.3.3 | Queue statistics | GET `/api/jobs/stats/queue` | Returns queue depth, active count |

### 4.4 Job with Ticket Integration

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 4.4.1 | Job from ticket | Create job via ticket run | Job has ticketId reference |
| 4.4.2 | PR URL propagation | Job completes with PR | Ticket updated with PR URL |
| 4.4.3 | Job failure on ticket | Job fails | Ticket status reflects failure |

---

## Section 5: Clanker Management

### 5.1 Clanker CRUD Operations

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 5.1.1 | Create clanker | POST `/api/clankers` with name, strategy | Clanker created |
| 5.1.2 | Create with duplicate slug | POST with existing slug | 400 error |
| 5.1.3 | List clankers | GET `/api/clankers` | Returns all clankers |
| 5.1.4 | Get by ID | GET `/api/clankers/:id` | Returns clanker details |
| 5.1.5 | Get by slug | GET `/api/clankers/by-slug/:slug` | Returns clanker details |
| 5.1.6 | Update clanker | PUT `/api/clankers/:id` | Clanker updated |
| 5.1.7 | Delete clanker | DELETE `/api/clankers/:id` | Clanker deleted |

### 5.2 Clanker Deployment

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 5.2.1 | Start clanker (Docker) | POST `/api/clankers/:id/start` | Status: deploying -> active |
| 5.2.2 | Start clanker (Lambda) | POST start with Lambda strategy | Lambda function ready |
| 5.2.3 | Start clanker (ECS) | POST start with ECS strategy | ECS task running |
| 5.2.4 | Stop clanker | POST `/api/clankers/:id/stop` | Status: inactive |
| 5.2.5 | Health check | GET `/api/clankers/:id/health` | Returns health status |
| 5.2.6 | Deployment failure | Start with invalid config | Status: failed, error message |

### 5.3 Clanker Configuration Files

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 5.3.1 | List config files | GET `/api/clankers/:id/config-files` | Returns file list |
| 5.3.2 | Upload instruction file | PUT config file content | File stored |
| 5.3.3 | Get instruction file | GET `/api/clankers/:id/config-files/:type` | Returns file content |
| 5.3.4 | Delete config file | DELETE config file | File removed |
| 5.3.5 | Invalid file type | PUT with invalid file type | 400 error |

### 5.4 Clanker Secret Association

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 5.4.1 | Associate secrets | Update with secretIds | Secrets linked |
| 5.4.2 | Resolve secrets | Worker requests credentials | Secrets decrypted and returned |
| 5.4.3 | Invalid secret ID | Associate non-existent secret | Error on job execution |

---

## Section 6: Webhook Integration

### 6.1 Webhook Configuration

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 6.1.1 | Create GitHub webhook config | POST `/api/webhooks/configs` | Config created with secret |
| 6.1.2 | List webhook configs | GET `/api/webhooks/configs` | Returns all configs |
| 6.1.3 | Update webhook config | PUT `/api/webhooks/configs/:id` | Config updated |
| 6.1.4 | Test webhook config | POST `/api/webhooks/configs/:id/test` | Test delivery attempted |
| 6.1.5 | Delete webhook config | DELETE `/api/webhooks/configs/:id` | Config removed |

### 6.2 GitHub Webhook Events

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 6.2.1 | Issue opened event | POST `/api/webhooks/github` with issue event | Ticket created |
| 6.2.2 | Issue comment event | POST with issue_comment | Comment processed |
| 6.2.3 | Issue with auto-fix label | Send issue with configured label | Ticket auto-execute triggered |
| 6.2.4 | Issue with bot mention | Comment mentions bot | Auto-execute triggered |
| 6.2.5 | Invalid signature | POST with wrong HMAC | 401 Unauthorized |
| 6.2.6 | Missing signature | POST without X-Hub-Signature-256 | 401 Unauthorized |
| 6.2.7 | Duplicate delivery | Send same X-GitHub-Delivery twice | Second ignored, idempotent |

### 6.3 Webhook Delivery Management

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 6.3.1 | View failed deliveries | GET `/api/webhooks/deliveries` | Returns failed delivery list |
| 6.3.2 | Retry failed delivery | POST `/api/webhooks/deliveries/:id/retry` | Delivery re-attempted |
| 6.3.3 | Webhook status | GET `/api/webhooks/status` | Returns processing status |

---

## Section 7: Secrets Management

### 7.1 Secret CRUD Operations

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 7.1.1 | Create secret | POST `/api/secrets` with name, value | Secret encrypted and stored |
| 7.1.2 | List secrets | GET `/api/secrets` | Returns secret list (values masked) |
| 7.1.3 | Get secret metadata | GET `/api/secrets/:id` | Returns metadata, not value |
| 7.1.4 | Update secret | PUT `/api/secrets/:id` | Secret value updated |
| 7.1.5 | Delete secret | DELETE `/api/secrets/:id` | Secret removed |

### 7.2 Secret Resolution (Worker Context)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 7.2.1 | File provider resolution | Configure FileProvider | Secrets from encrypted file |
| 7.2.2 | SSM provider resolution | Configure AwsSsmProvider | Secrets from Parameter Store |
| 7.2.3 | Environment provider | Configure EnvironmentProvider | Secrets from env vars |
| 7.2.4 | Non-existent secret | Request missing secret | Clear error message |
| 7.2.5 | Cross-tenant access | Request other tenant's secret | Access denied |

---

## Section 8: Worker Execution Flows

### 8.1 Docker Invoker (Local Development)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 8.1.1 | Worker container starts | Submit job with Docker strategy | Container spawned |
| 8.1.2 | Payload passed correctly | Check container environment | All job data present |
| 8.1.3 | Platform API reachable | Worker calls back to platform | Callbacks succeed |
| 8.1.4 | Container cleanup | Job completes | Container removed |
| 8.1.5 | Linux host.docker.internal | Run on Linux host | Network mapping works |

### 8.2 Lambda Invoker (Production)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 8.2.1 | Lambda invocation | Submit job with Lambda strategy | Function invoked async |
| 8.2.2 | Instruction files in S3 | Check S3 bucket | Files uploaded before invocation |
| 8.2.3 | Credentials from SSM | Worker resolves credentials | SSM parameters fetched |
| 8.2.4 | Execution ID returned | Check job execution_id | Lambda RequestId stored |
| 8.2.5 | Cold start handling | First invocation after idle | Completes within timeout |

### 8.3 ECS Invoker (Production)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 8.3.1 | ECS task starts | Submit job with ECS strategy | Fargate task running |
| 8.3.2 | Environment overrides | Check task environment | Job data in env vars |
| 8.3.3 | Network configuration | Task has network access | Can reach platform API |
| 8.3.4 | Task ARN stored | Check job execution_id | Task ARN recorded |
| 8.3.5 | Cluster selection | Multiple clusters configured | Correct cluster used |

### 8.4 Viberator Worker Execution

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 8.4.1 | Repository clone | Worker starts | Repo cloned to /tmp |
| 8.4.2 | Branch creation | Clone succeeds | fix/{jobId} branch created |
| 8.4.3 | Instruction file loading | Worker initializes | Instructions loaded from S3/local |
| 8.4.4 | Credential injection | Worker ready | Credentials in environment |
| 8.4.5 | Agent invocation | Worker executes | AI agent runs with context |
| 8.4.6 | Changes committed | Agent completes | Commit with job description |
| 8.4.7 | Branch pushed | Commit succeeds | Branch pushed to remote |
| 8.4.8 | PR created | Push succeeds | Pull request opened |
| 8.4.9 | Result callback | PR created | Platform updated with PR URL |
| 8.4.10 | Workspace cleanup | Job completes | /tmp workspace deleted |
| 8.4.11 | Log forwarding | Throughout execution | Logs batched and sent |

### 8.5 Configuration Merging

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 8.5.1 | Override settings | Ticket enhance with overrides | Override takes precedence |
| 8.5.2 | Project settings | No override, project has settings | Project settings used |
| 8.5.3 | Clanker settings | No override/project settings | Clanker settings used |
| 8.5.4 | Job settings | No other settings | Job defaults used |
| 8.5.5 | Merge precedence | All levels have settings | Correct precedence applied |

### 8.6 Worker Error Scenarios

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 8.6.1 | Clone failure | Invalid repository URL | Job fails with clear error |
| 8.6.2 | Branch exists | Branch already exists | Unique branch created or error |
| 8.6.3 | No changes made | Agent makes no changes | Job completes with warning |
| 8.6.4 | Push auth failure | Invalid credentials | Job fails, credentials error |
| 8.6.5 | PR creation failure | No repo write access | Job fails, permission error |
| 8.6.6 | Agent timeout | Agent exceeds timeout | Job fails, timeout error |
| 8.6.7 | Callback failure | Platform unreachable | Logs buffered, job continues |

---

## Section 9: Frontend UI Testing

### 9.1 Dashboard

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 9.1.1 | Dashboard loads | Navigate to `/` | Project overview displayed |
| 9.1.2 | Project list | View dashboard | All projects listed |
| 9.1.3 | Project click | Click project card | Navigates to project detail |
| 9.1.4 | Empty state | No projects exist | "Create project" prompt shown |

### 9.2 Project Pages

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 9.2.1 | Project detail | Navigate to `/project/[slug]` | Project info displayed |
| 9.2.2 | Jobs list | Navigate to `/project/[slug]/jobs` | Jobs table with status |
| 9.2.3 | Job detail | Click job row | Job logs and progress shown |
| 9.2.4 | Real-time updates | Job running | Status updates live |
| 9.2.5 | Job filtering | Filter by status | Table filters correctly |

### 9.3 Ticket Creation (Enhance Page)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 9.3.1 | Enhance form loads | Navigate to `/project/[slug]/enhance` | Form displayed |
| 9.3.2 | Title input | Enter title | Value saved |
| 9.3.3 | Description input | Enter description | Value saved |
| 9.3.4 | Screenshot upload | Click and select file | Preview shown |
| 9.3.5 | Recording upload | Click and select video | Preview shown |
| 9.3.6 | Clanker selection | Select from dropdown | Clanker selected |
| 9.3.7 | Submit form | Click submit | Ticket created, job started |
| 9.3.8 | Form validation | Submit empty form | Validation errors shown |

### 9.4 Settings Pages

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 9.4.1 | Settings layout | Navigate to settings | Tabs/navigation displayed |
| 9.4.2 | AI settings | Navigate to `/settings/ai` | Clanker config form |
| 9.4.3 | Webhook settings | Navigate to `/settings/webhooks` | Webhook config form |
| 9.4.4 | Project settings | Navigate to `/settings/project` | Project config form |
| 9.4.5 | Save settings | Update and save | Success notification |
| 9.4.6 | Invalid settings | Enter invalid data | Error message shown |

### 9.5 Clanker Pages

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 9.5.1 | Clanker list | Navigate to `/clankers` | All clankers listed |
| 9.5.2 | Create clanker | Navigate to `/clankers/new` | Creation form |
| 9.5.3 | Edit clanker | Navigate to `/clankers/[slug]/edit` | Edit form with data |
| 9.5.4 | Start/stop buttons | Click start/stop | Status changes |
| 9.5.5 | Health indicator | View clanker | Health status shown |

### 9.6 New Project Flow

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 9.6.1 | New project page | Navigate to `/new` | Creation wizard |
| 9.6.2 | Step through wizard | Complete each step | Progress tracked |
| 9.6.3 | Repository input | Enter repo URL | URL validated |
| 9.6.4 | Submit project | Complete wizard | Project created, redirect |

### 9.7 Cross-Browser Testing

| # | Test Case | Browser | Expected Result |
|---|-----------|---------|-----------------|
| 9.7.1 | Full functionality | Chrome | All features work |
| 9.7.2 | Full functionality | Firefox | All features work |
| 9.7.3 | Full functionality | Safari | All features work |
| 9.7.4 | Full functionality | Edge | All features work |

### 9.8 Responsive Design

| # | Test Case | Viewport | Expected Result |
|---|-----------|----------|-----------------|
| 9.8.1 | Desktop layout | 1920x1080 | Full layout displayed |
| 9.8.2 | Laptop layout | 1366x768 | Responsive adjustments |
| 9.8.3 | Tablet layout | 768x1024 | Mobile-friendly layout |
| 9.8.4 | Mobile layout | 375x667 | Mobile navigation works |

---

## Section 10: Integration Testing

### 10.1 End-to-End: GitHub Issue to PR

| # | Step | Action | Verification |
|---|------|--------|--------------|
| 10.1.1 | Setup | Create project with GitHub repo | Project exists |
| 10.1.2 | Configure webhook | Add GitHub webhook config | Config saved |
| 10.1.3 | Configure clanker | Create and start Docker clanker | Clanker active |
| 10.1.4 | Create GitHub issue | Open issue in repo with auto-fix label | Issue created |
| 10.1.5 | Webhook received | Check platform logs | Webhook processed |
| 10.1.6 | Ticket created | Check tickets API | Ticket exists |
| 10.1.7 | Job started | Check jobs API | Job status: active |
| 10.1.8 | Worker executes | Monitor job logs | Progress updates appear |
| 10.1.9 | PR created | Check GitHub repo | PR opened |
| 10.1.10 | Job completed | Check job status | Status: completed, PR URL |
| 10.1.11 | Ticket updated | Check ticket | PR URL propagated |

### 10.2 End-to-End: Manual Ticket Execution

| # | Step | Action | Verification |
|---|------|--------|--------------|
| 10.2.1 | Create project | Via API or UI | Project exists |
| 10.2.2 | Create clanker | Docker strategy, active | Clanker ready |
| 10.2.3 | Create ticket | With screenshot upload | Ticket with media |
| 10.2.4 | Run ticket | POST `/tickets/:id/run` | Job queued |
| 10.2.5 | Monitor job | Poll job status | Progress visible |
| 10.2.6 | Verify PR | Check repository | PR created |
| 10.2.7 | Verify cleanup | Check /tmp on worker | Workspace cleaned |

### 10.3 Multi-Repository Project

| # | Step | Action | Verification |
|---|------|--------|--------------|
| 10.3.1 | Create project | With multiple `repositoryUrls` | Project saved |
| 10.3.2 | Create tickets | For different repos | Tickets reference correct repos |
| 10.3.3 | Run jobs | Against different repos | Each job clones correct repo |
| 10.3.4 | Verify PRs | Check each repo | PRs in correct repos |

### 10.4 Credential Lifecycle

| # | Step | Action | Verification |
|---|------|--------|--------------|
| 10.4.1 | Create secret | Store Git credentials | Secret encrypted |
| 10.4.2 | Associate with clanker | Update clanker secretIds | Association saved |
| 10.4.3 | Run job | Execute with clanker | Worker fetches credentials |
| 10.4.4 | Verify injection | Check worker environment | Credentials present |
| 10.4.5 | Verify cleanup | After job completion | Credentials not persisted |
| 10.4.6 | Verify no logging | Check all logs | No credential values logged |

### 10.5 Webhook Deduplication

| # | Step | Action | Verification |
|---|------|--------|--------------|
| 10.5.1 | Send webhook | POST with X-GitHub-Delivery: abc123 | Ticket created |
| 10.5.2 | Send duplicate | POST with same delivery ID | Request accepted |
| 10.5.3 | Verify single ticket | Check tickets | Only one ticket exists |
| 10.5.4 | Check delivery log | GET `/webhooks/deliveries` | Shows single delivery |

---

## Section 11: Error Handling

### 11.1 API Error Responses

| # | Test Case | Input | Expected Response |
|---|-----------|-------|-------------------|
| 11.1.1 | Invalid project ID | GET `/projects/invalid-uuid` | 400 Bad Request |
| 11.1.2 | Non-existent project | GET `/projects/valid-but-missing` | 404 Not Found |
| 11.1.3 | Missing required field | POST without required field | 400 with field name |
| 11.1.4 | Invalid file type | Upload .exe file | 400 Invalid file type |
| 11.1.5 | Terminal job update | Update completed job | 409 Conflict |
| 11.1.6 | Invalid webhook signature | Wrong HMAC | 401 Unauthorized |
| 11.1.7 | Database connection lost | During request | 500 with retry guidance |

### 11.2 Worker Error Recovery

| # | Test Case | Scenario | Expected Behavior |
|---|-----------|----------|-------------------|
| 11.2.1 | Transient clone error | Network timeout | Retry with backoff |
| 11.2.2 | Permanent clone error | Repo not found | Fail immediately |
| 11.2.3 | Max retries exceeded | 3 consecutive failures | Job marked failed |
| 11.2.4 | Callback failure | Platform unreachable | Buffer logs, continue |
| 11.2.5 | Workspace cleanup fail | Permission error | Log warning, continue |

### 11.3 Frontend Error Handling

| # | Test Case | Scenario | Expected Behavior |
|---|-----------|----------|-------------------|
| 11.3.1 | API timeout | Slow backend response | Loading indicator, timeout message |
| 11.3.2 | API 500 error | Server error | User-friendly error message |
| 11.3.3 | Network offline | No connectivity | Offline indicator |
| 11.3.4 | Form validation | Invalid input | Inline field errors |
| 11.3.5 | File upload failure | Upload fails | Clear error, retry option |

---

## Section 12: Security Testing

### 12.1 Authentication & Authorization

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 12.1.1 | Tenant isolation | Request with different tenant ID | Only own data returned |
| 12.1.2 | Cross-tenant access | Try to access other tenant's job | 403 Forbidden |
| 12.1.3 | Invalid tenant ID | Request with special characters | 400 Bad Request |
| 12.1.4 | Missing tenant ID | Request without tenant header | Default tenant used |

### 12.2 Webhook Security

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 12.2.1 | Valid HMAC signature | Correct X-Hub-Signature-256 | Request processed |
| 12.2.2 | Invalid HMAC signature | Wrong signature | 401 Unauthorized |
| 12.2.3 | Missing signature | No signature header | 401 Unauthorized |
| 12.2.4 | Replay attack | Reuse old delivery | Deduplicated/rejected |

### 12.3 Credential Security

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 12.3.1 | Credential encryption | Store secret | Value encrypted at rest |
| 12.3.2 | Credential in API response | GET secret | Value masked/not returned |
| 12.3.3 | Credential in logs | Check all logs | No plaintext credentials |
| 12.3.4 | Credential cleanup | After job completion | Not in worker env |

### 12.4 Input Validation

| # | Test Case | Input | Expected Result |
|---|-----------|-------|-----------------|
| 12.4.1 | SQL injection | `'; DROP TABLE projects;--` | Input sanitized, no injection |
| 12.4.2 | XSS in title | `<script>alert('xss')</script>` | HTML escaped |
| 12.4.3 | Path traversal | `../../etc/passwd` | Path validated, rejected |
| 12.4.4 | Command injection | `; rm -rf /` | Input sanitized |

### 12.5 File Upload Security

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 12.5.1 | Executable upload | Upload .exe file | Rejected |
| 12.5.2 | MIME type validation | Fake extension with wrong MIME | Rejected |
| 12.5.3 | File size limit | Upload >100MB file | Rejected with size error |
| 12.5.4 | Signed URL expiration | Use expired URL | Access denied |

---

## Section 13: Performance Testing

### 13.1 Load Testing

| # | Test Case | Load | Expected Result |
|---|-----------|------|-----------------|
| 13.1.1 | Concurrent job submissions | 50 jobs/second | All queued successfully |
| 13.1.2 | Concurrent API requests | 100 req/second | <200ms p95 latency |
| 13.1.3 | Concurrent webhook deliveries | 10/second | All processed |
| 13.1.4 | Large job list query | 10,000 jobs | Pagination works, <2s response |

### 13.2 Stress Testing

| # | Test Case | Conditions | Expected Result |
|---|-----------|------------|-----------------|
| 13.2.1 | Sustained job rate | 10 jobs/second for 10 min | No memory leaks |
| 13.2.2 | Log ingestion burst | 1000 logs/second | All logs stored |
| 13.2.3 | Large file uploads | 500MB recording | Upload completes |
| 13.2.4 | Many concurrent workers | 20 concurrent jobs | All complete |

### 13.3 Database Performance

| # | Test Case | Query | Expected Result |
|---|-----------|-------|-----------------|
| 13.3.1 | Jobs list with filters | Complex query | <100ms |
| 13.3.2 | Ticket search | Full-text search | <200ms |
| 13.3.3 | Webhook deduplication | Lookup by delivery ID | <10ms |
| 13.3.4 | Log batch insert | 100 rows | <50ms |

---

## Section 14: Production Deployment Testing

### 14.1 Pre-Deployment Checklist

| # | Item | Verification |
|---|------|--------------|
| 14.1.1 | Database migrations | All migrations applied |
| 14.1.2 | Environment variables | All required vars set |
| 14.1.3 | SSM parameters | Secrets in Parameter Store |
| 14.1.4 | S3 buckets | Buckets exist with correct permissions |
| 14.1.5 | VPC configuration | Subnets and security groups |
| 14.1.6 | ECR images | Latest images pushed |
| 14.1.7 | Lambda functions | Functions deployed |
| 14.1.8 | ECS task definitions | Definitions updated |

### 14.2 Deployment Verification

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 14.2.1 | Health check | GET `/health` | 200 OK |
| 14.2.2 | Database connectivity | Create test project | Project created |
| 14.2.3 | S3 connectivity | Upload test file | File stored |
| 14.2.4 | SSM connectivity | Resolve test secret | Secret returned |
| 14.2.5 | Lambda invocation | Submit test job | Lambda invoked |
| 14.2.6 | ECS task launch | Submit ECS job | Task started |

### 14.3 Rollback Testing

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 14.3.1 | ECS rollback | Deploy bad version, rollback | Previous version restored |
| 14.3.2 | Database rollback | Run migration down | Schema reverted |
| 14.3.3 | Lambda rollback | Deploy bad version, rollback | Previous version active |

### 14.4 Production Smoke Tests

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 14.4.1 | Create project | POST `/api/projects` | Project created |
| 14.4.2 | Create ticket | POST `/api/tickets` | Ticket created |
| 14.4.3 | Submit job | POST `/api/jobs` | Job queued |
| 14.4.4 | Receive webhook | Send test webhook | Webhook processed |
| 14.4.5 | View dashboard | Navigate to frontend | Dashboard loads |

---

## Section 15: Negative Test Cases

See TESTING_PLAN.md Section 15 for comprehensive negative testing including:

- 15.1 Project API - Invalid Input (13 tests)
- 15.2 Ticket API - Invalid Input (12 tests)
- 15.3 Job API - Invalid Input (10 tests)
- 15.4 Clanker API - Invalid Input (8 tests)
- 15.5 Secrets API - Invalid Input (5 tests)
- 15.6 Webhook API - Invalid Input (6 tests)
- 15.7 Authentication & Authorization Tests (6 tests)
- 15.8 Rate Limiting & Resource Exhaustion Tests (6 tests)
- 15.9 Database & Data Integrity Tests (8 tests)
- 15.10 File Upload & Storage Tests (9 tests)
- 15.11 Worker & Job Execution Tests (11 tests)
- 15.12 Frontend Validation Tests (10 tests)
- 15.13 Integration Tests - Error Scenarios (5 tests)
- 15.14 Security Tests (10 tests)
- 15.15 Edge Cases & Boundary Tests (10 tests)

### Priority Levels

**Critical (Must Test):**
- All SQL/Command injection tests
- Authentication & authorization bypass attempts
- Webhook signature validation
- File upload security (MIME type, path traversal)
- Worker security (SSRF, credential exposure)

**High Priority:**
- Required field validation
- Duplicate resource handling
- Job state machine validation
- Rate limiting
- Cascading deletes

**Medium Priority:**
- Edge cases (max lengths, unicode)
- Concurrent operation handling
- API timeout scenarios

---

## Test Execution Instructions

**IMPORTANT: Always use `agent-browser` for ALL test sections.**

When running `/ui-test [section]`:

1. Open browser: `agent-browser open http://localhost:3000`
2. Take snapshots: `agent-browser snapshot -i` to get interactive elements
3. Interact using refs: `agent-browser click @e1`, `agent-browser fill @e2 "text"`
4. Take screenshots: `agent-browser screenshot /tmp/test-X.X.X.png` for documentation
5. For API verification, navigate to relevant UI pages or use `agent-browser eval` for fetch calls

### Workflow for each test case:

```bash
# Navigate to relevant page
agent-browser open http://localhost:3000/path

# Get interactive elements
agent-browser snapshot -i

# Perform actions (click, fill, etc.)
agent-browser fill @e1 "test data"
agent-browser click @e2

# Screenshot the result
agent-browser screenshot /tmp/test-X.X.X.png

# Verify expected outcome visually or via snapshot
agent-browser snapshot -i
```

### API tests via browser:

For API-focused tests, use the browser to:
- Navigate to pages that trigger API calls
- Use `agent-browser eval "fetch('/api/endpoint').then(r => r.json())"` for direct API calls
- Verify responses through UI state changes

After each test:
- Report pass/fail status with test case numbers (e.g., "3.1.1 PASS")
- Show screenshots using Read tool so user can see results
- Continue with remaining tests even if one fails
- Provide recommendations for fixes

## Error Handling

- If browser fails to connect, check if frontend is running at http://localhost:3000
- If a test fails, capture screenshot and continue with remaining tests
- Provide clear error messages with suggested fixes
- Close browser when done: `agent-browser close`
