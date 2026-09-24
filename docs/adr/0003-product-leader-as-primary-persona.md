# ADR 0003: Product leader as primary persona, including setup

- **Status:** Accepted
- **Date:** 2026-09-23
- **Decider:** Jussi Hallila

## Context
The audit asked who the product is primarily designed for: the engineering leader who installs it, or the product leader who brings objectives. Today's UI is built around an operator/admin who understands runners, secrets, integrations and deployment strategies. The first-run walkthrough needed about 25 page hops and backend logs to reach a runnable task.

## Decision
The **product leader** (PM / head of product at a software company) is the first and primary persona. That includes **setting the product up**. After the instance is running, a product leader must be able to configure it alone. Setup asks for only:

1. **A model API key** (pasted in).
2. **A repository**: its URL and an access token for it.
3. **A name** for the first space. (The account comes from the existing first-admin registration; there is no separate workspace name. Jussi, 2026-09-24.)

Everything else is defaulted or derived: the agent and where it runs, secret storage, the SCM integration and credential, branches, workflow and prompts. It all stays changeable later under advanced settings.

## Consequences
- Setup is one short flow with three inputs. Runners, deployment strategies, secret storage modes, integration credentials, webhooks and prompt templates never appear in it.
- The default agent is chosen from the key's provider, which the user picks (every selectable harness is supported; a key prefix only pre-selects it), and runs on the compute the instance has (ECS on AWS, local Docker on `docker compose`; ADR 0002). It's provisioned automatically, with no separate "Start".
- The pasted repo token creates the SCM connection and credential implicitly. GitHub App setup, webhooks and PR-repository overrides are optional advanced paths.
- Validation happens inline and in plain language ("This key works", "This token can't push to acme/web: it needs write access").
- The default landing page, navigation and copy serve someone who doesn't read code: Inbox, tasks and plain-language status first; plumbing under Settings.
- The engineering admin is a secondary, optional persona who uses the advanced settings.
- Getting the instance running is outside this flow. Whoever hosts it does that once, on AWS or with `docker compose up` (ADR 0002). It must still require no configuration beyond the documented deploy.
