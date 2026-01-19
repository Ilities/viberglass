# Technology Stack

**Analysis Date:** 2026-01-19

## Languages

**Primary:**
- TypeScript 5.x - All services, orchestrator, and frontend

**Secondary:**
- JavaScript - Some legacy/compatibility code
- Dockerfile - Container definitions

## Runtime

**Environment:**
- Node.js >=20.0.0 (required)
- Node 24-slim - Docker base images

**Package Manager:**
- npm (workspaces)
- Lockfile: package-lock.json (present)

## Frameworks

**Core:**

**Backend (`platform/backend`):**
- Express 4.16 - HTTP server framework
- Kysely 0.27 - Type-safe SQL query builder
- pg 8.11 - PostgreSQL client
- Bull - Job queue (Redis-backed)
- redis - Message queue backend

**Frontend (`platform/frontend`):**
- Next.js 15 - React framework
- React 19 - UI library
- Tailwind CSS 4.1 - Styling

**Orchestrator (`viberator/app`):**
- Express 4.18 - HTTP server for API mode
- Winston 3.11 - Logging
- simple-git 3.30 - Git operations

**Infrastructure (`viberator/infrastructure/infra`):**
- Pulumi 3.x - Infrastructure as Code
  - @pulumi/aws 6.0
  - @pulumi/awsx 2.0

**Testing:**
- Jest 29.7 - Unit and integration testing
  - ts-jest - TypeScript Jest transformer
- Playwright 1.40 - E2E testing
- Supertest 6.3 - HTTP assertion library
- Testcontainers 10.0 - Containerized testing
  - @testcontainers/postgresql
  - @testcontainers/localstack

**Build/Dev:**
- tsup 8.0 - TypeScript bundler (orchestrator, types)
- tsx 4.21 - TypeScript execution (backend dev)
- nodemon 3.0 - Development hot-reload (backend)
- concurrently 8.2 - Run multiple npm scripts
- Prettier 3.x - Code formatting

## Key Dependencies

**Critical:**

**AI Integration:**
- @anthropic-ai/claude-code 2.0.75 - Claude Code CLI integration
- @anthropic-ai/claude-agent-sdk - Claude SDK for programmatic access

**AWS Integration:**
- aws-sdk 2.1500 - AWS S3, SQS, Lambda
- @aws-sdk/client-ssm 3.0 - AWS Systems Manager Parameter Store
- aws-lambda 1.0 - Lambda handler types

**Data & Storage:**
- pg 8.11 - PostgreSQL driver
- Kysely 0.27 - Type-safe query builder
- Redis 4.x - Message queue backend
- Bull - Redis-backed job queue

**Utilities:**
- axios 1.6 - HTTP client
- uuid 9.0 - UUID generation
- multer 1.4 - Multipart form data (file uploads)
- joi 17.11 - Schema validation
- dotenv 16.3 - Environment configuration
- cors 2.8 - Cross-origin resource sharing

**Frontend-specific:**
- @headlessui/react 2.2 - Unstyled accessible UI components
- @heroicons/react 2.2 - Icon library
- clsx 2.1 - Conditional class names
- motion 12.23 - Animation library

**Infrastructure:**
- Pulumi AWS stack
  - ECR repositories
  - Lambda functions
  - ECS Fargate tasks
  - SQS queues
  - IAM roles/policies

## Configuration

**Environment:**
- dotenv per workspace (`.env` files)
- Example configs: `platform/backend/.env.example`, `viberator/app/.env.example`

**TypeScript Configs:**
- `platform/backend/tsconfig.json` - CommonJS, ES2020 target
- `platform/frontend/tsconfig.json` - ESM, Next.js bundled
- `viberator/app/tsconfig.json` - CommonJS, ES2020 target
- `viberator/infrastructure/infra/tsconfig.json` - CommonJS, ES2020 target

**Build Configs:**
- `viberator/app/tsup.config.ts` - Bundler for CLI, Lambda, API server
- `packages/types/tsup.config.ts` - Dual CJS/ESM output
- `platform/frontend/next.config.mjs` - Next.js config
- `platform/frontend/postcss.config.mjs` - Tailwind CSS via PostCSS

**Test Configs:**
- `platform/backend/jest.config.js` - Unit tests (ts-jest ESM preset)
- `platform/backend/jest.integration.config.js` - Integration tests
- `platform/frontend/jest.config.js` - Frontend unit tests
- `viberator/app/jest.config.js` - Orchestrator tests
- `e2e-tests/playwright.config.ts` - E2E test configuration

**Linting/Formatting:**
- Prettier 3.x across all workspaces
- ESLint 9.x (frontend only)
- `platform/frontend/prettier.config.mjs`

## Platform Requirements

**Development:**
- Node.js >=20.0.0
- Docker (for containerized builds and local testing)
- PostgreSQL 13+ (local or containerized)
- Redis 6+ (for job queues)

**Production:**
- AWS infrastructure (ECS Fargate, Lambda, SQS, S3, SSM)
- Node.js 24-slim Docker images
- PostgreSQL (RDS or self-hosted)
- Redis (ElastiCache or self-hosted)

---

*Stack analysis: 2026-01-19*
