/**
 * Turns a harness's stdout into the lines the platform's run log reads: one
 * `item.started` / `item.completed` event per line, with an `item` of type
 * `agent_message`, `reasoning` or `command_execution`. Lines it doesn't
 * recognise pass through as they are.
 */
export interface AgentOutputNormalizer {
  processLine(line: string): string[];
  /** Whatever is still buffered when the command exits. */
  flush(): string[];
}
