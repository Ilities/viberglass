import type { AgentUsageReport } from "../usage";

/** A turn that failed after the harness had already reported what some of its model calls used. */
export class AcpTurnFailedError extends Error {
  constructor(
    message: string,
    readonly usage?: AgentUsageReport,
    readonly model?: string,
  ) {
    super(message);
    this.name = "AcpTurnFailedError";
  }
}
