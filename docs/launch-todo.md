# Before going public

What's left before Viberglass is announced publicly (Show HN, Reddit). Collected 2026-10-07. Delete items as they're done, and this file with the last one.

Context from the last session: [launch-handover.md](launch-handover.md).

The clean-machine run in [testing/e2e-manual/00-clean-machine.md](testing/e2e-manual/00-clean-machine.md) is the final check; several items below come from its known issues.

## Installing and running

- Publish a first release (images, CLI, extension zip) and make the GHCR packages public; set the Pulumi workflow secrets (see `.github/DEPLOYMENT.md`).
- AWS, Kubernetes and OVHcloud: run each install path from nothing, following only the docs (clean-machine tests CLEAN-15 – CLEAN-32). Kubernetes is tested programmatically on a local cluster (`kubernetesSmoke.ts` and the storage smokes); what's left there is following the README and install guide on a clean machine (CLEAN-20) and the managed cluster on OVHcloud (CLEAN-21 – CLEAN-23). Run the one-server compose install too (CLEAN-15 – CLEAN-19).

## Validation still open from the UX review

- Plans in parts are partly tested on token.observer; still to try with a real build: add part 2 to part 1's pull request, mark a part done and skip one, and discard a build that failed before opening its pull request ([ADR 0013](adr/0013-ways-around-building-in-parts.md)).
- Native-provider keys tested separately from custom endpoints, including replacing a failed key and timeouts.
- A manual accessibility pass in both themes: contrast, focus order and restoration, dialogs, keyboard, screen reader.
- One first-time admin, PM, reviewer and read-only viewer each using it unguided.
- Live Slack linking and reminders, and long-conversation recovery, on a deployed installation.

## Licensing and project

- Contributor license agreement: [CLA.md](../CLA.md) is drafted and CONTRIBUTING asks for it. Fill in the Project Owner's legal name (and have it read by someone who knows contracts), put its text in a GitHub gist, and link the gist to the repository at cla-assistant.io.
- Send a test email to `security@viberglass.io`, the address in SECURITY.md.

## Website (vibug-marketing-site)

- New screenshots, a demo video or GIF, and a redrawn how-it-works diagram. Check the social preview image (`public/media/social-preview.png`) too; links shared on HN and Reddit show it.
- Rewrite the Terms and Privacy pages: they describe Cloud subscriptions that don't exist. The site collects analytics (Plausible), newsletter sign-ups and contact form messages.
- Remove the plaintext password from `SCREENSHOT_CAPTURE_GUIDE.md` and rotate it.
- Commit and push `docs/guide/` before deploying the site; its build clones the guide from `main`.
- Delete the old site docs and their images (`public/media/`, apart from `social-preview.png`).
