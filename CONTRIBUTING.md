# Contributing to Viberglass

Thank you for your interest in contributing to Viberglass! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Pull Requests](#pull-requests)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Guidelines](#commit-guidelines)
- [Architecture Overview](#architecture-overview)

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md) to keep our community open and welcoming.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/viberglass.git`
3. Add the upstream remote: `git remote add upstream https://github.com/Ilities/viberglass.git`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites

- Node.js 20+
- Docker Engine 20.10+ and Docker Compose v2
- Git

### Quick Start

```bash
# Install dependencies and build the workspace packages the backend loads
npm ci
npm run backend:build-deps

# Start Postgres, MinIO, the backend and the frontend (http://localhost:3000)
docker compose -f docker-compose.dev.yml up
```

The backend and frontend run in compose with hot reload, and the backend migrates on start. After changing a package under `packages/`, build it again (`npm run build -w <package>`). Set `COMPOSE_FILE=docker-compose.dev.yml` in the root `.env` to leave out the `-f`. Optional settings go in a `.env` in the repository root. To run the backend outside compose instead, see [docs/local-development.md](docs/local-development.md).

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you observed and what behavior you expected**
- **Include screenshots if possible**
- **Include environment details** (OS, Node version, Docker version)

### Suggesting Features

Feature suggestions are tracked as GitHub issues. When creating a feature suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested feature**
- **Explain why this feature would be useful**
- **List some use cases or examples**

### Pull Requests

1. Ensure your code follows the [coding standards](#coding-standards)
2. Write or update tests as needed
3. Ensure all tests pass: `npm test`
4. Update documentation if needed
5. Submit your pull request with a clear description of changes
6. Sign the [Contributor License Agreement](CLA.md) when the CLA Assistant asks on your first pull request. You keep the copyright in your work; the agreement lets the project be distributed under the AGPL and, if needed, under other licenses. Pull requests can be merged only once it's signed.

**PR Title Format:** Use conventional commits style:
- `feat: add new feature`
- `fix: resolve bug with ticket creation`
- `docs: update README`
- `refactor: simplify job execution logic`

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Follow existing type patterns
- Avoid `any` - use proper types or `unknown` with type guards
- Never use type assertions (`as`) to bypass type errors

### Code Organization

- One primary class per file
- Keep files under 350 lines, classes under 150 and service classes under 200; split by responsibility when they grow past that

### Naming Conventions

- Class files: `PascalCase`, matching the class (e.g., `TicketService.ts`)
- Utility/function-only files: `camelCase` (e.g., `formatDate.ts`)
- Type/interface-only files: `camelCase` (e.g., `taskHandoff.ts`)

### Architecture Principles

- **Single Responsibility**: Each class/function does one thing
- **Dependency Injection**: Use constructor injection for collaborators
- **Interface-based**: Program to interfaces, not implementations
- **No monster services**: Split large services into focused collaborators

## Testing

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

### Writing Tests

- **Unit tests**: `apps/platform-backend/src/__tests__/unit/`; next to the source in the frontend and the worker (`*.test.ts`, `*.test.tsx`); in `test/` in the plugin packages and the CLI
- **Integration tests**: `apps/platform-backend/src/__tests__/integration/`
- **E2E tests**: `tests/e2e/tests/` (Playwright)

See [TESTING.md](TESTING.md) for how to run each suite.

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(tickets): add bulk ticket creation

Add ability to create multiple tickets from a CSV file.

Closes #123
```

```
fix(api): resolve database connection timeout

Increase connection pool timeout from 5s to 30s.

Fixes #456
```

### Before Committing

- [ ] Code is formatted
- [ ] Tests pass
- [ ] No console errors or warnings
- [ ] Commit message follows format

## Architecture Overview

Viberglass consists of:

- **Platform Backend** (`apps/platform-backend`): Express.js API server
- **Platform Frontend** (`apps/platform-frontend`): React SPA (Vite)
- **Viberator Worker** (`apps/viberator`): AI agent execution engine
- **Packages** (`packages/`): shared types, agent harness and integration plugins, the MCP server, telemetry and the `viberglass` CLI
- **Infrastructure** (`infra/`): Pulumi stacks for AWS, the Helm chart for Kubernetes, and the worker Dockerfiles

For detailed architecture documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

To add an agent harness or an integration (code host, tracker, chat service), run `npm run new:agent <name>` or `npm run new:integration <name>`; see [packages/agents/README.md](packages/agents/README.md) and [packages/integrations/README.md](packages/integrations/README.md).

## Questions?

Feel free to open an issue for questions about contributing.
