# AGENTS.md

  ## Purpose
  Defines how agents should implement and review code in a Node.js + Express application using Clean Architecture.

  ## Core Principles
  1. Dependency rule: dependencies point inward.
  2. Business logic must be framework-agnostic.
  3. Keep controllers thin; put behavior in use cases.
  4. Infrastructure is replaceable (DB, queue, third-party APIs).
  5. Prefer explicit interfaces and dependency injection.

  ## Layers

  ### 1. Domain
  - Entities
  - Value objects
  - Domain services
  - Domain errors

  Rules:
  - No Express, HTTP, ORM, or external SDK imports.
  - Pure business rules only.

  ### 2. Application
  - Use cases
  - Input/output ports (interfaces)
  - Application DTOs
  - Application-level errors

  Rules:
  - Orchestrates domain behavior.
  - Depends on domain and abstractions only.
  - No direct infrastructure code.

  ### 3. Interface Adapters
  - Express routes/controllers
  - Request validation
  - Presenters/response mappers
  - HTTP middleware (auth, rate limiting, etc.)

  Rules:
  - Translate HTTP input to use-case input.
  - Translate use-case output/errors to HTTP responses.
  - No business rules in controllers.

  ### 4. Infrastructure
  - Repository implementations
  - ORM/data access models
  - External API clients
  - Queue/cache/storage adapters
  - Configuration providers

  Rules:
  - Implements application ports.
  - Keep vendor-specific logic isolated.

  ### 5. Composition Root
  - App bootstrap
  - Dependency wiring
  - Route registration

  Rules:
  - Construct concrete implementations.
  - Inject dependencies into use cases/controllers.
  - Keep wiring centralized.

  ## Suggested Folder Structure
  ```txt
  src/
    domain/
      entities/
      value-objects/
      services/
      errors/
    application/
      use-cases/
      ports/
        in/
        out/
      dto/
      errors/
    interfaces/
      http/
        controllers/
        routes/
        middleware/
        validators/
        presenters/
    infrastructure/
      db/
        repositories/
        models/
        migrations/
      external/
        clients/
      queue/
      cache/
      storage/
    main/
      container/
      app.ts
      server.ts
    shared/
      config/
      logging/
      utils/

  ## Coding Rules

  1. Keep files focused and single-purpose.
  2. Keep controllers/middleware free of business orchestration.
  3. Use interfaces for all external dependencies used by use cases.
  4. Avoid hidden globals for business dependencies.
  5. Prefer composition over inheritance for infrastructure implementations.
  6. Keep naming explicit and consistent.

  ## API and Validation Rules

  1. Validate all incoming requests at the HTTP boundary.
  2. Use explicit request/response DTOs.
  3. Return consistent error payload shape.
  4. Never leak internal stack traces to clients.

  ## Error Handling

  1. Use typed errors by layer (Domain/Application/Infrastructure).
  2. Maintain centralized HTTP error mapping.
  3. Log technical details internally; expose safe messages externally.

  ## Testing Strategy

  1. Domain: pure unit tests.
  2. Application: unit tests with mocked ports.
  3. Infrastructure: integration tests against real adapters where useful.
  4. Interface: HTTP tests for routes/controllers and contracts.
  5. Add regression tests for every bug fix.

  ## Definition of Done

  1. Correct layer placement and dependency direction.
  2. Relevant tests added/updated and passing.
  3. Lint/type checks passing.
  4. No dead code introduced.
  5. Public API contract changes documented.

  ## Non-Goals

  1. No direct DB/API calls in controllers.
  2. No framework-specific logic in domain/use cases.
  3. No “god services” that mix multiple responsibilities.