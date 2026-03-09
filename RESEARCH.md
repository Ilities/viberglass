# Research: MCP Server Implementation for Viberglass

## Summary

The ticket requests implementing an MCP (Model Context Protocol) server for Viberglass that exposes existing platform functionality (tickets, projects, jobs) as MCP tools. The MCP protocol is a standardized way for AI applications to connect to external data sources and tools.

## Relevant Code Areas

### Backend API Structure

1. **Tickets API** (`apps/platform-backend/src/api/routes/tickets.ts`)
   - CRUD operations via `TicketDAO`
   - Execution routes (`executionRoutes.ts`): `POST /api/tickets/:id/run` - triggers ticket execution
   - Workflow phase routes (`workflowPhaseRoutes.ts`): Research and planning phase management

2. **Projects API** (`apps/platform-backend/src/api/routes/projects.ts`)
   - Full CRUD: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/:id`
   - `GET /api/projects/by-name/:name` - lookup by name
   - Integration management: `GET/PUT/DELETE /api/projects/:projectId/integrations/:integrationId`
   - SCM config: `GET/PUT/DELETE /api/projects/:projectId/scm-config`

3. **Jobs API** (`apps/platform-backend/src/api/routes/jobs.ts`)
   - `POST /api/jobs` - create job
   - `GET /api/jobs/:jobId` - get job status
   - `GET /api/jobs` - list jobs with filters
   - `DELETE /api/jobs/:jobId` - delete/cancel job
   - `GET /api/jobs/stats/queue` - queue statistics

### Data Models

- **Ticket** (`packages/types/src/ticket.ts`): `id`, `projectId`, `title`, `description`, `severity`, `status`, `workflowPhase`, etc.
- **Project** (`packages/types/src/project.ts`): `id`, `name`, `slug`, ticket system integration config
- **Job** (`packages/types/src/job.ts`): `JOB_KIND` (RESEARCH, PLANNING, EXECUTION, CLAW), job status tracking

### Existing MCP Reference

The Viberator worker (`apps/viberator/src/types/agents.ts:72`) already references `mcpServers` configuration, indicating MCP support is intended for worker agents.

### Service Layer

- `TicketExecutionService`: Runs tickets as jobs
- `JobService`: Job queue management
- `ProjectDAO`: Project data access

## Root Cause Analysis

This is a new feature, not a bug. The platform currently lacks an MCP server that exposes its functionality to external AI clients. The existing REST API provides all required operations, but they need to be wrapped in the MCP protocol format.

## Constraints and Risks

1. **Authentication**: MCP server needs to handle authentication securely. Options:
   - API key-based authentication
   - OAuth integration
   - Reuse existing session/auth mechanism

2. **Protocol Translation**: Need to map MCP tool calls to existing REST API endpoints while preserving error handling and validation

3. **MCP SDK**: Need to evaluate `@modelcontextprotocol/server` or similar SDKs for Node.js implementation

4. **Security**: Exposing platform functionality via MCP increases attack surface - need proper input validation and rate limiting

5. **Async Operations**: Jobs are asynchronous - MCP tools need to handle this appropriately (return job ID for polling)

## Recommended Next Steps

1. **Evaluate MCP SDK Options**
   - Research `@modelcontextprotocol/server` package
   - Determine compatibility with Express.js existing stack

2. **Design MCP Tool Schema**
   - `create_ticket`: Create new ticket with title, description, project, severity
   - `get_project`: Retrieve project details by ID or name
   - `list_projects`: List all projects with pagination
   - `trigger_job`: Start job execution (or run ticket)
   - `get_job_status`: Retrieve job status and results
   - `list_jobs`: List jobs with filters

3. **Architecture Decision**
   - Option A: Standalone MCP server process (recommended for isolation)
   - Option B: Embedded MCP server within Express app (simpler deployment)
   - Consider using the existing service layer rather than calling REST API internally

4. **Implementation Phases**
   - Phase 1: Basic MCP server setup with core tools
   - Phase 2: Authentication integration
   - Phase 3: Error handling and validation
   - Phase 4: Testing and documentation

5. **Reference Implementation**
   - Review MCP specification at https://spec.modelcontextprotocol.io
   - Examine existing MCP server implementations for pattern reference
