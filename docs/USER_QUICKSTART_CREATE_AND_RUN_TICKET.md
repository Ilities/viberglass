# Viberglass Quickstart: Create and Run a Ticket with Specific Information

Fast path for creating a high-quality ticket and running it with a clanker.

Tested against local UI at `http://localhost:3000` on February 17, 2026.

For the full version, see `docs/USER_SETUP_CREATE_AND_RUN_TICKET.md`.

## 1) Open Ticket Creation

Go to:

- `/project/:slug/tickets`
- Click `Create`

## 2) Fill Required Fields with Specific Info

In `Create New Ticket`, fill:

- `Title`: specific and actionable
- `Description`: include steps, expected, actual
- `Severity`: `Low`, `Medium`, `High`, or `Critical`
- `Category`: for example `Backend`, `UI`, `API`

Optional:

- `Screenshot` (PNG/JPG/GIF/WebP, max 10MB)
- `Screen recording` (MP4/WebM/QuickTime, max 10MB)

Click `Create Ticket`.

## 3) Use This Description Template

```text
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
```

## 4) Run the Ticket

On the ticket detail page, click `Run with <Clanker>`.

In `Run Ticket with Clanker`:

- Select clanker
- Add `Extra Instructions (Optional)` (saved as `AGENTS.md` for this run only)
- Click `Run with <Clanker>`

You will be redirected to `/project/:slug/jobs/:jobId`.

## 5) Track Result

On the job page:

- Check `Status`, `Task`, and `Error` (if failed)
- Use `Overview`, `Timeline`, and `Logs` tabs

## 6) Common Failure Checks

- `Secret resolution failed`: required clanker secrets are missing or not resolvable.
- Immediate failure: clanker runtime/credentials not ready.
- No useful fix output: improve ticket description and run instructions with clearer constraints.
