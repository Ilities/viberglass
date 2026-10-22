import { randomUUID } from "crypto";
import type { MockConversation, MockMessage, MockReply, MockToolCall } from "./mockModelTypes";
import { askHumanTool, workingDirectoryIn, writeFileCall } from "./mockTools";

/**
 * The mock model's behaviour, decided from the conversation alone so that a
 * harness that resumes its session sees the same model it started with.
 *
 * It does what the platform's prompt asks: writes the document its last
 * <what-to-do> names, with the harness's own write tool. Directives in
 * people's words (the task, or a message in the thread) steer it further:
 *
 *   [mock:ask=Q|A|B]  ask Q with ask_human, offering A and B, and end the turn
 *   [mock:code]       write mock-change.txt
 *   [mock:sleep=N]    wait N seconds before the turn's first reply
 *   [mock:fail=N]     answer the turn's first request with HTTP status N
 */

/** Every task turn's prompt has this section; harness-injected user messages don't. */
const PROMPT_MARK = "<what-to-do>";
export const MOCK_CHANGE_FILE = "mock-change.txt";
export const MOCK_DOCUMENT_HEADING = "# Mock Plan";

/** What real providers say, since some harnesses pass on only the message, not the status. */
const PROVIDER_ERRORS: Record<string, string> = {
  "401": "Incorrect API key provided.",
  "429": "Rate limit reached for requests.",
  "500": "The server had an error while processing your request.",
};

type Step =
  | { kind: "ask"; question: string; options: string[] }
  | { kind: "write"; file: string; content: string };

function lastSection(text: string, tag: string): string | undefined {
  const start = text.lastIndexOf(`<${tag}>`);
  if (start === -1) return undefined;
  const end = text.indexOf(`</${tag}>`, start);
  return text.slice(start + tag.length + 2, end === -1 ? undefined : end);
}

function peoplesWords(prompt: string): string {
  return [lastSection(prompt, "thread"), lastSection(prompt, "task")].filter((part) => part !== undefined).join("\n");
}

function documentAskedFor(prompt: string): string | undefined {
  const asked = [lastSection(prompt, "what-to-do"), lastSection(prompt, "thread")].join("\n");
  if (asked.includes("SUMMARY.md")) return "SUMMARY.md";
  if (asked.includes("PLAN.md")) return "PLAN.md";
  return undefined;
}

function isPrompt(message: MockMessage): boolean {
  return message.role === "user" && message.text.includes(PROMPT_MARK);
}

function allText(conversation: MockConversation): string {
  return conversation.messages.map((message) => ("text" in message ? message.text : "")).join("\n");
}

function documentContent(words: string, promptCount: number): string {
  // Defanged, so a later prompt quoting this document doesn't read as directives.
  const echo = words.replace(/\[mock:/g, "[mock-echo:").replace(/</g, "&lt;");
  return [MOCK_DOCUMENT_HEADING, "", `This is prompt ${promptCount} of the conversation.`, "", "## People's words", "", echo, ""].join("\n");
}

function stepsFor(prompt: string, promptCount: number): Step[] {
  const words = peoplesWords(prompt);
  const ask = words.match(/\[mock:ask=([^\]]+)\]/);
  if (ask) {
    const [question, ...options] = ask[1].split("|").map((part) => part.trim());
    return [{ kind: "ask", question, options }];
  }
  const steps: Step[] = [];
  const document = documentAskedFor(prompt);
  if (document) steps.push({ kind: "write", file: document, content: documentContent(words, promptCount) });
  if (words.includes("[mock:code]")) steps.push({ kind: "write", file: MOCK_CHANGE_FILE, content: `Changed through the mock model on prompt ${promptCount}.\n` });
  return steps;
}

function toolCallFor(step: Step, conversation: MockConversation): MockToolCall | string {
  if (step.kind === "ask") {
    const tool = askHumanTool(conversation.tools);
    if (!tool) return "The mock model found no ask_human tool to ask with.";
    return { id: `call_${randomUUID()}`, name: tool.name, arguments: { question: step.question, options: step.options, blocking: true } };
  }
  const directory = workingDirectoryIn(allText(conversation));
  const filePath = directory ? `${directory}/${step.file}` : step.file;
  const call = writeFileCall(conversation.tools, filePath, step.content);
  if (!call) return `The mock model found no tool to write files with among: ${conversation.tools.map((tool) => tool.name).join(", ")}.`;
  return { id: `call_${randomUUID()}`, ...call };
}

function finalText(steps: Step[]): string {
  if (steps[0]?.kind === "ask") return "Waiting on an answer from the mock model.";
  const files = steps.flatMap((step) => (step.kind === "write" ? [step.file] : []));
  return files.length > 0 ? `The mock model wrote ${files.join(" and ")}.` : "The mock model has nothing to change.";
}

export function decideMockReply(conversation: MockConversation): MockReply {
  const { messages } = conversation;
  const promptIndex = messages.map(isPrompt).lastIndexOf(true);
  // Titles, summaries and other side requests the harness makes on its own.
  if (promptIndex === -1 || conversation.tools.length === 0) {
    return { kind: "message", text: "Mock reply", toolCalls: [], delayMs: 0 };
  }

  const prompt = messages[promptIndex];
  const promptText = "text" in prompt ? prompt.text : "";
  const words = peoplesWords(promptText);
  const sinceThePrompt = messages.slice(promptIndex + 1);
  const callsMade = sinceThePrompt.reduce((count, message) => count + (message.role === "assistant" ? message.toolCalls.length : 0), 0);
  const firstReply = sinceThePrompt.every((message) => message.role !== "assistant");

  const fail = words.match(/\[mock:fail=(\d{3})\]/);
  if (fail && firstReply) return { kind: "error", status: Number(fail[1]), message: PROVIDER_ERRORS[fail[1]] ?? "The mock model failed the request." };

  const sleep = words.match(/\[mock:sleep=(\d+)\]/);
  const delayMs = sleep && firstReply ? Number(sleep[1]) * 1000 : 0;

  const steps = stepsFor(promptText, messages.filter(isPrompt).length);
  const step = steps[callsMade];
  if (!step) return { kind: "message", text: finalText(steps), toolCalls: [], delayMs };
  const call = toolCallFor(step, conversation);
  if (typeof call === "string") return { kind: "message", text: call, toolCalls: [], delayMs };
  return { kind: "message", text: "", toolCalls: [call], delayMs };
}
