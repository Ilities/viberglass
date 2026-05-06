# @viberglass/mcp-server

MCP (Model Context Protocol) server for the Viberglass platform. Exposes clankers, projects, tickets, and review workflows as MCP tools that AI agents can call directly.

## Transport

The server uses the **Streamable HTTP** transport (stateless mode) and is mounted at `POST /api/mcp` in the platform backend. Each request creates a fresh `McpServer` + `StreamableHTTPServerTransport` pair — there is no session state between calls.

Authentication is handled by the `requireApiToken` middleware on the Express route. MCP clients must send a valid API token via the `Authorization` header.

## Tools

### `clanker_list`

List available clankers (AI agents). Use this to discover clanker UUIDs needed for `ticket_trigger`.

| Parameter | Type                                        | Description              |
|-----------|---------------------------------------------|--------------------------|
| `status`  | `enum(active, inactive, deploying, failed)` | Filter by status         |
| `limit`   | `number (1–200)`                            | Max results (default 50) |
| `offset`  | `number`                                    | Pagination offset        |

Returns `{ clankers: [...], total }` where each clanker has `id`, `name`, `slug`, `description`, `agent`, `status`.

### `project_list`

List available projects. Use this to discover project UUIDs needed for `ticket_create` and `ticket_list`.

| Parameter | Type             | Description              |
|-----------|------------------|--------------------------|
| `limit`   | `number (1–200)` | Max results (default 50) |
| `offset`  | `number`         | Pagination offset        |

Returns `{ projects: [...], total }` where each project has `id`, `name`, `slug`, `primaryTicketingIntegrationId`.

### `ticket_list`

List tickets with optional filters.

| Parameter        | Type             | Description                                               |
|------------------|------------------|-----------------------------------------------------------|
| `projectId`      | `string (UUID)`  | Filter by project                                         |
| `statuses`       | `string`         | Comma-separated: `open, in_progress, in_review, resolved` |
| `workflowPhases` | `string`         | Comma-separated: `research, planning, execution`          |
| `severity`       | `string`         | `low, medium, high, critical`                             |
| `search`         | `string`         | Search in title and description                           |
| `limit`          | `number (1–200)` | Max results (default 50)                                  |
| `offset`         | `number`         | Pagination offset                                         |

Returns `{ tickets: [...], total }`.

### `ticket_get`

Get detailed information about a specific ticket.

| Parameter  | Type            | Description |
|------------|-----------------|-------------|
| `ticketId` | `string (UUID)` | Ticket UUID |

Returns the full ticket object including workflow phase and status. Returns `{ error: "Ticket not found" }` if the ID doesn't exist.

### `ticket_create`

Create a new ticket in a project.

| Parameter      | Type                                | Description                       |
|----------------|-------------------------------------|-----------------------------------|
| `projectId`    | `string (UUID)`                     | **Required.** Project UUID        |
| `title`        | `string (1–500)`                    | **Required.** Ticket title        |
| `description`  | `string`                            | **Required.** Ticket description  |
| `severity`     | `enum(low, medium, high, critical)` | Default: `medium`                 |
| `category`     | `string`                            | Ticket category                   |
| `ticketSystem` | `string`                            | External ticket system identifier |

Returns the created ticket with its ID and initial workflow state.

### `ticket_trigger`

Trigger a workflow phase run for a ticket. Returns a job ID for tracking.

| Parameter     | Type                                  | Description                                  |
|---------------|---------------------------------------|----------------------------------------------|
| `ticketId`    | `string (UUID)`                       | **Required.** Ticket UUID                    |
| `clankerId`   | `string (UUID)`                       | **Required.** Clanker (AI agent) UUID to run |
| `targetPhase` | `enum(research, planning, execution)` | **Required.** Workflow phase to run          |

Returns `{ jobId, status }`.

### `ticket_review`

Get the full review state for a ticket across all workflow phases. Includes phase documents, approval status, and inline comments.

| Parameter  | Type            | Description               |
|------------|-----------------|---------------------------|
| `ticketId` | `string (UUID)` | **Required.** Ticket UUID |

Returns a `ReviewState` object with the current workflow phase, per-phase documents (`content`, `approvalState`, `approvedAt`, `approvedBy`), and any inline comments.

### `ticket_review_approve`

Approve the planning document for a ticket. Advances the workflow to the execution phase.

| Parameter  | Type            | Description               |
|------------|-----------------|---------------------------|
| `ticketId` | `string (UUID)` | **Required.** Ticket UUID |

Returns `{ approvalState }`.

### `ticket_review_revoke`

Revoke planning approval for a ticket. Returns the approval state to draft.

| Parameter  | Type            | Description               |
|------------|-----------------|---------------------------|
| `ticketId` | `string (UUID)` | **Required.** Ticket UUID |

Returns `{ approvalState }`.

### `ticket_review_comment`

Add an inline comment to a research or planning phase document. Use to request revisions.

| Parameter    | Type                       | Description                               |
|--------------|----------------------------|-------------------------------------------|
| `ticketId`   | `string (UUID)`            | **Required.** Ticket UUID                 |
| `phase`      | `enum(research, planning)` | **Required.** Phase to comment on         |
| `lineNumber` | `number (≥1)`              | **Required.** Line number in the document |
| `content`    | `string`                   | **Required.** Comment text                |

Returns `{ id, lineNumber, content, status }`.

## Architecture

```
packages/mcp-server/src/
├── index.ts           Public exports
├── server.ts          createMcpServer() factory
├── types.ts           McpToolServices interface, param/result types
└── tools/
    ├── registry.ts    ToolRegistry — applies all tool groups to a server
    ├── schemas.ts     Zod schemas for all tool parameters
    ├── clankerTools.ts
    ├── projectTools.ts
    ├── ticketTools.ts
    └── reviewTools.ts
```

### `McpToolServices`

The server delegates all business logic to a `McpToolServices` interface injected at creation time. The platform backend wires this up in `apps/platform-backend/src/mcp/composeMcpServices.ts`, connecting the MCP tools to the actual DAOs and services.

### `ToolGroup` pattern

Tools are organized into groups (`ClankerToolGroup`, `ProjectToolGroup`, etc.) that implement the `ToolGroup` interface. Each group registers its tools on the `McpServer` via the `ToolRegistry`. To add a new tool group:

1. Create a class implementing `ToolGroup` in `src/tools/`
2. Add Zod schemas in `src/tools/schemas.ts`
3. Register it in `server.ts` via `registry.addGroup()`

### Per-request instantiation

The platform backend creates a new `McpServer` and `StreamableHTTPServerTransport` for each incoming request. This is required because the stateless transport (`sessionIdGenerator: undefined`) cannot be reused across requests, and `McpServer` only accepts one transport connection at a time. The shared state (DAOs, services) lives in `mcpToolServices` — only the protocol layer is per-request.

## Connecting an MCP client

Configure your MCP client (Claude Desktop, Cursor, etc.) to use the Streamable HTTP transport pointing at the Viberglass backend:

```json
{
  "mcpServers": {
    "viberglass": {
      "url": "http://localhost:8888/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-token>"
      }
    }
  }
}
```

The API token must be created through the Viberglass UI under **Secrets → API Tokens**.
