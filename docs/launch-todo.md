# Before going public

What's left before Viberglass is announced publicly (Show HN, Reddit). Collected 2026-10-07. Delete items as they're done, and this file with the last one.

Context from the last session: [launch-handover.md](launch-handover.md).

The clean-machine run in [testing/e2e-manual/00-clean-machine.md](testing/e2e-manual/00-clean-machine.md) is the final check; several items below come from its known issues.

## Installing and running

- OVHcloud: follow the install guide on a managed cluster (CLEAN-21 – CLEAN-23). Run the one-server compose install too (CLEAN-15 – CLEAN-19).

## Validation still open from the UX review

- Native-provider keys tested separately from custom endpoints, including replacing a failed key and timeouts.
- One first-time admin, PM, reviewer and read-only viewer each using it unguided.
- Live Slack linking and reminders, and long-conversation recovery, on a deployed installation.

## Website (vibug-marketing-site)

- Deploy the contact form handler (it no longer logs submissions) and delete or expire its existing CloudWatch logs, which hold past submissions with IP addresses.
- Commit and push `docs/guide/` before deploying the site; its build clones the guide from `main`.
