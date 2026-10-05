/** A session's running totals, as a harness reports them: tokens so far, and what they cost. */
export interface AcpSessionTotals {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  costUsd?: number;
}

/**
 * How to ask a harness for its session's totals when it doesn't send usage
 * over ACP: a slash command it answers itself, without the model, and how to
 * read the totals out of its answer.
 */
export interface AcpUsageProbe {
  command: string;
  parse(text: string): AcpSessionTotals | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Collects the answer to a probe while it runs, so it's read here instead of
 * reaching the transcript as something the agent said.
 */
export class AcpSessionTotalsProbe {
  private answer: string | null = null;

  constructor(private readonly probe: AcpUsageProbe) {}

  get command(): string {
    return this.probe.command;
  }

  begin(): void {
    this.answer = "";
  }

  /** Takes a session update while the probe runs; false when no probe is running, so the update goes on as usual. */
  capture(params: unknown): boolean {
    if (this.answer === null) return false;
    const update = isRecord(params) && isRecord(params.update) ? params.update : params;
    if (isRecord(update) && update.sessionUpdate === "agent_message_chunk" && isRecord(update.content) && typeof update.content.text === "string") {
      this.answer += update.content.text;
    }
    return true;
  }

  end(): AcpSessionTotals | null {
    const answer = this.answer;
    this.answer = null;
    return answer ? this.probe.parse(answer) : null;
  }
}
