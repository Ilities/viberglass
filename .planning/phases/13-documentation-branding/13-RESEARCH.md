# Phase 13: Documentation Branding - Research

**Researched:** 2026-01-24
**Domain:** Documentation and metadata find-and-replace with context-sensitive pattern matching
**Confidence:** HIGH

## Summary

Phase 13 is a documentation-focused branding update that changes platform references from "Viberator" to "Viberglass" while preserving "Viberator" for worker/agent components. This is a text substitution operation across markdown files, package.json metadata, and code comments requiring context-aware pattern matching rather than global find-and-replace.

**Key findings:**
- **54 files** contain "Viberator" references spanning documentation, code comments, and configuration
- **Context-sensitive distinction required**: "The Viberator" (platform) vs "a Viberator"/"Viberators" (workers)
- **3 main documentation targets**: PROJECT.md header, README.md introduction, package.json name/description
- **Code comments**: ~20+ inline comments reference the platform across infrastructure and backend code
- **MILESTONES.md**: Only v1.1+ entries need updates; v1.0 content remains as historical record

**Primary recommendation:** Use manual Edit tool operations with context-specific old_string patterns rather than automated find-and-replace to avoid breaking worker references. Process files sequentially: documentation first, then package.json, then code comments, with verification after each file.

## Standard Stack

This phase uses standard text editing tools — no external libraries required.

### Core
| Tool/Method | Purpose | Why Standard |
|------------|---------|--------------|
| Edit tool (Claude Code) | Precise string replacement with context | Preserves surrounding content, handles exact matches |
| Grep tool | Pattern discovery before replacement | Identify all occurrences, understand context |
| Manual review | Context-sensitive judgment | Distinguish platform vs worker references |

### No External Dependencies
Text substitution operates on existing files using built-in tools. No npm packages or external utilities needed.

## Architecture Patterns

### Recommended File Processing Order

```
1. Root Documentation (PROJECT.md, README.md)
2. Milestones Documentation (MILESTONES.md)
3. Package Metadata (package.json)
4. Documentation Files (docs/*.md)
5. Planning Documentation (.planning/**/*.md)
6. Code Comments (*.ts, *.tsx)
```

**Rationale:** Sequential processing prevents cascading errors. High-visibility files (PROJECT.md, README.md) establish patterns for subsequent changes.

### Pattern 1: Platform vs Worker Reference Detection

**What:** Linguistic pattern matching to distinguish platform references from worker references

**When to use:** Every occurrence of "Viberator" requires context analysis

**Decision rules:**
```
PLATFORM REFERENCES (change to "Viberglass"):
- "The Viberator" → "Viberglass"
- "Viberator platform" → "Viberglass platform"
- "# Viberator" (header) → "# Viberglass"
- "Viberator monorepo" → "Viberglass monorepo"

WORKER REFERENCES (keep as "Viberator"):
- "a Viberator" → "a Viberator" (worker instance)
- "Viberators" → "Viberators" (plural workers)
- "Viberator worker" → "Viberator worker" (component type)
- "viberator/app" directory → stays unchanged (path reference)
```

**Example:**
```typescript
// BEFORE (infrastructure/index.ts:19-22):
/**
 * Viberator Infrastructure Stack
 *
 * This stack creates the AWS infrastructure for running Viberator workers:
 */

// AFTER:
/**
 * Viberglass Infrastructure Stack
 *
 * This stack creates the AWS infrastructure for running Viberator workers:
 */
```

### Pattern 2: Package.json Updates

**What:** Update package.json metadata fields while preserving workspace paths

**When to use:** Root package.json only

**Example:**
```json
// BEFORE:
{
  "name": "viberator-monorepo",
  "description": "Viberator monorepo - AI Agent Orchestrator and Platform"
}

// AFTER:
{
  "name": "viberglass-monorepo",
  "description": "Viberglass monorepo - AI Agent Orchestrator and Platform"
}
```

**Constraint:** Workspace paths must stay unchanged:
```json
"workspaces": [
  "viberator/app",        // STAYS - directory name
  "viberator/infrastructure/infra"  // STAYS - directory name
]
```

### Pattern 3: MILESTONES.md Conditional Updates

**What:** Update v1.1+ milestone entries while preserving v1.0 historical content

**When to use:** Only entries dated after v1.1 milestone start

**Example:**
```markdown
## v1.0 MVP (Shipped: 2026-01-23)
**Delivered:** Complete Viberator platform...  // STAYS - historical

## v1.1 Branding Update (In Progress)
**Goal:** Platform becomes "Viberglass"  // UPDATED - current work
```

### Anti-Patterns to Avoid

- **Global find-and-replace**: Will break worker references like "a Viberator" and "Viberators"
- **Automated regex without review**: Context requires human judgment for edge cases
- **Changing directory names**: Paths like `viberator/app` are code references, not branding
- **Updating node_modules**: Ignore dependency directories completely
- **Rewriting for style sake**: Only fix awkward phrasing from name changes, don't polish existing prose

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pattern matching | Custom regex scripts | Manual Edit tool with context | Linguistic ambiguity requires human judgment |
| Batch processing | Shell script loops | Sequential file-by-file edits | Prevents cascading errors, enables verification |
| Context detection | NLP/ML classifiers | Human review of each occurrence | Small scope (54 files), accuracy over automation |

**Key insight:** The scope is small enough (54 files) that manual precision is faster than building and debugging automation. Context-sensitive linguistic patterns are difficult to encode in rules.

## Common Pitfalls

### Pitfall 1: False Positive Platform Detection

**What goes wrong:** Worker references like "Viberator worker" get changed to "Viberglass worker," breaking the platform/worker distinction.

**Why it happens:** Naive pattern matching treats all "Viberator" instances as platform references.

**How to avoid:**
1. Read surrounding sentences for context
2. Look for worker keywords: "worker", "agent", "executor", "container"
3. Check if preceded by "a" or plural "Viberators"
4. Preserve worker component class names (BaseAgent, ViberatorWorker)

**Warning signs:** Edits that change "Viberator worker" or "Viberators" (plural) — these should stay as-is.

### Pitfall 2: Breaking Path References

**What goes wrong:** Directory paths like `viberator/app` get changed to `viberglass/app`, breaking imports and workspace references.

**Why it happens:** Treating all "viberator" strings as branding references.

**How to avoid:**
1. Never change paths in import statements
2. Never change workspace paths in package.json
3. Preserve directory names in documentation code examples
4. Keep infrastructure resource names (Phase 15 handles those)

**Warning signs:** Edits within `import` statements, `workspaces` arrays, or path-like strings.

### Pitfall 3: Inconsistent Terminology After Updates

**What goes wrong:** Some files use "Viberglass," others still use "Viberator," creating confusion.

**Why it happens:** Missing files or incomplete replacements across the codebase.

**How to avoid:**
1. Grep for remaining "Viberator" references after completing all edits
2. Verify each requirement (DOCS-01 through DOCS-06) explicitly
3. Check success criteria after completion
4. Run git diff to review all changes before committing

**Warning signs:** Grep still finds "# Viberator" headers or "the Viberator platform" after completion.

### Pitfall 4: Over-Rewriting Documentation

**What goes wrong:** Using branding update as excuse to rewrite prose, creating scope creep.

**Why it happens:** Ambiguous "fix awkward phrasing" instruction in context.

**How to avoid:**
1. Only rework sentences that become grammatically incorrect after substitution
2. Preserve existing documentation voice and style
3. Don't improve prose that was already fine
4. Focus on mechanical substitution, not content improvement

**Warning signs:** Edits that change sentence structure beyond the minimal fix.

### Pitfall 5: Historical Record Corruption

**What goes wrong:** Updating v1.0 milestone content to use "Viberglass," erasing historical accuracy.

**Why it happens:** Applying global changes without temporal context.

**How to avoid:**
1. Only update MILESTONES.md entries for v1.1+
2. Preserve v1.0 content as "Viberator" (historical accuracy)
3. Update milestone headers only if they reference current work
4. Keep v1.0 ROADMAP.md unchanged

**Warning signs:** Editing the "v1.0 MVP (Shipped: 2026-01-23)" section content.

## Code Examples

### Example 1: Documentation Header Update

```typescript
// FILE: /home/jussi/Development/viberator/.planning/PROJECT.md

// BEFORE:
# Viberator

// AFTER:
# Viberglass
```

### Example 2: README Introduction with Platform/Worker Distinction

```typescript
// FILE: /home/jussi/Development/viberator/README.md

// BEFORE:
# Viberator

Agent Orchestrator and Ticket Management Platform. Users create bug tickets that coding agents automatically fix...

// AFTER:
# Viberglass

Agent Orchestrator and Ticket Management Platform. Users create bug tickets that coding agents (called Viberators) automatically fix...
```

### Example 3: Code Comment Context-Sensitive Update

```typescript
// FILE: /home/jussi/Development/viberator/infrastructure/index.ts

// BEFORE:
/**
 * Viberator Infrastructure Stack
 *
 * This stack creates the AWS infrastructure for running Viberator workers:
 * - ECR repository for container images
 * - SQS queue for job processing with DLQ
 */

// AFTER:
/**
 * Viberglass Infrastructure Stack
 *
 * This stack creates the AWS infrastructure for running Viberator workers:
 * - ECR repository for container images
 * - SQS queue for job processing with DLQ
 */
```

**Note:** "Viberator workers" stays unchanged because it refers to worker components.

### Example 4: Package Metadata Update

```typescript
// FILE: /home/jussi/Development/viberator/package.json

// BEFORE:
{
  "name": "viberator-monorepo",
  "version": "1.0.0",
  "private": true,
  "description": "Viberator monorepo - AI Agent Orchestrator and Platform"
}

// AFTER:
{
  "name": "viberglass-monorepo",
  "version": "1.0.0",
  "private": true,
  "description": "Viberglass monorepo - AI Agent Orchestrator and Platform"
}

// WORKSPACES STAY UNCHANGED:
"workspaces": [
  "viberator/app",              // Directory name, not branding
  "viberator/infrastructure/infra"
]
```

### Example 5: Infrastructure Comment Update

```typescript
// FILE: /home/jussi/Development/viberator/infrastructure/index.ts

// BEFORE:
// Create VPC with public/private subnets, NAT gateways, and security groups
const vpc: VpcOutputs = createVpc(`${config.environment}-viberator`, {
  environment: config.environment,
  singleNatGateway: config.singleNatGateway ?? true,
});

// AFTER:
// Create VPC with public/private subnets, NAT gateways, and security groups
const vpc: VpcOutputs = createVpc(`${config.environment}-viberglass`, {
  environment: config.environment,
  singleNatGateway: config.singleNatGateway ?? true,
});
```

**Note:** This is a resource name, which should technically be Phase 15, but updating comments now aligns documentation with infrastructure changes coming later.

### Example 6: MILESTONES.md Conditional Update

```typescript
// FILE: /home/jussi/Development/viberator/.planning/MILESTONES.md

// BEFORE:
# Project Milestones: Viberator

## v1.0 MVP (Shipped: 2026-01-23)
**Delivered:** Complete Viberator platform...

## v1.1 Branding Update (In Progress)

// AFTER:
# Project Milestones: Viberglass

## v1.0 MVP (Shipped: 2026-01-23)
**Delivered:** Complete Viberator platform...  // STAYS - historical

## v1.1 Branding Update (In Progress)
**Goal:** Platform becomes "Viberglass"  // UPDATED - current work
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Global find-and-replace | Context-sensitive manual editing | Always been best practice | Prevents false positives |
| Automated regex scripts | Human judgment per occurrence | Always been best practice | Handles linguistic ambiguity |
| Batch file processing | Sequential file-by-file edits | Always been best practice | Enables verification, prevents errors |

**No fundamental changes:** Text substitution remains a manual process for branding updates. Automation tools risk accuracy for small scopes.

**Deprecated/outdated:**
- **Global regex replacement**: Risk of breaking references outweighs time savings
- **Blind batch operations**: Modern tooling (Edit tool) makes context-aware edits trivial

## Open Questions

None. The research phase fully resolved the implementation approach:

1. **File scope identified**: 54 files with "Viberator" references
2. **Pattern detection clarified**: Linguistic rules for platform vs worker distinction
3. **Processing order established**: Documentation → package.json → code comments
4. **Verification approach defined**: Grep for remaining patterns, check success criteria

## Verification Strategy

After completing all edits, verify success criteria:

```bash
# 1. Check PROJECT.md header
head -1 /home/jussi/Development/viberator/.planning/PROJECT.md
# Expected: # Viberglass

# 2. Check README.md introduction
head -5 /home/jussi/Development/viberator/README.md
# Expected: "# Viberglass" with "Viberators" mentioned as workers

# 3. Check package.json metadata
grep -E '"name"|"description"' /home/jussi/Development/viberator/package.json
# Expected: "viberglass-monorepo" and "Viberglass monorepo"

# 4. Check code comments for platform references
rg '///.*Viberglass|// .*Viberglass|/\*.*Viberglass' /home/jussi/Development/viberator --type ts --type tsx | head -10

# 5. Verify no missed platform references
rg '# Viberator|the Viberator platform' /home/jussi/Development/viberator --type md
# Should return: v1.0 historical entries only
```

**Success criteria validation:**
- [ ] DOCS-01: PROJECT.md header is "# Viberglass"
- [ ] DOCS-02: README.md introduces "Viberglass" platform with "Viberators" workers
- [ ] DOCS-03: package.json name is "viberglass-monorepo"
- [ ] DOCS-04: package.json description references "Viberglass platform"
- [ ] DOCS-05: Code comments say "Viberglass" not "Viberator" for platform
- [ ] DOCS-06: MILESTONES.md v1.1+ entries use new branding

## Sources

### Primary (HIGH confidence)

**CONTEXT.md constraints**
- Phase 13 context document defining terminology scope and approach
- Location: `/home/jussi/Development/viberator/.planning/phases/13-documentation-branding/13-CONTEXT.md`
- Defines: Context-sensitive replacement rules, platform vs worker distinction

**REQUIREMENTS.md**
- Phase 13 requirements (DOCS-01 through DOCS-06)
- Location: `/home/jussi/Development/viberator/.planning/REQUIREMENTS.md`
- Defines: Success criteria for documentation updates

**Codebase analysis**
- Grep results showing 54 files with "Viberator" references
- Pattern analysis of infrastructure, backend, and documentation files
- Verified actual file states and context patterns

### Secondary (MEDIUM confidence)

**Microsoft Style Guide**
- [Top 10 tips for Microsoft style and voice](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice)
- Supports: Maintaining consistent voice during documentation updates
- Relevance: General documentation best practices

**Text replacement research**
- Academic research on [Context-sensitive parsing for programming languages](https://www.sciencedirect.com/science/article/pii/S2590118422000697)
- Supports: Complexity of context-aware pattern matching
- Relevance: Validates manual approach over automation

### Tertiary (LOW confidence)

**General branding resources**
- [Branding 2026: fundamental changes](https://medium.com/outcrowd/branding-2026-fundamental-changes-c32e4e38ff8c)
- [What Is Brand Refresh? Complete 2026 Strategy Guide](https://celerart.com/blog/what-is-brand-refresh)
- Relevance: Context for why branding updates matter, not specific to implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No external dependencies required, basic text editing
- Architecture: HIGH - Sequential file processing with context-aware patterns is well-established
- Pitfalls: HIGH - All failure modes identified from codebase analysis and documented

**Research date:** 2026-01-24
**Valid until:** 30 days (2026-02-23) — Text substitution patterns are stable, no fast-moving changes expected

---

*Phase: 13-documentation-branding*
*Research completed: 2026-01-24*
