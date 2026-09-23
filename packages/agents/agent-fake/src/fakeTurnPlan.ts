/**
 * Decides what a fake agent turn does, from the prompt alone.
 *
 * The prompt is the rendered platform template plus the human's task text, so
 * end-to-end tests steer the fake agent by putting directives in the task:
 *
 *   [fake:sleep=30]     wait 30 seconds before finishing (makes cancel testable)
 *   [fake:no-document]  finish without writing the phase document
 *   [fake:fail]         fail the turn with an error
 */

export type FakeDocumentFile = "RESEARCH.md" | "PLAN.md";

export interface FakeTurnPlan {
  documentFile?: FakeDocumentFile;
  sleepSeconds: number;
  fail: boolean;
}

const SLEEP_DIRECTIVE = /\[fake:sleep=(\d+)\]/;
const NO_DOCUMENT_DIRECTIVE = "[fake:no-document]";
const FAIL_DIRECTIVE = "[fake:fail]";

function resolveDocumentFile(prompt: string): FakeDocumentFile | undefined {
  // Planning prompts embed the approved research document, which can itself
  // mention RESEARCH.md, so PLAN.md must win.
  if (prompt.includes("PLAN.md")) return "PLAN.md";
  if (prompt.includes("RESEARCH.md")) return "RESEARCH.md";
  return undefined;
}

export function planFakeTurn(prompt: string): FakeTurnPlan {
  const sleepMatch = prompt.match(SLEEP_DIRECTIVE);
  return {
    documentFile: prompt.includes(NO_DOCUMENT_DIRECTIVE)
      ? undefined
      : resolveDocumentFile(prompt),
    sleepSeconds: sleepMatch ? Number(sleepMatch[1]) : 0,
    fail: prompt.includes(FAIL_DIRECTIVE),
  };
}

/**
 * The document echoes the prompt it was written from, so a test can assert
 * that a human message actually reached the agent.
 */
export function renderFakeDocument(
  documentFile: FakeDocumentFile,
  prompt: string,
): string {
  const title = documentFile === "PLAN.md" ? "Plan" : "Research";
  return [
    `# Fake ${title}`,
    "",
    "Written by the fake agent used in end-to-end tests.",
    "",
    "## Prompt received",
    "",
    "````text",
    prompt,
    "````",
    "",
  ].join("\n");
}
