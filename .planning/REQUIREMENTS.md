# Requirements: Viberator v1.1 Branding Update

**Defined:** 2026-01-24
**Core Value:** Users can create tickets that coding agents automatically fix, with the entire flow—ticket creation, agent execution, PR creation, and status updates—working end-to-end.

## v1.1 Requirements

Branding update: Platform becomes "Viberglass", workers remain "Viberators."

### Documentation (DOCS)

- [ ] **DOCS-01**: PROJECT.md header updated from "# Viberator" to "# Viberglass"
- [ ] **DOCS-02**: README.md updated with new platform name (Viberglass) and worker name (Viberators)
- [ ] **DOCS-03**: Package.json `name` field updated to "viberglass"
- [ ] **DOCS-04**: Package.json `description` field references Viberglass platform
- [ ] **DOCS-05**: All inline code comments referring to platform updated to "Viberglass"
- [ ] **DOCS-06**: MILESTONES.md updated with new branding for v1.1+ entries

### Code References (CODE)

- [ ] **CODE-01**: Frontend UI text displays "Viberglass" for platform name
- [ ] **CODE-02**: Frontend UI text displays "Viberators" for worker/agent references
- [ ] **CODE-03**: API response labels use "Viberglass" for platform references
- [ ] **CODE-04**: TypeScript class names for platform components updated if needed
- [ ] **CODE-05**: Environment variable prefixes updated (VIBEGLASS_*)
- [ ] **CODE-06**: Worker code retains "Viberator" naming for agent executor classes

### Infrastructure (INFRA)

- [ ] **INFRA-01**: Amplify app name changed from "viberator" to "viberglass"
- [ ] **INFRA-02**: Pulumi stack name updated to "viberglass-{environment}"
- [ ] **INFRA-03**: CloudWatch log groups use "viberglass" prefix
- [ ] **INFRA-04**: SSM parameter paths use /viberglass/ prefix
- [ ] **INFRA-05**: ECS task definitions use "viberglass" family name
- [ ] **INFRA-06**: Lambda function names use "viberglass" prefix
- [ ] **INFRA-07**: RDS instance identifiers use "viberglass" prefix

### Repository (REPO)

- [ ] **REPO-01**: GitHub repository renamed from "viberator" to "viberglass"
- [ ] **REPO-02**: Root directory references updated in any path-sensitive configs
- [ ] **REPO-03**: CI/CD workflows updated with new repository name references

## v2+ Requirements

Deferred to future milestone. Tracked but not in current roadmap.

(None — all branding in v1.1)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Worker renaming | Workers must stay called "Viberators" — this is the brand split |
| Database migration | No data schema changes needed for naming update |
| API endpoint paths | Endpoint paths can remain /api/v1/ — no breaking changes |
| Breaking changes to integrators | External integrators see no functional change |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DOCS-01 | Phase 13 | Pending |
| DOCS-02 | Phase 13 | Pending |
| DOCS-03 | Phase 13 | Pending |
| DOCS-04 | Phase 13 | Pending |
| DOCS-05 | Phase 13 | Pending |
| DOCS-06 | Phase 13 | Pending |
| CODE-01 | Phase 14 | Pending |
| CODE-02 | Phase 14 | Pending |
| CODE-03 | Phase 14 | Pending |
| CODE-04 | Phase 14 | Pending |
| CODE-05 | Phase 14 | Pending |
| CODE-06 | Phase 14 | Pending |
| INFRA-01 | Phase 15 | Pending |
| INFRA-02 | Phase 15 | Pending |
| INFRA-03 | Phase 15 | Pending |
| INFRA-04 | Phase 15 | Pending |
| INFRA-05 | Phase 15 | Pending |
| INFRA-06 | Phase 15 | Pending |
| INFRA-07 | Phase 15 | Pending |
| REPO-01 | Phase 16 | Pending |
| REPO-02 | Phase 16 | Pending |
| REPO-03 | Phase 16 | Pending |

**Coverage:**
- v1.1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-24*
*Last updated: 2026-01-24 after initial definition*
