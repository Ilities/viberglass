import type { MockTool } from "./mockModelTypes";

const WRITE_TOOL_NAMES = /^(write|write_file|create_file)$/i;
const PATH_KEYS = ["filePath", "file_path", "path", "absolute_path", "filename"];
const CONTENT_KEYS = ["content", "contents", "file_text", "text"];

function propertyNames(tool: MockTool): string[] {
  return Object.keys(tool.parameters.properties ?? {});
}

function firstKey(tool: MockTool, candidates: string[]): string | undefined {
  const names = propertyNames(tool);
  return candidates.find((key) => names.includes(key));
}

/**
 * Builds a call to the harness's own file-writing tool, whatever it names it
 * and its arguments: each harness ships its own tools.
 */
export function writeFileCall(
  tools: MockTool[],
  filePath: string,
  content: string,
): { name: string; arguments: Record<string, unknown> } | undefined {
  const candidates = [...tools.filter((tool) => WRITE_TOOL_NAMES.test(tool.name)), ...tools];
  for (const tool of candidates) {
    const pathKey = firstKey(tool, PATH_KEYS);
    const contentKey = firstKey(tool, CONTENT_KEYS);
    if (pathKey && contentKey) {
      return { name: tool.name, arguments: { [pathKey]: filePath, [contentKey]: content } };
    }
  }
  return undefined;
}

/** The platform's ask_human tool, under whatever prefix the harness gives MCP tools. */
export function askHumanTool(tools: MockTool[]): MockTool | undefined {
  return tools.find((tool) => /ask_human$/.test(tool.name));
}

const WORKING_DIRECTORY = [
  /Working directory: (\/\S+)/,
  /<cwd>(\/[^<]+)<\/cwd>/,
  /[Cc]urrent working directory:? (\/\S+)/,
];

/** The directory the harness says it works in, from its system prompt. */
export function workingDirectoryIn(text: string): string | undefined {
  for (const pattern of WORKING_DIRECTORY) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return undefined;
}
