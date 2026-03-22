# Viberglass Architecture

This document provides a comprehensive overview of the Viberglass system architecture.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Diagram](#architecture-diagram)
- [Core Components](#core-components)
- [Data Flow](#data-flow)
- [Technology Stack](#technology-stack)
- [Deployment Architecture](#deployment-architecture)
- [Scalability Considerations](#scalability-considerations)

## System Overview

Viberglass is an AI agent orchestrator and ticket management platform. It automates the process of fixing bugs and implementing code changes by:

1. Receiving tickets from external systems (GitHub, Jira, Shortcut, etc.)
2. Dispatching jobs to AI agent workers (Clankers)
3. Managing the execution lifecycle
4. Posting results back to the originating system

### Key Concepts

- **Ticket**: A work item representing a bug, feature request, or code change
- **Job**: An execution unit that processes a ticket
- **Clanker**: A configured AI agent worker (defines model, compute, credentials)
- **Viberator**: A running instantiation of a Clanker
- **Project**: A collection of tickets, integrations, and configurations
- **Integration**: Connection to external systems (GitHub, Jira, etc.)

## Architecture Diagram

```mermaid
flowchart TB
    subgraph External["📡 External Systems"]
        GH["GitHub"]
        Jira["Jira"]
        SC["Shortcut"]
        WH["Custom Webhooks"]
    end

    subgraph Platform["🏗️ Viberglass Platform"]
        subgraph API["API Gateway (Express)"]
            direction TB
            Gateway["REST API"]
        end

        subgraph Services["Core Services"]
            TS["Ticket Service"]
            JS["Job Service"]
            WS["Webhook Service"]
            IS["Integration Service"]
        end

        subgraph Data["Data Layer"]
            PG[("PostgreSQL<br/>(Tickets, Jobs)")]
            S3[("S3<br/>(Files, Media)")]
            SSM[("AWS SSM<br/>(Secrets)")]
        end
    end

    subgraph Workers["🔧 Worker Layer (Clankers)"]
        Orchestrator["Worker Orchestrator"]
        
        subgraph Compute["Compute Targets"]
            Docker["Docker (Local)"]
            ECS["AWS ECS (Fargate)"]
            Lambda["AWS Lambda"]
        end

        subgraph Agent["AI Agent Harness"]
            A1["Claude Code"]
            A2["Codex/Gemini/Qwen"]
            A3["Mistral/Kimi/OpenCode"]
        end

        subgraph Ops["Operations"]
            Git["Git Operations"]
            FS["File System"]
            Code["Code Analysis"]
        end
    end

    subgraph SCM["📦 Source Control"]
        GitHub["GitHub / GitLab"]
    end

    %% External to Platform
    GH -->|"Webhooks"| Gateway
    Jira -->|"Webhooks"| Gateway
    SC -->|"Webhooks"| Gateway
    WH -->|"Webhooks"| Gateway

    %% API to Services
    Gateway --> TS
    Gateway --> JS
    Gateway --> WS
    WS --> IS

    %% Services to Data
    TS --> PG
    JS --> PG
    IS --> S3
    IS --> SSM

    %% Platform to Workers
    JS -->|"Job Dispatch"| Orchestrator
    Orchestrator --> Compute
    Compute --> Agent
    Agent --> Ops

    %% Workers to SCM
    Git --> GitHub

    %% Styling - Viberglass brand colors
    classDef external fill:#fef7e8,stroke:#d97706,stroke-width:2px,color:#1f2937
    classDef platform fill:#fffbeb,stroke:#b45309,stroke-width:2px,color:#1f2937
    classDef services fill:#ffedd5,stroke:#ea580c,stroke-width:2px,color:#1f2937
    classDef data fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#1f2937
    classDef workers fill:#fed7aa,stroke:#c2410c,stroke-width:2px,color:#1f2937
    classDef scm fill:#fce7f3,stroke:#db2777,stroke-width:2px,color:#1f2937

    class External,GH,Jira,SC,WH external
    class Platform,API,Gateway platform
    class Services,TS,JS,WS,IS services
    class Data,PG,S3,SSM data
    class Workers,Orchestrator,Compute,Docker,ECS,Lambda,Agent,A1,A2,A3,Ops,Git,FS,Code workers
    class SCM,GitHub scm
```

## Core Components

### Platform Backend (`apps/platform-backend`)

Express.js REST API that serves as the central coordination point.

**Responsibilities:**
- RESTful API for ticket, job, and project management
- Webhook ingestion and processing
- Job queue management
- Integration with external systems
- Secret management and encryption

**Key Services:**
- `TicketService`: CRUD operations for tickets
- `JobService`: Job lifecycle management
- `IntegrationService`: External system connectors
- `WebhookService`: Webhook processing and validation
- `SecretService`: Credential encryption/decryption
- `ClankerService`: Worker configuration and management

### Platform Frontend (`apps/platform-frontend`)

React SPA (Vite) for user interaction.

**Responsibilities:**
- Dashboard and project management UI
- Ticket creation and monitoring
- Job execution visualization
- Integration configuration
- Clanker management

**Key Features:**
- Real-time job progress updates
- Interactive ticket forms with media upload
- Integration-specific configuration pages
- Clanker health monitoring

### Viberator Worker (`apps/viberator`)

AI agent execution engine that processes jobs.

**Responsibilities:**
- Repository cloning and branch management
- AI agent harness execution
- Code analysis and modification
- Commit and pull request creation
- Progress reporting to platform

**Supported Agent Harnesses:**
- Claude Code (Anthropic)
- OpenAI Codex
- Gemini CLI (Google)
- Qwen CLI (Alibaba)
- Mistral Vibe
- OpenCode
- Kimi Code

### Infrastructure (`infra/`)

Pulumi-based infrastructure as code.

**Stacks:**
1. **Base**: VPC, KMS, CloudWatch logging
2. **Platform**: ECS, RDS, S3, Amplify
3. **Workers**: Lambda, ECS task definitions

## Data Flow

### Ticket Creation Flow

```mermaid
sequenceDiagram
    participant User as 👤 User
    participant Ext as 📡 External System
    participant WH as 🎣 Webhook Service
    participant API as 🏗️ Platform API
    participant DB as 💾 Database
    
    User->>Ext: Creates Issue/Ticket
    Ext->>WH: Webhook Delivery
    WH->>API: POST /webhooks
    API->>API: Verify Signature
    API->>DB: Create Ticket
    API->>DB: Queue Job (auto-execute)
    
    Note over API,DB: Ticket created in<br/>pending state
```

1. User creates issue in GitHub/Jira/Shortcut
2. Webhook delivered to platform
3. Signature verified, payload validated
4. Ticket created in database
5. If auto-execute enabled, job queued

### Job Execution Flow

```mermaid
sequenceDiagram
    participant Job as 💼 Job Service
    participant Orch as 🔧 Orchestrator
    participant Worker as 👷 Viberator Worker
    participant Git as 📦 Git Repository
    participant AI as 🤖 AI Agent
    participant PR as 📝 Pull Request
    
    Job->>Orch: Job Queued
    Orch->>Worker: Dispatch Job
    Worker->>Git: Clone Repository
    Worker->>Git: Create Fix Branch
    Worker->>AI: Execute Agent
    AI->>Git: Commit Changes
    Worker->>Git: Push Branch
    Worker->>PR: Create Pull Request
    Worker->>Job: Report Result
    Job->>Job: Mark Completed
    
    Note over Job,PR: PR linked to ticket
```

1. Job status: `queued`
2. Available Clanker picks up job
3. Worker clones repository
4. AI agent analyzes and modifies code
5. Changes committed and pushed
6. Pull request created
7. Job status: `completed`
8. Result posted back to external system

## Technology Stack

### Backend

| Technology | Purpose |
|------------|---------|
| Node.js 20+ | Runtime |
| Express.js | Web framework |
| TypeScript | Type safety |
| Kysely | Type-safe SQL query builder |
| PostgreSQL | Primary database |
| AWS SSM | Secret storage (production) |
| AWS S3 | File storage |

### Frontend

| Technology | Purpose |
|------------|---------|
| Vite 6 | Build tool and dev server |
| React 19 | UI library |
| TypeScript | Type safety |
| Tailwind CSS | Styling |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| Pulumi | Infrastructure as Code |
| AWS ECS | Container orchestration |
| AWS Lambda | Serverless compute |
| AWS RDS | Managed PostgreSQL |
| AWS CloudFront | CDN |

## Deployment Architecture

### Local Development

```mermaid
flowchart TB
    subgraph Docker["🐳 Docker Compose"]
        subgraph Services["Services"]
            PG[("PostgreSQL<br/>:5432")]
        end

        subgraph Apps["Applications"]
            Backend["Backend<br/>:8888"]
            Frontend["Frontend<br/>:3000"]
        end

        Services --> Apps
    end

    User["👤 Developer"] -->|"http://localhost:3000"| Frontend
    Frontend -->|"API calls"| Backend
    Backend --> PG
    
    classDef docker fill:#e0f2fe,stroke:#0284c7,stroke-width:2px,color:#1f2937
    classDef services fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#1f2937
    classDef apps fill:#ffedd5,stroke:#ea580c,stroke-width:2px,color:#1f2937
    classDef user fill:#f3e8ff,stroke:#9333ea,stroke-width:2px,color:#1f2937
    
    class Docker docker
    class Services,PG services
    class Apps,Backend,Frontend apps
    class User user
```

### Production (AWS)

```mermaid
flowchart TB
    subgraph AWS["☁️ AWS Cloud"]
        subgraph CDN["Content Delivery"]
            CF["CloudFront CDN"]
            Amplify["Amplify Hosting<br/>(Frontend)"]
        end
        
        subgraph Network["Network Layer"]
            ALB["Application Load Balancer"]
        end
        
        subgraph Compute["Compute Layer"]
            subgraph ECS["ECS Cluster"]
                Backend["Backend Service<br/>(Fargate Tasks)"]
            end
            Lambda["Lambda Functions<br/>(Workers)"]
        end
        
        subgraph Data["Data Layer"]
            RDS[("RDS PostgreSQL<br/>(Multi-AZ)")]
            S3[("S3 Buckets<br/>(Files, Media)")]
        end
        
        subgraph Security["Security & Ops"]
            SSM["SSM Parameter Store<br/>(Secrets)"]
            KMS["KMS (Encryption)"]
            CW["CloudWatch (Logging)"]
        end
    end
    
    User["👤 End User"] -->|"HTTPS"| CF
    CF --> Amplify
    Amplify -->|"API calls"| ALB
    ALB --> Backend
    Backend --> RDS
    Backend --> S3
    Backend --> SSM
    Backend -->|"Job Dispatch"| Lambda
    Lambda --> SSM
    Lambda -->|"Git ops"| ExternalGit["GitHub/GitLab"]
    
    classDef aws fill:#f0f9ff,stroke:#0369a1,stroke-width:2px,color:#1f2937
    classDef cdn fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#1f2937
    classDef network fill:#ffedd5,stroke:#ea580c,stroke-width:2px,color:#1f2937
    classDef compute fill:#fed7aa,stroke:#c2410c,stroke-width:2px,color:#1f2937
    classDef data fill:#fef9c3,stroke:#ca8a04,stroke-width:2px,color:#1f2937
    classDef security fill:#f3e8ff,stroke:#9333ea,stroke-width:2px,color:#1f2937
    classDef user fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#1f2937
    classDef external fill:#fce7f3,stroke:#db2777,stroke-width:2px,color:#1f2937
    
    class AWS aws
    class CDN,CF,Amplify cdn
    class Network,ALB network
    class Compute,ECS,Backend,Lambda compute
    class Data,RDS,S3 data
    class Security,SSM,KMS,CW security
    class User user
    class ExternalGit external
```

### Authentication & Authorization

- Tenant-based data isolation
- API authentication (configurable)
- Webhook signature verification (HMAC-SHA256)

### Data Protection

- **At Rest**: AES-256 encryption for secrets and credentials
- **In Transit**: TLS 1.3 for all communications
- **Key Management**: AWS KMS for encryption keys

### Network Security

- VPC isolation for production workloads
- Security groups for fine-grained access control
- Private subnets for database and workers

### Secret Management

- Local: Encrypted file storage (`.credentials.json`)
- Production: AWS SSM Parameter Store with KMS encryption
- Never logged or exposed in API responses

## Scalability Considerations

### Horizontal Scaling

- Stateless backend services scale with ECS auto-scaling
- Lambda workers scale automatically with job volume
- Read replicas for PostgreSQL under high read load

### Job Queue

- Multiple Clankers can process jobs concurrently
- Job prioritization and fair scheduling

### Rate Limiting

- API rate limiting per tenant
- External API rate limit handling with backoff
- Webhook delivery retry with exponential backoff

### Performance Targets

| Metric | Target |
|--------|--------|
| API Response Time (p95) | < 200ms |
| Webhook Processing | < 5 seconds |
| Job Queue Latency | < 10 seconds |
| Database Query Time (p95) | < 50ms |

## Monitoring & Observability

### Logging

- Structured JSON logging
- CloudWatch Logs aggregation
- Correlation IDs for request tracing

### Metrics

- API request rates and latencies
- Job execution times
- Worker health and utilization
- Database connection pool stats

### Alerting

- Worker failures and timeouts
- API error rate thresholds
- Database connection issues
- Queue depth monitoring

---

For more information, see:
- [README.md](../README.md) - Quick start and overview
- [CONTRIBUTING.md](../CONTRIBUTING.md) - Contribution guidelines
- [docs/DEPLOYMENT_SECRETS.md](DEPLOYMENT_SECRETS.md) - Deployment configuration
