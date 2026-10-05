# 07 · Cross-cutting checks

Checks that apply to every environment: permissions, secret hygiene, accessibility, layout, browsers, upgrades and data safety.

## Contents

- [Permissions (PERM)](#permissions-perm)
- [Secret hygiene (SEC)](#secret-hygiene-sec)
- [Accessibility (A11Y)](#accessibility-a11y)
- [Layout, themes and browsers (UI)](#layout-themes-and-browsers-ui)
- [Upgrades and data (DATA)](#upgrades-and-data-data)

## Permissions (PERM)

### PERM-01 · Role matrix
Needs: L-REV accounts (admin Alex, member Maria, maintainer Dev, guest Quinn, viewer Taylor) and a private space only Alex belongs to.

For each person, try each action in the UI, and for refusals also by API (copy the request from the browser dev tools and replay it). Record allowed/refused:

| Action | Admin | Member | Maintainer | Guest (on task) | Guest (not on task) | Viewer |
|---|---|---|---|---|---|---|
| See the private space | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Create a space | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Change space settings | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Delete a space | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Create a task | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Post in a task | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Ask for research/plan | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Ask for code | ✓ | on task | ✓ | ✓ | ✗ | ✗ |
| Pause / take over | ✓ | as owner | ✓ | as owner | ✗ | ✗ |
| Edit / finish a task | ✓ | requester/owner | ✓ | requester/owner | ✗ | ✗ |
| Delete a task | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Runners, secrets, connections, members, audit log | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Runs and schedules pages | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| API tokens | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |

Expect: matches the table. A private-space read by a non-member returns 404, not 403.

## Secret hygiene (SEC)

### SEC-01 · No secret values anywhere
1. After a full run, search for a known key's value: browser responses (dev tools), the audit log, run records and export, backend logs, worker logs, the database (`select * from secrets` shows only encrypted values), Slack messages, emails.

Expect: the value never appears in clear.

### SEC-02 · Webhook signatures and callbacks
1. Replay a webhook delivery with a changed body.
2. Call a worker callback (`/api/jobs/<id>/result`) without, then with a wrong, callback token.
3. Call `/api/jobs/<id>/bootstrap` for a finished run with its old token.

Expect: all refused.

### SEC-03 · Sessions
1. Sign in; copy the session cookie; sign out; reuse the cookie.
2. Deactivate a user while their tab is open.

Expect: both sessions end.

## Accessibility (A11Y)

### A11Y-01 · Automated scan
1. Run axe (browser extension or `@axe-core/playwright`) on Home, Overview, a space, a task, Notifications, Agents & runners, Space settings, setup, in light and dark.

Expect: no violations (the v1 review baseline is zero on the first five routes).

### A11Y-02 · Keyboard only
1. Without a mouse: sign in, open a task, switch artifact tabs with arrows, pick a mention, post, open a dialog and close it with Escape, submit a form with an error and fix it.

Expect: visible focus throughout; focus returns sensibly after dialogs; nothing reachable only by mouse.

### A11Y-03 · Screen reader
1. With NVDA, VoiceOver or Orca: read a task thread, a form error, the mention list and tab panels.

Expect: errors announced with their field; tabs announced as tabs with their state; the mention list announces the active option.

## Layout, themes and browsers (UI)

### UI-01 · Viewports
1. At 1440, 1280, 768 and 390 px wide: Home, a space, a task, setup, runner form.

Expect: no sideways scrolling; on phones the task shows Conversation/Artifacts and Write a reply.

### UI-02 · Themes
1. Switch dark/light from the account menu on each main page.

Expect: neutral surfaces; readable secondary text; amber for primary actions, links and attention only.

### UI-03 · Browsers
1. Repeat the smoke subset's UI parts in Chrome, Firefox and Safari (or WebKit).

Expect: same behaviour.

## Upgrades and data (DATA)

### DATA-01 · Upgrade an existing database
1. Take a copy of a database from the previous release (or the review database), start the new backend on it.

Expect: migrations apply in order; existing tasks, documents and runners still work.

### DATA-02 · Backup and restore (local)
1. `pg_dump` the database; restore into a new database; start an instance on it with the same encryption keys; then with different keys.

Expect: works with the same keys; with different keys, secrets fail clearly (not silently wrong).

### DATA-03 · Large data
1. Create a space with 200+ tasks (script via the API or MCP) and a task with a 200-entry thread.

Expect: the space, Overview and the thread stay usable (record load times).
