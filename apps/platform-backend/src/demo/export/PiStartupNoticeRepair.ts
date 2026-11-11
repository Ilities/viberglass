import { isPlainRecord, type Row } from "../bundle/jsonValues";
import { intentOf } from "../../services/taskTurns/intentOf";

/** Same shape the Pi worker filters: the version, a section it lists, or the update notice on its own. */
const STARTUP_START = /^(?:pi v\d[^\n]*\n---\n|## (?:Context|Skills|Prompts|Extensions)\n- |New version available: v)/;
const STARTUP_LINE = /^(?:pi v\d\S*|---|## (?:Context|Skills|Prompts|Extensions)|\s*- .*|New version available: .*|)$/;
const VERSION_START = /^pi v\d[^\n]*\n---\n/;
const UPDATE_LINE = /^New version available: /;

const isStartupNotice = (text: string): boolean => STARTUP_START.test(text) && text.split("\n").every((line) => STARTUP_LINE.test(line));

/**
 * Removes the startup notice older Pi workers kept at the start of a reply. A
 * reply only loses a leading notice that opens with Pi's version, and only up
 * to its update line when it has one, so a list the reply starts with stays.
 */
export function withoutStartupNotice(text: string): string {
  if (!VERSION_START.test(text)) return isStartupNotice(text) ? "" : text;
  const lines = text.split("\n");
  const run = lines.findIndex((line) => !STARTUP_LINE.test(line));
  const end = run < 0 ? lines.length : run;
  const update = lines.slice(0, end).reduce((last, line, index) => (UPDATE_LINE.test(line) ? index : last), -1);
  return lines
    .slice(update >= 0 ? update + 1 : end)
    .join("\n")
    .replace(/^\s+/, "");
}

/**
 * Takes Pi's startup notice out of captured turns and their events. An event
 * that held only the notice is left out; a turn whose reply changed gets its
 * intent again from what remains.
 */
export class PiStartupNoticeRepair {
  repair(table: string, rows: readonly Row[]): Row[] {
    if (table === "agent_turns") return rows.map((row) => this.turn(row));
    if (table === "agent_session_events") return rows.flatMap((row) => this.event(row));
    return [...rows];
  }

  private turn(row: Row): Row {
    const markdown = typeof row.content_markdown === "string" ? withoutStartupNotice(row.content_markdown) : row.content_markdown;
    const content = this.content(row.content_json);
    if (markdown === row.content_markdown && content === row.content_json) return row;
    return { ...row, content_markdown: markdown, content_json: content };
  }

  private content(content: unknown): unknown {
    if (!isPlainRecord(content) || typeof content.reply !== "string") return content;
    const reply = withoutStartupNotice(content.reply);
    if (reply === content.reply) return content;
    return "intent" in content ? { ...content, reply, intent: intentOf(reply) } : { ...content, reply };
  }

  private event(row: Row): Row[] {
    const payload = row.payload_json;
    if (!isPlainRecord(payload)) return [row];
    const text = payload.text;
    if (typeof text !== "string") return [row];
    const stripped = withoutStartupNotice(text);
    if (stripped === text) return [row];
    if (stripped.trim() === "" && row.event_type === "assistant_message") return [];
    return [{ ...row, payload_json: { ...payload, text: stripped } }];
  }
}
