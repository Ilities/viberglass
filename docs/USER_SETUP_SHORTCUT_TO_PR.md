# Viberglass User Setup Guide: Shortcut to Pull Request Automation

This guide explains how to set up Viberglass so Shortcut stories can flow into Viberglass tickets and then into automated pull requests via clankers.

Tested against local UI at `http://localhost:3000` on February 17, 2026.

Need the short version? Start with `docs/USER_QUICKSTART_SHORTCUT_TO_PR.md`.

For ticket-authoring and execution quality, see `docs/USER_SETUP_CREATE_AND_RUN_TICKET.md`.

## What You Will Configure

1. Global secrets (tokens used by clankers and SCM integrations)
2. Global integrations (Shortcut and GitHub)
3. A clanker that can execute coding jobs
4. Project-level integration links and SCM execution settings
5. Shortcut webhook wiring
6. End-to-end validation

## Prerequisites

- Viberglass admin access
- Shortcut admin access (to configure workspace webhooks)
- GitHub access to the target repository
- A token that can update issues/comments and create PR-related changes in your repo

## Step 1: Create Required Secrets

Open `Secrets` in the main navigation (`/secrets`), then click `Add Secret`.

Recommended secret names:

- `GITHUB_TOKEN` (for SCM authentication)
- `ANTHROPIC_AUTH_TOKEN` (for Claude Code clankers)
- `ANTHROPIC_BASE_URL` (only if needed in your environment)

Storage options shown in UI:

- `Name only (env)` (read from API server environment)
- `Database (encrypted)`
- `AWS SSM Parameter Store`

If you use `Database (encrypted)` or `AWS SSM Parameter Store`, you must provide a secret value during creation.

## Step 2: Configure Global GitHub Integration

Open `Integrations` (`/settings/integrations`) and click `Manage` on `GitHub`.

### 2.1 Configure inbound webhook config

On the GitHub integration page:

- Click `Create GitHub Inbound Webhook`
- Set `Viberglass project` (or keep default)
- Fill `GitHub repository (owner/repo)` for deterministic routing
- Copy `Webhook URL` and `Webhook Secret`
- Keep inbound events aligned with your use case:
  - `Issue opened`
  - `Issue comment created`
- Optional: enable `Auto-execute fixes after matching GitHub inbound events`

### 2.2 Configure integration credential

In `Integration Credentials`:

- Click `Add Credential`
- Either:
  - `Use existing secret` (select a secret from `Secrets`), or
  - `Create new secret` (store value in DB/SSM directly)
- Set `Credential Name` (for example `GITHUB_TOKEN`)
- Optionally mark it as default

This credential is what project SCM execution will use.

## Step 3: Configure Global Shortcut Integration

Open `Integrations` (`/settings/integrations`) and click `Manage` on `Shortcut`.

- Click `Create Shortcut inbound webhook`
- Set `Viberglass project` (or keep default)
- Optional: set `Shortcut project ID` to make routing deterministic
- Copy `Webhook URL` and `Webhook secret`
- Select inbound events:
  - `Story created`
  - `Comment created`
- Optional: enable `Auto-execute jobs after matching Shortcut inbound events`

Optional feedback setup:

- Add `Shortcut API token`
- Click `Enable feedback` (publishes job lifecycle updates back to Shortcut stories)

## Step 4: Create and Activate a Clanker

Open `Clankers` (`/clankers`) and click `Commission Servant`.

In `/clankers/new`:

- Fill `Name` and `Description`
- Choose `Deployment Strategy` (`Docker`, `Ecs`, or `Aws-lambda-container`)
- For Docker, choose provisioning mode:
  - `Managed` (image built from project Dockerfile)
  - `Pre-built` (requires `Container Image`)
- Select `Agent` (for example `Claude Code`)
- Select required secrets (at minimum your AI token; include `GITHUB_TOKEN` if needed by your execution model)
- Click `Create Clanker`

After creation, open the clanker detail page and ensure status is active/healthy before running jobs.

## Step 5: Create or Open a Project and Link Integrations

You can create a new project from dashboard (`/new`) or open existing project settings.

Project settings are under project scope:

- Open project
- Click project switcher (top-left project name)
- Click `Project Settings`

### 5.1 Link integrations to the project

Open `Integrations` tab in project settings (`/project/:slug/settings/integrations`):

- Link your `Shortcut` integration
- Link your `GitHub` integration

### 5.2 Configure SCM execution

Open `Project` tab (`/project/:slug/settings/project`) and configure:

- `SCM Integration` = your GitHub integration
- `Source Repository` (clone target)
- `Base Branch`
- Optional PR overrides:
  - `Pull Request Repository`
  - `Pull Request Base Branch`
- Optional `Branch Name Template`
- `Integration Credential (Recommended)` = GitHub credential from Step 2.2
- Optional `Enable Auto-fix`
- Click `Save changes`

## Step 6: Configure Shortcut Webhook in Shortcut

In Shortcut:

- Go to `Settings > Integrations > Webhooks`
- Create a webhook using Viberglass `Webhook URL`
- Configure signing to match Viberglass secret handling (`X-Shortcut-Signature: sha256=<hmac>`)
- Enable the same events selected in Viberglass inbound config

If you use project-scoped routing, ensure Shortcut project IDs match your Viberglass inbound configuration.

## Step 7: Validate End-to-End Flow

1. Create or update a Shortcut story that should trigger Viberglass.
2. Confirm a ticket appears in Viberglass (`/project/:slug/tickets`).
3. Run manually from ticket with `Run with <Clanker>` or rely on auto-execute.
4. Track execution in `/project/:slug/jobs`.
5. Confirm code changes/PR behavior in GitHub.
6. If feedback is enabled, verify lifecycle updates appear back in Shortcut.

## Troubleshooting

### No tickets arrive from Shortcut

- Check integration is linked to the project (`/project/:slug/settings/integrations`)
- Verify webhook URL and signing secret match
- Verify event selection matches in both systems
- Check delivery history on Shortcut integration detail page

### Jobs fail quickly or never start

- Confirm at least one clanker is active/healthy
- Confirm required secrets are attached to clanker config
- Confirm SCM settings (repo/branch/credential) are saved in project settings

### PRs are not created

- Confirm `Integration Credential` is selected in project SCM settings
- Confirm token has required repository permissions
- Verify repository URL and base branch are correct

### Feedback controls are disabled

- Add the provider API token (Shortcut or GitHub) in integration detail page
- Re-enable feedback after token entry
