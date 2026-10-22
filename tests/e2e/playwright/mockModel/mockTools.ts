import type { MockTool } from "./mockModelTypes";

export type ToolCallShape = { name: string; arguments: Record<string, unknown> };

const WRITE_TOOL_NAMES = /^(write|write_file|create_file)$/i;
const READ_TOOL_NAMES = /^(read|read_file|view)$/i;
const PATH_KEYS = ["filePath", "file_path", "path", "absolute_path", "filename"];
const CONTENT_KEYS = ["content", "contents", "file_text", "text"];

function propertyNames(tool: MockTool): string[] {
  return Object.keys(tool.parameters.properties ?? {});
}

function firstKey(tool: MockTool, candidates: string[]): string | undefined {
  const names = propertyNames(tool);
  return candidates.find((key) => names.includes(key));
}

function shellTool(tools: MockTool[]): MockTool | undefined {
  return tools.find((tool) => propertyNames(tool).some((key) => key === "command" || key === "cmd"));
}

/** A call to the harness's shell tool, in whichever argument shape it takes. */
export function shellCall(tools: MockTool[], script: string, directory?: string): ToolCallShape | undefined {
  const tool = shellTool(tools);
  if (!tool) return undefined;
  const properties = tool.parameters.properties ?? {};
  const args: Record<string, unknown> = properties.cmd
    ? { cmd: script }
    : { command: properties.command?.type === "array" ? ["bash", "-lc", script] : script };
  if (directory && properties.workdir) args.workdir = directory;
  return { name: tool.name, arguments: args };
}

/**
 * A call that writes a file with the harness's own tools, whatever it names
 * them and their arguments, or with its shell when it has no write tool.
 */
export function writeFileCall(tools: MockTool[], filePath: string, content: string, directory?: string): ToolCallShape | undefined {
  const candidates = [...tools.filter((tool) => WRITE_TOOL_NAMES.test(tool.name)), ...tools];
  for (const tool of candidates) {
    const pathKey = firstKey(tool, PATH_KEYS);
    const contentKey = firstKey(tool, CONTENT_KEYS);
    if (pathKey && contentKey) {
      return { name: tool.name, arguments: { [pathKey]: filePath, [contentKey]: content } };
    }
  }
  return shellCall(tools, `cat > '${filePath}' <<'MOCK_EOF'\n${content}\nMOCK_EOF\n`, directory);
}

export function isReadTool(name: string): boolean {
  return READ_TOOL_NAMES.test(name);
}

/** A call to the harness's read tool; harnesses that guard overwrites want a file read before it's written. */
export function readFileCall(tools: MockTool[], filePath: string): ToolCallShape | undefined {
  const tool = tools.find((candidate) => isReadTool(candidate.name));
  const pathKey = tool ? firstKey(tool, PATH_KEYS) : undefined;
  return tool && pathKey ? { name: tool.name, arguments: { [pathKey]: filePath } } : undefined;
}

export function hasShell(tools: MockTool[]): boolean {
  return shellTool(tools) !== undefined;
}

/** The platform's ask_human tool, under whatever prefix the harness gives MCP tools. */
export function askHumanTool(tools: MockTool[]): MockTool | undefined {
  return tools.find((tool) => /ask_human$/.test(tool.name));
}

/** A tool that finds deferred tools, for harnesses that don't list MCP tools up front. */
export function isToolSearch(name: string): boolean {
  return /tool_?search|search_tool/i.test(name);
}

export function toolSearchCall(tools: MockTool[], query: string): ToolCallShape | undefined {
  const tool = tools.find((candidate) => isToolSearch(candidate.name));
  const key = tool ? firstKey(tool, ["query", "q", "search"]) : undefined;
  if (!tool || !key) return undefined;
  // Some search tools have modes, and rank names by a capability query.
  const mode = tool.parameters.properties?.mode ? { mode: "best_match" } : {};
  return { name: tool.name, arguments: { ...mode, [key]: query } };
}

/** A sandbox that calls found tools from code, for harnesses whose tools are reached that way. */
export function codeModeCall(tools: MockTool[], functionPath: string, args: Record<string, unknown>): ToolCallShape | undefined {
  const tool = tools.find((candidate) => propertyNames(candidate).includes("code"));
  if (!tool) return undefined;
  const path = functionPath.startsWith("tools.") ? functionPath : `tools.${functionPath}`;
  return { name: tool.name, arguments: { code: `return await ${path}(${JSON.stringify(args)});` } };
}

/** A tool that calls a deferred tool by name, for harnesses whose found tools aren't offered directly. */
export function deferredToolCall(tools: MockTool[], name: string, args: Record<string, unknown>): ToolCallShape | undefined {
  const tool = tools.find((candidate) => {
    const names = propertyNames(candidate);
    return names.includes("name") && names.includes("arguments");
  });
  return tool ? { name: tool.name, arguments: { name, arguments: args } } : undefined;
}

const WORKING_DIRECTORY = [
  /[Ww]orking directory: (\/\S+)/,
  /<cwd>(\/[^<]+)<\/cwd>/,
  /[Cc]urrent working directory:? (\/\S+)/,
  /working in the directory:? (\/\S+)/,
];

/** The directory the harness says it works in, from its prompts. */
export function workingDirectoryIn(text: string): string | undefined {
  for (const pattern of WORKING_DIRECTORY) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}
