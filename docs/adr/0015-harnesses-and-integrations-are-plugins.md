# ADR 0015: Harnesses and integrations are plugins, chosen by build config

- **Status:** Accepted
- **Date:** 2026-10-09
- **Decider:** Jussi Hallila

## Context
Harnesses and integrations already live in their own packages, with a registry each. The packages don't describe enough about themselves, so the rest of the code keeps its own lists of them:

- The platform hand-maintains the harness ids, labels, picker options, logos, per-harness config types, normalizers and form fields. The worker build, the catalog generator and the Dockerfile generator each list the harnesses again, and a database constraint lists them once more.
- Signing in to Codex with a ChatGPT account is a one-off slice through types, secrets, backend services, routes, invokers, the worker and the UI. More harnesses are getting OAuth and other sign-ins, so API keys are no longer the only way a harness authenticates.
- Inbound webhooks for GitHub, Jira, Shortcut and custom are implemented in the backend: provider classes, header sniffing, signature policies, a route file per provider and inbound processors. Pull requests, their outcomes and reviews, repository checks and git auth are GitHub-only code in the backend and the worker.
- The integration screens branch on `isGithub`, `isJira` and similar flags. Icons, descriptions and display names are kept in maps keyed by provider, and the ticket system and webhook provider ids are closed unions with database constraints.

Adding a harness or an integration means editing a dozen places that aren't in its package.

## Decision
- A harness or integration is a plugin package, and nothing outside its package names it. A plugin has a manifest (plain data, usable from the browser, backend and build scripts) and, where needed, worker, backend and frontend entry points.
- A build config file lists the plugins a build includes. A generator reads it and writes the plugin registrations for the worker, backend and frontend, the catalogs, the worker build list and the worker Dockerfiles. A build only contains, registers and offers the plugins in its config.
- Plugin ids are open strings checked against the registry at runtime. The database constraints on harness, ticket system and webhook provider ids are dropped.
- Anything the UI shows about a plugin comes from its manifest: name, description, icon, whether it's for tests only.
- Settings a plugin needs are described as fields in the manifest and rendered by one generic form, with one generic normalizer. What can't be described as fields is a named component slot in the plugin's frontend entry point.
- An integration declares the capabilities it implements instead of one category: tracker (issues and comments), inbound webhooks (verify, detect, parse, map events), repository (git auth, opening pull requests, their outcomes and reviews) and chat. Shared code asks the registry for the plugins with a capability and talks to them through that capability's interface.
- Signing in is a harness capability. A harness declares its sign-in methods: an API key per model provider, or an interactive login such as a device code or an OAuth flow. The platform runs every interactive login through the same login job, secret type, credential cache route and UI. Codex's ChatGPT login is the first harness to use it.
- Harnesses and integrations share a small kernel: the base manifest, the settings field type, a generic registry and the generator. Their capability interfaces stay separate.

## Consequences
- Adding a harness or integration is a new package, a line in the build config and a regenerate. A test fails if a plugin id shows up outside its package and test fixtures.
- A self-hosted build can leave plugins out. Their images, routes and settings disappear with them.
- Records that name a plugin left out of the build stay in the database, so the code has to handle ids the registry doesn't know.
- The per-harness forms, normalizers, Codex-specific services and routes, backend webhook providers and GitHub pull request code move into the plugin packages or are replaced by generic code. That is a large change, done in steps that each keep current behaviour.
- A second interactive login, such as OAuth for another harness, plugs into the existing login flow and doesn't need its own.
- Plugins are compiled into the build. Loading third-party plugins at runtime isn't supported.
