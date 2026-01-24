# Phase 13: Documentation Branding - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

## Phase Boundary

Update all documentation to reflect "Viberglass" as the platform name while keeping "Viberator" for worker/agent components. Success criteria: PROJECT.md, README.md, package.json, and inline code comments all use correct terminology.

## Implementation Decisions

### Terminology scope
- **Context-sensitive replacement**: Not a global find-and-replace—context determines whether "Viberator" refers to platform or workers
- **Linguistic pattern detection**: Use language patterns to distinguish platform from worker references
- **Primary signal**: "The Viberator" = platform → becomes "Viberglass"
- **Worker references**: "a Viberator", "Viberators" = workers/agents → stay as "Viberator"
- **Approach**: Guidelines + judgment rather than an exhaustive pattern list

### Content rewrites
- **Scope**: Fix awkward phrasing that results from name changes
- **Constraint**: Don't rewrite for the sake of rewriting—only smooth what breaks
- **Tone**: Maintain current documentation voice/voice consistency

### Claude's Discretion
- Exact linguistic patterns for edge cases
- What counts as "awkward" phrasing needing rework
- Tone consistency during minor rewrites

## Specific Ideas

None — standard find-and-replace with context awareness

## Deferred Ideas

None — discussion stayed within phase scope

---

*Phase: 13-documentation-branding*
*Context gathered: 2026-01-24*
