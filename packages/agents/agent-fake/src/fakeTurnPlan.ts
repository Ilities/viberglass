/**
 * Decides what a fake agent turn does, from the prompt alone.
 *
 * End-to-end tests steer the fake agent with directives in what people write
 * (a message, or the task's description on its first turn):
 *
 *   [fake:sleep=30]     wait 30 seconds before finishing (makes cancel testable)
 *   [fake:sleep-after=30] write the document first, then wait 30 seconds (a stop keeps what it wrote)
 *   [fake:no-document]  finish without writing the document
 *   [fake:code]         change a file in the repository
 *   [fake:fail]         fail the turn with an error
 *   [fake:usage=N]      report N tokens in its context, of 200,000 (to cross the summarise threshold)
 *   [fake:ask=Q|A|B]    ask Q with ask_human, offering A and B, and stop until it's answered
 *   [fake:ask-later=Q]  ask Q without stopping, then carry on
 *   [fake:ask-of=WHO]   whom to ask: a role or a name (else the platform picks)
 *
 * A task turn's prompt (the `task_turn` template) says what to do in its last
 * <what-to-do> section; when that names no document, the agent writes the one
 * people asked for in the thread, if any.
 */

export type FakeDocumentFile = "RESEARCH.md" | "PLAN.md" | "SUMMARY.md";

export interface FakeQuestion {
  question: string;
  options: string[];
  addressee: string | null;
  blocking: boolean;
}

export interface FakeTurnPlan {
  documentFile?: FakeDocumentFile;
  code: boolean;
  sleepSeconds: number;
  /** Seconds to wait after writing, before finishing. */
  sleepAfterSeconds: number;
  fail: boolean;
  /** Tokens to report in the context, when asked to. */
  usageTokens: number | null;
  /** A question to ask a person with ask_human. */
  ask: FakeQuestion | null;
}

const SLEEP_DIRECTIVE = /\[fake:sleep=(\d+)\]/;
const SLEEP_AFTER_DIRECTIVE = /\[fake:sleep-after=(\d+)\]/;
const NO_DOCUMENT_DIRECTIVE = "[fake:no-document]";
const CODE_DIRECTIVE = "[fake:code]";
const FAIL_DIRECTIVE = "[fake:fail]";
const USAGE_DIRECTIVE = /\[fake:usage=(\d+)\]/;
const ASK_DIRECTIVE = /\[fake:ask(-later)?=([^\]]+)\]/;
const ASK_OF_DIRECTIVE = /\[fake:ask-of=([^\]]+)\]/;

function questionIn(words: string): FakeQuestion | null {
  const match = words.match(ASK_DIRECTIVE);
  if (!match) return null;
  const [question, ...options] = match[2].split("|").map((part) => part.trim());
  return { question, options: options.filter(Boolean), addressee: words.match(ASK_OF_DIRECTIVE)?.[1].trim() ?? null, blocking: !match[1] };
}

/** The last <tag>…</tag> section of the prompt, if it has one. */
function lastSection(prompt: string, tag: string): string | undefined {
  const start = prompt.lastIndexOf(`<${tag}>`);
  if (start === -1) return undefined;
  const end = prompt.indexOf(`</${tag}>`, start);
  return prompt.slice(start, end === -1 ? undefined : end);
}

function documentNamedIn(text: string): FakeDocumentFile | undefined {
  // A summary covers everything, and a plan can mention the research it builds on.
  if (text.includes("SUMMARY.md")) return "SUMMARY.md";
  if (text.includes("PLAN.md")) return "PLAN.md";
  if (text.includes("RESEARCH.md")) return "RESEARCH.md";
  return undefined;
}

/** Where people's words are: the new messages and, on a first turn, the task. Elsewhere is the platform's. */
function peoplesWords(prompt: string): string {
  if (!prompt.includes("<what-to-do>")) return prompt;
  return [lastSection(prompt, "thread"), lastSection(prompt, "task")].filter((part) => part !== undefined).join("\n");
}

function resolveDocumentFile(prompt: string): FakeDocumentFile | undefined {
  const asked = lastSection(prompt, "what-to-do");
  if (asked === undefined) return documentNamedIn(prompt);
  return documentNamedIn(asked) ?? documentNamedIn(lastSection(prompt, "thread") ?? "");
}

export function planFakeTurn(prompt: string): FakeTurnPlan {
  const words = peoplesWords(prompt);
  const sleepMatch = words.match(SLEEP_DIRECTIVE);
  const usageMatch = words.match(USAGE_DIRECTIVE);
  return {
    documentFile: words.includes(NO_DOCUMENT_DIRECTIVE) ? undefined : resolveDocumentFile(prompt),
    code: words.includes(CODE_DIRECTIVE),
    sleepSeconds: sleepMatch ? Number(sleepMatch[1]) : 0,
    sleepAfterSeconds: Number(words.match(SLEEP_AFTER_DIRECTIVE)?.[1] ?? 0),
    fail: words.includes(FAIL_DIRECTIVE),
    usageTokens: usageMatch ? Number(usageMatch[1]) : null,
    ask: questionIn(words),
  };
}

/**
 * The document echoes the prompt it was written from, so a test can assert
 * that a person's message reached the agent. The echo is defanged: a later
 * prompt that quotes this document must not read as directives or sections.
 */
export function renderFakeDocument(documentFile: FakeDocumentFile, prompt: string, turn: number): string {
  const title = documentFile === "PLAN.md" ? "Plan" : documentFile === "SUMMARY.md" ? "Summary" : "Research";
  const echo = prompt.replace(/\[fake:/g, "[fake-echo:").replace(/</g, "&lt;");
  return [
    `# Fake ${title}`,
    "",
    "Written by the fake agent used in end-to-end tests.",
    "",
    `This is turn ${turn} of its session.`,
    "",
    "## Prompt received",
    "",
    "````text",
    echo,
    "````",
    "",
  ].join("\n");
}
