# Viberglass User Guide: Create and Run a Ticket with Specific Information

This guide explains how to create high-signal tickets and execute them with clankers so jobs have the context needed to produce useful fixes.

Tested against local UI at `http://localhost:3000` on February 17, 2026.

Need the short version? Start with `docs/USER_QUICKSTART_CREATE_AND_RUN_TICKET.md`.

## What "Specific Information" Means

In Viberglass, quality of ticket input strongly affects job quality. "Specific information" means:

- clear, narrow title
- reproducible steps
- expected versus actual behavior
- impact/scope
- constraints for the coding agent

## Prerequisites

- Access to a project (`/project/:slug`)
- At least one active clanker
- Required clanker secrets configured and resolvable

If your run fails with secret errors, verify secret setup before retrying.

## Step 1: Create the Ticket

Open project tickets:

- `/project/:slug/tickets`
- Click `Create` (navigates to `/project/:slug/tickets/create`)

### Fields in `Create New Ticket`

- `Title` (required)
- `Description` (required)
- `Severity` (`Low`, `Medium`, `High`, `Critical`)
- `Category` (required in practice for routing clarity)
- `Screenshot` (optional, PNG/JPG/GIF/WebP up to 10MB)
- `Screen recording` (optional, MP4/WebM/QuickTime up to 10MB)

Click `Create Ticket` to save.

## Step 2: Use a High-Quality Ticket Format

Recommended description template:

```text
Context:
What user/business flow is affected.

Steps to reproduce:
1. ...
2. ...
3. ...

Expected:
...

Actual:
...

Impact:
...

Scope constraints:
- Files/modules to prefer
- Files/modules to avoid
- Performance or safety constraints
```

## Step 3: Example Ticket with Specific Information

Use this as a concrete pattern:

- `Title`: `Payment webhook retries endlessly after 500 response`
- `Severity`: `High`
- `Category`: `Backend`
- `Description`:

```text
Steps to reproduce:
1. Create webhook endpoint returning HTTP 500
2. Trigger checkout event
3. Observe unbounded retry loop in worker logs

Expected:
Exponential backoff capped at 5 attempts

Actual:
Retries continue with no cap
```

## Step 4: Run from Ticket Detail

After creation, open the ticket detail page:

- `/project/:slug/tickets/:ticketId`

Use one of the actions:

- `Run with <Clanker>`: direct execution with optional run-specific instructions


## Step 5: Run with Clanker (Direct Path)

Click `Run with <Clanker>` to open `Run Ticket with Clanker`.

Fields/actions in modal:

- `Select Clanker`
- `Extra Instructions (Optional)` (saved as `AGENTS.md` for this run only)
- `Run with <Clanker>`

Example extra instructions:

```text
Focus only on retry/backoff logic in webhook worker.
Do not refactor unrelated modules.
Add tests for max-attempt behavior.
```

After submission, Viberglass redirects to:

- `/project/:slug/jobs/:jobId`



This also starts a job and redirects to job details.

## Step 7: Monitor Job Execution

In `/project/:slug/jobs/:jobId`, check:

- `Overview`: status, task, error
- `Timeline`: progress events
- `Logs`: execution logs

Use this page as your source of truth for whether the ticket execution succeeded.

## Editing Ticket Information Before Re-run

On ticket detail page, click `Edit` to open `Edit Ticket` modal.

Editable fields:

- `Title`
- `Description`
- `Severity`
- `Category`

Save and re-run after tightening context.

## Troubleshooting

### Job fails immediately with secret errors

If you see an error like:

- `Secret resolution failed: Environment variable ... is not set`

then the clanker secret exists in Viberglass but the backing value is missing for the selected storage type.

### Output is low quality or off target

- tighten the ticket title and steps
- add explicit expected/actual sections
- add scope constraints in run instructions
- rerun from the updated ticket

### No meaningful logs

- check clanker health and deployment status
- confirm project SCM and credentials are configured
- retry after resolving secret/runtime setup
