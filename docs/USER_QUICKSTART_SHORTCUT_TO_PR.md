# Viberglass Quickstart: Shortcut to Automated PRs

Fast path to get from Shortcut stories to clanker-run fixes and PR output.

Tested against local UI at `http://localhost:3000` on February 17, 2026.

For full detail, see `docs/USER_SETUP_SHORTCUT_TO_PR.md`.

## 1) Add Secrets

Open `/secrets` and create:

- `GITHUB_TOKEN`
- `ANTHROPIC_AUTH_TOKEN`

Use any supported storage location:

- `Name only (env)`
- `Database (encrypted)`
- `AWS SSM Parameter Store`

## 2) Configure GitHub Integration

Open `/settings/integrations`, then `Manage` on `GitHub`.

- Create `GitHub Inbound Webhook`
- Set `GitHub repository (owner/repo)`
- Copy the webhook URL + secret into GitHub repository webhooks
- Add integration credential (`GITHUB_TOKEN`) under `Integration Credentials`

## 3) Configure Shortcut Integration

Open `/settings/integrations`, then `Manage` on `Shortcut`.

- Create `Shortcut inbound webhook`
- Copy webhook URL + secret
- Enable `Story created` and `Comment created`
- In Shortcut (`Settings > Integrations > Webhooks`), create webhook with the Viberglass URL and matching signature secret

## 4) Create a Clanker

Open `/clankers/new`:

- Choose deployment strategy (`Docker` is the fastest local path)
- Select `Claude Code` agent
- Attach required secrets
- Create clanker and confirm it is healthy/active

## 5) Link Integrations to a Project

Open your project settings:

- `/project/:slug/settings/integrations`: link `Shortcut` and `GitHub`
- `/project/:slug/settings/project`: set `SCM Integration`, `Source Repository`, `Base Branch`, and `Integration Credential`

Save changes.

## 6) Validate End-to-End

1. Create or update a Shortcut story.
2. Confirm a Viberglass ticket appears in `/project/:slug/tickets`.
3. Run it (`Run with <Clanker>`) or rely on auto-execute.
4. Monitor `/project/:slug/jobs`.
5. Verify PR behavior in GitHub.

## Quick Checks if It Fails

- No tickets: verify Shortcut webhook URL/secret, selected events, and project integration link.
- Job failure: verify clanker health and attached secrets.
- No PR: verify project SCM credential and repository permissions for `GITHUB_TOKEN`.
