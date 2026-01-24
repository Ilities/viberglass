# Roadmap: Viberglass

## Overview

Branding update milestone transforming the platform from "Viberator" to "Viberglass" while maintaining the "Viberator" name for worker/agent components. This is a find-and-replace operation across documentation, code, infrastructure, and repository naming—executed sequentially to maintain system stability.

## Milestones

- ✅ **v1.0 MVP** - Phases 1-12 (shipped 2026-01-23)
- 🚧 **v1.1 Branding Update** - Phases 13-16 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-12) - SHIPPED 2026-01-23</summary>

Complete brownfield integration project — agent orchestrator platform with end-to-end worker execution flow, multi-tenant security, webhook triggers, and CI/CD deployment infrastructure.

**95 plans delivered.** See MILESTONES.md for full details.

</details>

### 🚧 v1.1 Branding Update (In Progress)

**Milestone Goal:** Platform becomes "Viberglass," workers remain "Viberators"

#### Phase 13: Documentation Branding
**Goal**: All documentation reflects the new Viberglass platform name
**Depends on**: Phase 12 (v1.0 complete)
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05, DOCS-06
**Success Criteria** (what must be TRUE):
  1. PROJECT.md header displays "# Viberglass" not "# Viberator"
  2. README.md introduces the platform as "Viberglass" with workers called "Viberators"
  3. Package.json name field shows "viberglass" and description references Viberglass
  4. Code comments referring to the platform say "Viberglass" not "Viberator"
  5. MILESTONES.md v1.1+ entries use new branding terminology
**Plans**: 4 plans

Plans:
- [x] 13-01-PLAN.md — Update project documentation (PROJECT.md, README.md, MILESTONES.md)
- [x] 13-02-PLAN.md — Update package.json metadata (name, description)
- [x] 13-03-PLAN.md — Update inline code comments with platform references
- [x] 13-04-PLAN.md — Gap closure: packages/types JSDoc comments

#### Phase 14: Code and UI Branding
**Goal**: Application code and UI display correct branding
**Depends on**: Phase 13
**Requirements**: CODE-01, CODE-02, CODE-03, CODE-04, CODE-05, CODE-06
**Success Criteria** (what must be TRUE):
  1. Frontend UI shows "Viberglass" as the platform name in headers/titles
  2. Frontend UI shows "Viberators" when referencing workers/agents
  3. API responses use "Viberglass" for platform references
  4. Environment variables use VIBERGLASS_ prefix instead of VIBERATOR_
  5. Worker classes retain "Viberator" in their names (BaseAgent, etc.)
**Plans**: 5 plans

Plans:
- [x] 14-01-PLAN.md — Update frontend UI metadata and logo (Viberglass platform name)
- [x] 14-02-PLAN.md — Update API webhook User-Agent headers (Viberglass-Webhook)
- [x] 14-03-PLAN.md — Update UI text for worker references (Viberators terminology)
- [x] 14-04-PLAN.md — Update backend and infrastructure README branding
- [x] 14-05-PLAN.md — Verify CODE-04 and CODE-05 requirements (documentation)

#### Phase 15: Infrastructure Renaming
**Goal**: AWS infrastructure resources use viberglass naming
**Depends on**: Phase 14 (code changes including env vars)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, INFRA-07
**Success Criteria** (what must be TRUE):
  1. Amplify app is named "viberglass" in AWS and Pulumi code
  2. Pulumi stack names use "viberglass-{environment}" format
  3. CloudWatch log groups use /viberglass/ prefix
  4. SSM parameter paths use /viberglass/ prefix
  5. ECS task definitions and Lambda functions use "viberglass" naming
  6. RDS instances use "viberglass" identifier prefix
**Plans**: TBD

Plans:
- [ ] 15-01: Update Pulumi stack names and Amplify app configuration
- [ ] 15-02: Update CloudWatch and SSM resource naming
- [ ] 15-03: Update ECS, Lambda, and RDS resource naming
- [ ] 15-04: Deploy infrastructure changes to each environment

#### Phase 16: Repository Migration
**Goal**: GitHub repository renamed with all references updated
**Depends on**: Phase 15 (infrastructure deployed and stable)
**Requirements**: REPO-01, REPO-02, REPO-03
**Success Criteria** (what must be TRUE):
  1. GitHub repository is renamed from "viberator" to "viberglass"
  2. CI/CD workflows reference the new repository name
  3. All path-sensitive configurations work with new repository name
**Plans**: TBD

Plans:
- [ ] 16-01: Update CI/CD workflows with new repository name
- [ ] 16-02: Rename GitHub repository from viberator to viberglass
- [ ] 16-03: Verify all integrations work post-rename

## Progress

**Execution Order:**
Phases execute in numeric order: 13 → 14 → 15 → 16

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-12 | v1.0 | 95/95 | Complete | 2026-01-23 |
| 13. Documentation Branding | v1.1 | 4/4 | Complete | 2026-01-24 |
| 14. Code and UI Branding | v1.1 | 5/5 | Complete | 2026-01-24 |
| 15. Infrastructure Renaming | v1.1 | 0/4 | Not started | - |
| 16. Repository Migration | v1.1 | 0/3 | Not started | - |

**Overall Progress:** [███░░░░░░░] 22.22% (104/117 plans complete)
