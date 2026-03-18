export const RESEARCH_SYSTEM_PROMPT_KEY = "skills/research-system.md";
export const DEFAULT_RESEARCH_SYSTEM_PROMPT = `Create a research document for this ticket.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Analyze the repository and relevant code paths for this ticket.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Do not modify application code unless it is strictly necessary to produce RESEARCH.md.
- Write your output to RESEARCH.md in the repository root.

RESEARCH.md should include:
- Summary
- Relevant Code Areas
- Root Cause Analysis
- Constraints and Risks
- Recommended Next Steps`;

export const PLANNING_SYSTEM_PROMPT_KEY = "skills/planning-system.md";
export const DEFAULT_PLANNING_SYSTEM_PROMPT = `Create a planning document for this ticket based on the research findings.

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Analyze the research document to understand the problem.
- Create a detailed implementation plan.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Do not modify application code unless it is strictly necessary to produce PLAN.md.
- Write your output to PLAN.md in the repository root.

PLAN.md should include:
- Summary of the Problem
- Proposed Solution
- Implementation Steps
- Files to Modify
- Testing Strategy
- Risks and Mitigations`;
