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
# Install dependencies
npm install

# Copy environment files
cp .env.development.example .env.local
cp apps/platform-backend/.env.example apps/platform-backend/.env

# Start the development stack
docker compose up -d

# Run the development servers
npm run dev
```

For more detailed setup instructions, see [README.md](README.md).

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
- Keep files under 350 lines
- Keep service classes under 200 lines
- Place unit tests next to the code they test (`*.test.ts`)

### Naming Conventions

- Classes: `PascalCase` (e.g., `TicketService.ts`)
- Utilities/functions: `camelCase` (e.g., `formatDate.ts`)
- Types/interfaces: `PascalCase` (e.g., `Ticket.ts`)

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

- **Unit tests**: Co-located with source files (`*.test.ts`)
- **Integration tests**: In `src/__tests__/integration/` directories
- **E2E tests**: In `tests/e2e/tests/` directory

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
- **Platform Frontend** (`apps/platform-frontend`): React/Next.js application
- **Viberator Worker** (`apps/viberator`): AI agent execution engine
- **Infrastructure** (`infra/`): Pulumi-based AWS deployment

For detailed architecture documentation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Questions?

Feel free to open an issue for questions about contributing.
