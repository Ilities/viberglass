# Before going public

What's left before Viberglass is announced publicly (Show HN, Reddit). Collected 2026-10-07. Delete items as they're done, and this file with the last one.

The clean-machine run in [testing/e2e-manual/00-clean-machine.md](testing/e2e-manual/00-clean-machine.md) is the final check; several items below come from its known issues.

## Product

- Chrome extension: test it end to end against the current app, then bring it up to date. It still shows the old Planning/Execution labels, and its manifest describes "research, planning, and execution workflows". Decide how people get it: the Chrome Web Store, or build-from-source instructions in the user guide.
- `viberglass` CLI: publish `packages/cli` from a CI job (npm, on release tags), so `viberglass checkout` is installable. Then update the README and the guide's steering page, which currently have to tell people to build it themselves.
- Create task page: it says "Every new task starts with a plan", but creating a task starts nothing until someone chooses Write the plan.
- Connections: the GitHub, Shortcut and custom webhook screens still say "ticket" and "Viberator ticket". The space Connections page describes the GitLab, Bitbucket and Jira stubs as if they worked. Hide stub integrations or label them plainly as not available.
- Password reset: `/forgot-password` only logs the request. Send the reset email when email is configured.
- A link to the source in the app, e.g. in the user menu, so modified installations can meet AGPL section 13 easily.

Found while taking the screenshots (2026-10-07):

- The answer buttons on an agent question don't wrap, so long options overflow the card. (The marketing screenshots were taken with a CSS patch for this.)
- Consecutive agent messages are joined without a space: "codebase.I've read", "first.Waiting".
- An answered question shows twice: "Maria answered: …" under the question, and again as Maria's own message.
- On Home, a finished plan shows as "OpenCode mentioned you" with an "OG" avatar, instead of saying the plan is ready. Adding someone as reviewer doesn't put the task under their Needs you.
- Run details and summaries show internals: "writing PLAN.md", full `/tmp/viberator-work/task-…/repo/…` paths on every tool call, and "$0 (estimate)" as the cost.
- "Invite your team" in Next steps is already ticked on a fresh instance; the demo workspace's members probably count.
- Starting a runner created by hand builds the whole multi-agent image from source (about 6 minutes), where setup uses the published images. The runner page says "Docker image not configured".
- The New space form is the old plumbing form (Integration Credential, "Enable Auto-fix", "use Viberglass as ticketing system"). Create task still uses bug-report framing ("Create New Task", "Steps to reproduce").
- Agents & runners: the intro line renders in a monospace box, the heading says "Agent runners" while the navigation says "Agents & runners", card columns don't line up, and Created/Updated times are cut off.
- Comparing plan versions shows a raw markdown line diff in monospace; changing one word marks the whole paragraph.
- The comment popover shows a raw locale timestamp ("10/7/2026, 10:06:09 AM").
- The red Cancel run button on every running turn is visually loud.
- The main content frame's right border shows on every page.

## Installing and running

- A production compose file for a small single-host installation: production images, no hot reload, no source mounts, and database and encryption keys read from `.env` instead of hardcoded.
- Publish backend and frontend images to GHCR alongside the worker images, so a Kubernetes install doesn't start by building and pushing two images.
- Fix the `pulumi-*.yml` workflows, which watch a missing `infrastructure/` folder, and the stale smoke steps in `deploy-backend-prod.yml`.
- AWS, Kubernetes and OVHcloud: run each install path from nothing, following only the docs (clean-machine tests CLEAN-20 – CLEAN-32).

## Validation still open from the UX review

- A real writable repository from plan to merged PR, closing and reopening the task.
- Native-provider keys tested separately from custom endpoints, including replacing a failed key and timeouts.
- A manual accessibility pass in both themes: contrast, focus order and restoration, dialogs, keyboard, screen reader.
- One first-time admin, PM, reviewer and read-only viewer each using it unguided.
- Live Slack linking and reminders, and long-conversation recovery, on a deployed installation.

## Repository clean-up

Remove the completed review, walkthrough, research and handover documents. They describe work that's done, use old vocabulary (tickets, research phase, Clankers) and would confuse newcomers. Git history keeps them; check them for anything that shouldn't be public anyway, since removing a file doesn't remove it from history.

Candidates:

- `docs/ux/next-steps-handover.md`, `docs/ux/phase-2-3-handover.md`, `docs/ux/task-conversation-handover.md`
- `docs/ux/appendix-*.md`, `docs/ux/returning-visit-redesign.md`, `docs/ux/harness-session-research.md`
- `docs/ux/v1-review/` (all 26 backlog items are done; the open validation is listed above)
- `docs/operations/aws-first-run-walkthrough.md`
- `docs/SUBMITTER_UX_CONTRACT.md` (projects and tickets; superseded by the user guide)
- `docs/infographic.html`, `docs/images/how-it-works.svg` and the Clanker screenshots in `docs/images/`
- `docs/ux/user-journeys-and-personas.md` and `docs/ux/information-architecture.md`: specs rather than handovers. Keep them if they're still the reference for product decisions, otherwise fold what matters into ADRs.

Keep: the ADRs, `docs/guide/`, the deployment and operations docs, `docs/testing/`, and the plans still in progress (`model-hosting-plan.md`, `eval-plan.md`, `kubernetes-ovh-deployment-plan.md`) until they're finished.

Before deleting:

- The ADRs link to `docs/ux/` documents. Update those links, or keep the documents the ADRs depend on.
- The manual test suite's environments (L-REV, L-NEW) use the harness in `docs/ux/v1-review/harness/`. Move it, for example to `tests/manual-harness/`, and update `docs/testing/e2e-manual/README.md`.
- Update the index in `docs/README.md`.
- Check `CODEBASE_MAP.md` and `apps/platform-backend/docs/` are current, or remove them.

## Licensing and project

- `apps/platform-frontend/LICENSE.md` is an unfilled Apache 2.0 template. If it covers vendored components (`components/ai-elements`), move it next to them with a note saying what it covers; otherwise delete it.
- Add a contributor license agreement (e.g. the cla-assistant GitHub app) before accepting outside pull requests, so a commercial license stays possible.
- Send a test email to `security@viberglass.io`, the address in SECURITY.md.

## Website (vibug-marketing-site)

- New screenshots, a demo video or GIF, and a redrawn how-it-works diagram. Check the social preview image (`public/media/social-preview.png`) too; links shared on HN and Reddit show it.
- Rewrite the Terms and Privacy pages: they describe Cloud subscriptions that don't exist. The site collects analytics (Plausible), newsletter sign-ups and contact form messages.
- Remove the plaintext password from `SCREENSHOT_CAPTURE_GUIDE.md` and rotate it.
- Commit and push `docs/guide/` before deploying the site; its build clones the guide from `main`.
- Delete the old site docs and their images (`public/media/`, apart from `social-preview.png`).
