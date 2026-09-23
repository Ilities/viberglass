# ADR 0002: Self-hosted, portfolio-first distribution

- **Status:** Accepted
- **Date:** 2026-09-23
- **Decider:** Jussi Hallila

## Context
The product could be offered as hosted SaaS or self-hosted software. There is no plan to invest in marketing or sales. For now the project is primarily a portfolio piece.

## Decision
Viberglass is **self-hosted** (`docker compose up` is the entry point). It is developed as a **portfolio piece** first. There is no hosted offering, billing or sales motion.

## Consequences
- **The first run is the product demo.** An evaluator's first 15 minutes after `docker compose up` matter more than any other journey. Setup must work without insider knowledge.
- **Nothing may depend on external infrastructure the self-hoster may not have.** Invites must work as shareable links without SMTP (email is optional when SMTP is configured). SSO is optional and deferred. Repository access starts from a pasted access token (ADR 0003). A GitHub App the self-hoster registers is an optional advanced path.
- **There's no product analytics.** Success metrics are quality bars checked through scripted walkthroughs and end-to-end tests, not telemetry-driven growth targets.
- **Features that only make sense for commercial SaaS are out of scope:** billing, plans, multi-tenant signup.
