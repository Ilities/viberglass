import type { AgentTrackRecord, AgentTrackRecordEntry } from "@viberglass/types";
import type { AgentTrackRecordDAO } from "../../persistence/ticketing/AgentTrackRecordDAO";

/** A space's tasks grouped by the harness and model credited with each, the busiest first. */
export class AgentTrackRecordService {
  constructor(private readonly tasks: Pick<AgentTrackRecordDAO, "tasksOf">) {}

  async trackRecord(spaceId: string): Promise<AgentTrackRecord> {
    const entries = new Map<string, AgentTrackRecordEntry>();
    for (const { agent, model, ...task } of await this.tasks.tasksOf(spaceId)) {
      const key = JSON.stringify([agent, model]);
      const entry = entries.get(key) ?? { agent, model, tasks: [] };
      entry.tasks.push(task);
      entries.set(key, entry);
    }
    return { entries: [...entries.values()].sort((a, b) => b.tasks.length - a.tasks.length) };
  }
}
