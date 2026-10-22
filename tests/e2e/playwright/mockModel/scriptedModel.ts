import { randomUUID } from "crypto";
import type { MockConversation, MockMessage, MockReply, MockToolCall } from "./mockModelTypes";
import {
  askHumanTool,
  codeModeCall,
  deferredToolCall,
  isToolSearch,
  hasShell,
  isReadTool,
  readFileCall,
  shellCall,
  toolSearchCall,
  workingDirectoryIn,
  writeFileCall,
  type ToolCallShape,
} from "./mockTools";

/**
 * The mock model's behaviour, decided from the conversation alone so that a
 * harness that resumes its session sees the same model it started with.
 *
 * It does what the platform's prompt asks: writes the document its last
 * <what-to-do> names, with the harness's own tools, finding its working
 * directory and deferred tools the way a model would. Directives in people's
 * words (the task, or a message in the thread) steer it further:
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

/** The tool calls the model has made since the prompt, with what came back. */
interface TurnSoFar {
  calls: MockToolCall[];
  results: Map<string, string>;
}

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

function argumentStrings(call: MockToolCall): string[] {
  return Object.values(call.arguments).flat().filter((value): value is string => typeof value === "string");
}

function namesFile(call: MockToolCall, file: string): boolean {
  const names = new RegExp(`(^|/|')${file.replace(".", "\\.")}('|$)`, "m");
  return argumentStrings(call).some((value) => names.test(value));
}

/** A path argument naming the file, or a shell command writing it. */
export function writesFile(call: MockToolCall, file: string): boolean {
  return !isReadTool(call.name) && namesFile(call, file);
}

function readsFile(call: MockToolCall, file: string): boolean {
  return isReadTool(call.name) && namesFile(call, file);
}

export function asksHuman(call: MockToolCall): boolean {
  return [call.name, String(call.arguments.name ?? "")].some((name) => /ask_human$/.test(name)) || argumentStrings(call).some((value) => /ask_human\(/.test(value));
}

function isPwd(call: MockToolCall): boolean {
  return argumentStrings(call).includes("pwd");
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
    // A turn that starts cold gets the task again; the thread shows it was answered.
    if (!prompt.includes(`in-answer-to="${question}"`)) return [{ kind: "ask", question, options }];
  }
  const steps: Step[] = [];
  const document = documentAskedFor(prompt);
  if (document) steps.push({ kind: "write", file: document, content: documentContent(words, promptCount) });
  if (words.includes("[mock:code]")) steps.push({ kind: "write", file: MOCK_CHANGE_FILE, content: `Changed through the mock model on prompt ${promptCount}.\n` });
  return steps;
}

function isDone(step: Step, turn: TurnSoFar): boolean {
  return turn.calls.some((call) => (step.kind === "ask" ? asksHuman(call) : writesFile(call, step.file)));
}

function askCall(step: Extract<Step, { kind: "ask" }>, conversation: MockConversation, turn: TurnSoFar): ToolCallShape | string {
  const args = { question: step.question, options: step.options, blocking: true };
  const tool = askHumanTool(conversation.tools);
  if (tool) return { name: tool.name, arguments: args };
  const search = turn.calls.find((call) => isToolSearch(call.name));
  if (!search) return toolSearchCall(conversation.tools, "ask_human") ?? "The mock model found no ask_human tool to ask with.";
  const found = turn.results.get(search.id)?.match(/[\w.:-]*ask_human/)?.[0];
  if (!found) return "The mock model found no ask_human tool to ask with.";
  return deferredToolCall(conversation.tools, found, args) ?? codeModeCall(conversation.tools, found, args) ?? "The mock model found no way to call ask_human.";
}

function workingDirectory(conversation: MockConversation, turn: TurnSoFar): string | undefined {
  const said = workingDirectoryIn(conversation.messages.map((message) => ("text" in message ? message.text : "")).join("\n"));
  if (said) return said;
  const pwd = turn.calls.find(isPwd);
  return pwd ? turn.results.get(pwd.id)?.match(/\/[^\s'"\\]*/)?.[0] : undefined;
}

function writeCall(step: Extract<Step, { kind: "write" }>, conversation: MockConversation, turn: TurnSoFar): ToolCallShape | string {
  const directory = workingDirectory(conversation, turn);
  // Some harnesses take only absolute paths and don't say where they work, so the model asks the shell.
  if (!directory && hasShell(conversation.tools) && !turn.calls.some(isPwd)) return shellCall(conversation.tools, "pwd") ?? "";
  const filePath = directory ? `${directory}/${step.file}` : step.file;
  const read = turn.calls.some((call) => readsFile(call, step.file)) ? undefined : readFileCall(conversation.tools, filePath);
  if (read) return read;
  const call = writeFileCall(conversation.tools, filePath, step.content, directory);
  return call ?? `The mock model found no tool to write files with among: ${conversation.tools.map((tool) => tool.name).join(", ")}.`;
}

function finalText(steps: Step[]): string {
  if (steps[0]?.kind === "ask") return "Waiting on an answer from the mock model.";
  const files = steps.flatMap((step) => (step.kind === "write" ? [step.file] : []));
  return files.length > 0 ? `The mock model wrote ${files.join(" and ")}.` : "The mock model has nothing to change.";
}

function turnSoFar(sinceThePrompt: MockMessage[]): TurnSoFar {
  const calls = sinceThePrompt.flatMap((message) => (message.role === "assistant" ? message.toolCalls : []));
  const results = new Map<string, string>();
  for (const message of sinceThePrompt) if (message.role === "tool") results.set(message.callId, message.text);
  return { calls, results };
}

/** The turn ended with a reply, and the harness asks something of its own: a memory, a title, a suggestion. */
function isSideRequest(sinceThePrompt: MockMessage[]): boolean {
  const ended = sinceThePrompt.findIndex((message) => message.role === "assistant" && message.toolCalls.length === 0);
  return ended !== -1 && sinceThePrompt.slice(ended + 1).some((message) => message.role === "user");
}

/** A summary or compaction request: the harness offers its tools but says not to use them. */
function forbidsTools(messages: MockMessage[]): boolean {
  const last = messages.filter((message) => message.role === "user").at(-1);
  return last !== undefined && "text" in last && /do not (call|use) any tools/i.test(last.text);
}

const PLAIN_REPLY: MockReply = { kind: "message", text: "Mock reply", toolCalls: [], delayMs: 0 };

export function decideMockReply(conversation: MockConversation): MockReply {
  const { messages } = conversation;
  const promptIndex = messages.map(isPrompt).lastIndexOf(true);
  const sinceThePrompt = messages.slice(promptIndex + 1);
  if (promptIndex === -1 || conversation.tools.length === 0 || isSideRequest(sinceThePrompt) || forbidsTools(messages)) return PLAIN_REPLY;

  const prompt = messages[promptIndex];
  const promptText = "text" in prompt ? prompt.text : "";
  const words = peoplesWords(promptText);
  const firstReply = sinceThePrompt.every((message) => message.role !== "assistant");

  const fail = words.match(/\[mock:fail=(\d{3})\]/);
  if (fail && firstReply) return { kind: "error", status: Number(fail[1]), message: PROVIDER_ERRORS[fail[1]] ?? "The mock model failed the request." };

  const sleep = words.match(/\[mock:sleep=(\d+)\]/);
  const delayMs = sleep && firstReply ? Number(sleep[1]) * 1000 : 0;

  const steps = stepsFor(promptText, messages.filter(isPrompt).length);
  const turn = turnSoFar(sinceThePrompt);
  const step = steps.find((candidate) => !isDone(candidate, turn));
  if (!step) return { kind: "message", text: finalText(steps), toolCalls: [], delayMs };
  const call = step.kind === "ask" ? askCall(step, conversation, turn) : writeCall(step, conversation, turn);
  if (typeof call === "string") return { kind: "message", text: call, toolCalls: [], delayMs };
  return { kind: "message", text: "", toolCalls: [{ id: `call_${randomUUID()}`, ...call }], delayMs };
}
