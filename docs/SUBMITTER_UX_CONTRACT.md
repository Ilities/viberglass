# Submitter UX contract

Viberglass turns a software-change ticket into a reviewed pull request. The canonical journey is:

1. Configure a **Project**, the automation boundary for one codebase and its repository, integrations, credentials, and agent runners.
2. Submit a **Ticket** with a title, description, and optional attachments.
3. Start **Research** to understand the ticket in the context of the codebase.
4. Review the research, continue to **Planning**, and approve the proposed change.
5. Start **Execution** and review the resulting pull request.

Tickets always belong to one Project. New tickets start in Research. Creating projects and tickets does not require repository access, but automation remains unavailable until all readiness checks pass.

## Terminology

- **Project** — one codebase and its automation configuration.
- **Ticket** — a requested software change.
- **Research** — codebase-aware investigation and findings.
- **Planning** — a proposed implementation for submitter approval.
- **Execution** — implementation of the approved plan.
- **Run** — one automatic attempt in a phase.
- **Agent runner** — configured infrastructure and coding agent that performs work.
- **Schedule** — recurring or triggered operational automation.

Operational details such as run logs, credentials, and runner deployment are secondary to the ticket journey. Failed and cancelled attempts remain part of ticket history.

## Primary actions

Each current stage presents one task-oriented action: start research, review and continue, start planning, approve and continue, execute, or view the pull request. A start action defaults to **Run automatically** and offers **Collaborate live** as its secondary mode. Direct execution is an advanced override and always requires an audit reason.
