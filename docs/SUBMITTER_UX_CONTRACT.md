# Submitter UX contract

Viberglass turns a software-change ticket into a reviewed pull request. The canonical journey is:

1. Configure a **Project**, the automation boundary for one codebase and its repository, integrations, credentials, and agent runners.
2. Submit a **Ticket** with a title, description, and optional attachments.
3. Ask for a **Plan**: the agent reads the codebase, then writes what it found and the change it proposes.
4. Discuss and revise the plan in the ticket's thread.
5. Ask for **Execution** and review the resulting pull request.

Tickets always belong to one Project. New tickets start in Planning. Creating projects and tickets does not require repository access, but automation remains unavailable until all readiness checks pass.

## Terminology

- **Project** — one codebase and its automation configuration.
- **Ticket** — a requested software change.
- **Planning** — codebase-aware findings and a proposed implementation, in one document.
- **Execution** — implementation of the plan.
- **Run** — one automatic attempt in a phase.
- **Agent runner** — configured infrastructure and coding agent that performs work.
- **Schedule** — recurring or triggered operational automation.

Operational details such as run logs, credentials, and runner deployment are secondary to the ticket journey. Failed and cancelled attempts remain part of ticket history.

## Primary actions

Each current stage presents one task-oriented action: write the plan, revise the plan, build it, or view the pull request. A start action defaults to **Run automatically** and offers **Collaborate live** as its secondary mode. Direct execution is an advanced override and always requires an audit reason.
