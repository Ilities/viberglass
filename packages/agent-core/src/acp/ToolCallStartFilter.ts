import type { PlatformSessionEvent } from "./types";

/**
 * Drops a tool call's start when it says nothing new. A harness reports a
 * running call again and again while it runs (OpenCode does for each chunk of
 * a command's output), and only a change of title or input is worth an event.
 */
export class ToolCallStartFilter {
  private readonly lastStart = new Map<string, string>();

  keep(event: PlatformSessionEvent): boolean {
    const toolCallId = event.payload.toolCallId;
    if (typeof toolCallId !== "string") return true;
    if (event.eventType === "tool_call_completed") {
      this.lastStart.delete(toolCallId);
      return true;
    }
    if (event.eventType !== "tool_call_started") return true;
    const seen = JSON.stringify(event.payload);
    if (this.lastStart.get(toolCallId) === seen) return false;
    this.lastStart.set(toolCallId, seen);
    return true;
  }
}
