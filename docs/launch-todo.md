# Before going public

What's left before Viberglass is announced publicly (Show HN, Reddit). Collected 2026-10-07. Delete items as they're done, and this file with the last one.

Context from the last session, and how to test the trackers: [launch-handover.md](launch-handover.md).

The clean-machine run in [testing/e2e-manual/00-clean-machine.md](testing/e2e-manual/00-clean-machine.md) is the final check; several items below come from its known issues.

## Installing and running

- Publish a first release (images, CLI, extension zip) and make the GHCR packages public; set the Pulumi workflow secrets (see `.github/DEPLOYMENT.md`).
- AWS, Kubernetes and OVHcloud: run each install path from nothing, following only the docs (clean-machine tests CLEAN-20 – CLEAN-32). Add a clean-machine test for the one-server compose install and run it too.

## Validation still open from the UX review

- Linked tracker issues against real Jira Cloud, Shortcut and GitHub: a new issue creates its task (and plan, when set), an edit updates it, comments reach the thread, a bot mention asks the agent, and the plan, questions, pull request and done come back as comments. Check Shortcut's real comment payload for the author's name.
- A real writable repository from plan to merged PR, closing and reopening the task.
- Native-provider keys tested separately from custom endpoints, including replacing a failed key and timeouts.
- A manual accessibility pass in both themes: contrast, focus order and restoration, dialogs, keyboard, screen reader.
- One first-time admin, PM, reviewer and read-only viewer each using it unguided.
- Live Slack linking and reminders, and long-conversation recovery, on a deployed installation.

## Licensing and project

- Add a contributor license agreement (e.g. the cla-assistant GitHub app) before accepting outside pull requests, so a commercial license stays possible.
- Send a test email to `security@viberglass.io`, the address in SECURITY.md.

## Website (vibug-marketing-site)

- New screenshots, a demo video or GIF, and a redrawn how-it-works diagram. Check the social preview image (`public/media/social-preview.png`) too; links shared on HN and Reddit show it.
- Rewrite the Terms and Privacy pages: they describe Cloud subscriptions that don't exist. The site collects analytics (Plausible), newsletter sign-ups and contact form messages.
- Remove the plaintext password from `SCREENSHOT_CAPTURE_GUIDE.md` and rotate it.
- Commit and push `docs/guide/` before deploying the site; its build clones the guide from `main`.
- Delete the old site docs and their images (`public/media/`, apart from `social-preview.png`).
