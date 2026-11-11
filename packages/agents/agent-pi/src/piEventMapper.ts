import { defaultAcpEventMapper, type AcpEventMapper } from "@viberglass/agent-core";
import { isObjectRecord } from "@viberglass/types";

/** How pi-acp's startup notice begins: Pi's version, a section it lists, or the update notice on its own. */
const STARTUP_START = /^(?:pi v\d[^\n]*\n---\n|## (?:Context|Skills|Prompts|Extensions)\n- |New version available: v)/;

/** Every line of the notice: the version, rules, section headings, listed paths, and the update notice. */
const STARTUP_LINE = /^(?:pi v\d\S*|---|## (?:Context|Skills|Prompts|Extensions)|\s*- .*|New version available: .*|)$/;

/**
 * pi-acp sends its startup notice (Pi's version, the context files, skills
 * and extensions it found, and whether a newer Pi is out) as one agent
 * message when a session opens, so it would read as the start of the reply.
 */
export function isPiStartupNotice(text: string): boolean {
  return STARTUP_START.test(text) && text.split("\n").every((line) => STARTUP_LINE.test(line));
}

function startupNoticeIn(params: unknown): boolean {
  const update = isObjectRecord(params) && isObjectRecord(params.update) ? params.update : params;
  if (!isObjectRecord(update) || update.sessionUpdate !== "agent_message_chunk" || !isObjectRecord(update.content)) return false;
  return typeof update.content.text === "string" && isPiStartupNotice(update.content.text);
}

export const piEventMapper: AcpEventMapper = {
  mapSessionUpdate: (params) => (startupNoticeIn(params) ? [] : defaultAcpEventMapper.mapSessionUpdate(params)),
  mapPermissionRequest: (params) => defaultAcpEventMapper.mapPermissionRequest(params),
};
