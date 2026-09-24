# ADR 0002: Self-hosted, portfolio-first distribution

- **Status:** Accepted (amended 2026-09-24: AWS is a supported self-hosted deployment, not only `docker compose`)
- **Date:** 2026-09-23
- **Decider:** Jussi Hallila

## Context
The product could be offered as hosted SaaS or self-hosted software. There is no plan to invest in marketing or sales. For now the project is primarily a portfolio piece.

## Decision
Viberglass is **self-hosted**: whoever runs it deploys it into infrastructure they control. It is developed as a **portfolio piece** first. There is no hosted offering, billing or sales motion.

Two deployment paths are supported, and both count as self-hosted:

1. **AWS** (the production path): the Pulumi stacks in `infra/` deploy the backend on ECS with RDS, the frontend on Amplify, and workers on ECS Fargate or Lambda, with images in ECR.
2. **`docker compose up`** (development and local experimentation): Postgres, backend and frontend on one machine, with workers as local Docker containers.

## Consequences
- **The first run is the product demo, on either path.** An evaluator's first 15 minutes after the instance comes up matter more than any other journey. Setup must work without insider knowledge, whether the instance was deployed to AWS or started with `docker compose up`.
- **Product flows must not assume one compute target.** Setup, defaults, readiness and failure copy work the same on Docker, ECS and Lambda. The platform derives which targets are available from its configuration (for example the `VIBERATOR_ECS_*` and `VIBERATOR_LAMBDA_*` stack outputs) instead of asking the user.
- **Getting the instance running is a one-time task for whoever hosts it,** outside the product's setup flow (ADR 0003). On compose that's one command with no configuration. On AWS it's the documented Pulumi deploy plus publishing worker images to ECR.
- **Nothing may depend on external infrastructure the self-hoster may not have.** Invites must work as shareable links without SMTP (email is optional when SMTP is configured). SSO is optional and deferred. Repository access starts from a pasted access token (ADR 0003). A GitHub App the self-hoster registers is an optional advanced path. The AWS path may rely on the AWS services its stacks create, but not on anything beyond them.
- **There's no product analytics.** Success metrics are quality bars checked through scripted walkthroughs and end-to-end tests, not telemetry-driven growth targets.
- **Features that only make sense for commercial SaaS are out of scope:** billing, plans, multi-tenant signup.
