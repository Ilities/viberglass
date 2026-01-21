# Coding Conventions

**Analysis Date:** 2025-01-19

## Naming Patterns

**Files:**
- Use PascalCase for classes and components: `AgentFactory.ts`, `BaseAgent.ts`, `JobService.ts`
- Use kebab-case for utilities and helpers: `api.test.ts`, `database.integration.test.ts`
- Test files are co-located with source files using `.test.ts` suffix: `GitService.test.ts`, `AgentFactory.test.ts`
- Integration tests use `.integration.test.ts` suffix in `__tests__/integration/` directory

**Functions:**
- Use camelCase for functions and methods: `createAgent`, `getCommitHistory`, `cloneRepository`
- Async functions follow same convention with `async` keyword: `public async cloneRepository(...)`
- Private methods use camelCase with `private` modifier: `private async getRepoMetadata(...)`
- Static methods use PascalCase for class access: `AgentFactory.createAgent()`, `TestDatabase.start()`

**Variables:**
- Use camelCase for local variables and parameters: `repoUrl`, `branchName`, `workDir`
- Constants use UPPER_SNAKE_CASE: `API_BASE_URL`, `ENV_FILE`
- Class properties use camelCase with access modifiers: `private logger: Logger`, `protected config: AgentConfig`

**Types:**
- Use PascalCase for interfaces and types: `AgentConfig`, `ExecutionContext`, `ExecutionResult`
- Use PascalCase for enum-like types: `Severity`, `TicketSystem`, `AutoFixStatus`
- Generic types use single-letter uppercase: `Map<string, AgentConfig>`, `Promise<T>`

## Code Style

**Formatting:**
- No explicit Prettier config found at project root (uses default/IDE formatting)
- Next.js frontend extends `next/core-web-vitals` ESLint preset
- No global ESLint config for backend packages
- Use of 2-space indentation observed across files

**Linting:**
- Frontend: ESLint with `next/core-web-vitals` preset in `/home/jussi/Development/viberator/platform/frontend/.eslintrc.json`
- Rule override: `@next/next/no-img-element` is disabled
- No ESLint config detected for backend or orchestrator packages

**TypeScript Configuration:**
- Strict mode enabled: `"strict": true` across all packages
- Backend/CommonJS: `target: ES2020`, `module: commonjs`
- Frontend/Next.js: `target: ES2017`, `module: esnext`, `moduleResolution: bundler`
- Consistent `esModuleInterop: true`, `skipLibCheck: true`

## Import Organization

**Order:**
1. Node.js built-in modules
2. External packages
3. Internal modules (relative imports)
4. Type-only imports (if needed)

**Path Aliases:**
- Frontend uses `@/*` for absolute imports: `import { API_BASE_URL } from '@/lib'`
- Monorepo workspace packages use `@viberator/types` for shared types
- No other path aliases configured

**Examples from codebase:**

```typescript
// Backend import pattern
import express, { Express } from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import path from 'path';

// Internal imports
import projectsRouter from './routes/projects';
import ticketsRouter from './routes/tickets';
```

```typescript
// Orchestrator import pattern
import { BaseAgent } from './BaseAgent';
import { ClaudeCodeAgent } from './ClaudeCodeAgent';
import { AgentConfig } from '../types';
import { Logger } from 'winston';
```

```typescript
// Frontend import pattern
import { API_BASE_URL } from '@/lib'
import type {
  ApiResponse,
  CreateProjectRequest,
} from '@viberator/types'
```

## Error Handling

**Patterns:**
- Always use try-catch blocks for async operations
- Extract error message from Error objects: `error instanceof Error ? error.message : 'Unknown error'`
- Wrap errors with context before throwing: `throw new Error(\`Git clone failed: ${errorMessage}\`)`
- Use specific error types when available
- Log errors with context using structured logging

**Example from `/home/jussi/Development/viberator/viberator/app/src/services/GitService.ts`:**

```typescript
try {
  // operation
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  this.logger.error('Git clone failed', { error: errorMessage });
  throw new Error(\`Git clone failed: ${errorMessage}\`);
}
```

**API error handling pattern from `/home/jussi/Development/viberator/platform/backend/src/api/routes/jobs.ts`:**

```typescript
try {
  // operation
} catch (error) {
  logger.error('Failed to enqueue job', { error: error instanceof Error ? error.message : error });
  res.status(500).json({
    error: error instanceof Error ? error.message : 'Internal server error',
  });
}
```

## Logging

**Framework:** Winston (used in all packages)

**Configuration:**
- Logger configuration in `platform/backend/src/config/logger.ts`
- Environment-based: development (debug level, colorized), production (info level, JSON + file rotation), test (minimal output)
- Integrated with `logRedaction.ts` for automatic sensitive data redaction
- File rotation in production: `logs/error-YYYY-MM-DD.log` and `logs/combined-YYYY-MM-DD.log`

**Patterns:**
- **NEVER use console.log/error/warn/info/debug** - always use Winston logger
- Import logger: `import logger from '../config/logger'` (default logger)
- Use child loggers for context: `const logger = createChildLogger({ service: 'ServiceName' })`
- Use structured logging with objects: `logger.info('Operation completed', { jobId, status })`
- Log levels: `error`, `warn`, `info`, `debug`
- Include context in log objects for debugging
- Use descriptive log messages with operation context (avoid manual prefixes like `[ServiceName]`)

**Child logger pattern (preferred for services/workers):**

```typescript
import { createChildLogger } from '../config/logger';

const logger = createChildLogger({ service: 'JobService' });
// or
const logger = createChildLogger({ worker: 'OrphanSweeper' });
// or
const logger = createChildLogger({ invoker: 'Docker' });

// Logs automatically include the context
logger.info('Job enqueued', { jobId, repository, tenantId });
// Output: [JobService] Job enqueued { jobId: '...', repository: '...', tenantId: '...' }
```

**Default logger pattern (for routes/simple cases):**

```typescript
import logger from '../config/logger';

logger.error('Failed to enqueue job', { error: error instanceof Error ? error.message : error });
logger.info('Server started', { port, env: process.env.NODE_ENV });
```

**Error logging pattern:**

```typescript
try {
  // operation
} catch (error) {
  logger.error('Operation failed', {
    error: error instanceof Error ? error.message : error,
    context: 'additional context'
  });
  // or with stack trace for debugging
  logger.error('Critical failure', {
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined
  });
}
```

## Comments

**When to Comment:**
- Use JSDoc-style comments for public methods
- Inline comments for non-obvious logic
- TODO comments for future work

**JSDoc/TSDoc:**
- Use `/** */` for method documentation
- Include parameter descriptions and return types

**Example from `/home/jussi/Development/viberator/viberator/app/src/services/GitService.ts`:**

```typescript
/**
 * Clone repository with automatic SCM authentication using simple-git
 */
public async cloneRepository(
  repoUrl: string,
  branch: string,
  workDir: string,
): Promise<void> {
```

```typescript
/**
 * Format and print stream event data to stdout
 * @param data
 * @private
 */
private formatAndPrintStreamEvent(data: any): void {
```

## Function Design

**Size:** No strict limit observed, but functions generally stay under 50 lines

**Parameters:**
- Use parameter objects for 3+ parameters: `(config: AgentConfig, logger: Logger)`
- Destructure objects in function parameters when relevant
- Use default values for optional parameters: `limit: number = 10`

**Return Values:**
- Always specify return types for public methods
- Use typed return values: `Promise<void>`, `Promise<string>`
- Return objects for multiple values: `{ jobId, status, timestamp }`
- Return null for not-found cases: `return null;` vs throwing

**Example from `/home/jussi/Development/viberator/platform/backend/src/services/JobService.ts`:**

```typescript
async submitJob(
  data: JobData,
): Promise<{ jobId: string; status: string; timestamp: string }> {
  // implementation
}

async getJobStatus(jobId: string): Promise<any | null> {
  // returns null if not found
}
```

## Module Design

**Exports:**
- Use named exports for utilities: `export { describe, it, expect }`
- Use default exports for classes and main modules: `export class AgentFactory`, `export default app`
- Re-export types for convenience: `export type { Project, CreateProjectRequest }`

**Barrel Files:**
- Use `index.ts` files to group and re-export related modules
- Pattern: `export * from './BaseAgent'`
- Example: `/home/jussi/Development/viberator/viberator/app/src/agents/index.ts`

**Example from `/home/jussi/Development/viberator/platform/backend/src/__tests__/helpers/index.ts`:**

```typescript
export * from './testContainers';
export * from './testServer';
```

**Example from `/home/jussi/Development/viberator/platform/backend/src/models/Ticket.ts`:**

```typescript
// Re-export all types from shared types package
export type {
  Severity,
  TicketSystem,
  // ... other types
} from '@viberator/types';

// Backend-specific types
export interface CreateTicketRequest {
  // ...
}
```

## Class Design

**Constructors:**
- Use dependency injection for services: `constructor(private logger: Logger) {}`
- Store injected dependencies as private properties
- Initialize configuration in constructor

**Visibility:**
- Use `public` for API methods (default, can be omitted)
- Use `private` for internal helpers
- Use `protected` for methods intended for subclass use

**Abstract Classes:**
- Define abstract methods for interface contracts
- Provide protected helper methods for subclasses

**Example from `/home/jussi/Development/viberator/viberator/app/src/agents/BaseAgent.ts`:**

```typescript
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected logger: Logger;

  constructor(config: AgentConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  abstract execute(prompt: string, context: ExecutionContext): Promise<ExecutionResult>;
  protected abstract requiresApiKey(): boolean;
}
```

## Async Patterns

**Always use async/await:**
- Prefer async/await over Promise chains
- Use Promise for wrapper functions only

**Example:**

```typescript
public async cloneRepository(
  repoUrl: string,
  branch: string,
  workDir: string,
): Promise<void> {
  try {
    const git = simpleGit({ baseDir: workDir });
    await git.clone(authenticatedUrl, repoPath, ['--branch', branch]);
    this.logger.debug('Repository cloned successfully');
  } catch (error) {
    // error handling
  }
}
```

## String Formatting

**Template Literals:**
- Use backticks for all strings with interpolation
- Use single quotes for static strings (consistency varies, some use double quotes)
- Prefer template literals for multi-line strings

**Examples:**

```typescript
const errorMessage = \`Git clone failed: ${errorMessage}\`;
const repoPath = path.join(workDir, 'repo');
```

## Database Patterns (Kysely)

**Query Building:**
- Use Kysely type-safe query builder
- Chain methods for readable queries
- Use `execute()` for mutations, `executeTakeFirst()` for single results

**Example from `/home/jussi/Development/viberator/platform/backend/src/services/JobService.ts`:**

```typescript
const job = await db
  .selectFrom('jobs')
  .selectAll()
  .where('id', '=', jobId)
  .executeTakeFirst();

await db
  .insertInto('jobs')
  .values({...})
  .execute();
```

---

*Convention analysis: 2025-01-19*
