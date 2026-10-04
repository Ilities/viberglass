import { type OverviewData, type OverviewGroup, type OverviewTask } from "@viberglass/types";
import { TaskThreadListDAO } from "../../persistence/ticketing/TaskThreadListDAO";
import { SpaceAccessService, type SpaceViewer } from "../spaces/SpaceAccessService";
import { TaskSituationService } from "../tasks/TaskSituationService";

interface Dependencies {
  access: Pick<SpaceAccessService, "visibleProjectIds">;
  list: Pick<TaskThreadListDAO, "listCurrent">;
  situations: Pick<TaskSituationService, "describe">;
  now: () => Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Which group a task is in. Needing attention wins, so nothing is counted twice. */
function groupOf({ situation }: OverviewTask, dayAgo: string): OverviewGroup {
  const { state } = situation;
  if (state === "done") return "doneThisWeek";
  if (state === "failed" || state === "paused" || state === "question") return "needsAttention";
  if (state === "agent_working") return "liveNow";
  if (state === "not_started") return "notStarted";
  return situation.waitingOn.kind === "people" && situation.since < dayAgo ? "needsAttention" : "waiting";
}

/**
 * Overview, for viewers and anyone wanting the workspace picture: each task in
 * one group (needs attention, agent working, waiting on people, not started,
 * done this week), with the same counts per space.
 */
export class OverviewService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      access: new SpaceAccessService(),
      list: new TaskThreadListDAO(),
      situations: new TaskSituationService(),
      now: () => new Date(),
      ...deps,
    };
  }

  async load(viewer: SpaceViewer, spaceSlug?: string): Promise<OverviewData> {
    const now = this.deps.now();
    const rows = (await this.deps.list.listCurrent(await this.deps.access.visibleProjectIds(viewer), new Date(now.getTime() - 7 * DAY_MS)))
      .filter((row) => !spaceSlug || row.spaceSlug === spaceSlug);
    const described = await this.deps.situations.describe(rows, { id: viewer.id, isAdmin: viewer.role === "admin" });
    const tasks = rows.flatMap((row): OverviewTask[] => {
      const about = described.get(row.id);
      return about
        ? [
            {
              task: { id: row.id, key: row.key, title: row.title, spaceSlug: row.spaceSlug, spaceName: row.spaceName },
              situation: about.situation,
              pullRequestUrl: row.pullRequestUrl,
            },
          ]
        : [];
    });

    const dayAgo = new Date(now.getTime() - DAY_MS).toISOString();
    const groups: Record<OverviewGroup, OverviewTask[]> = { needsAttention: [], liveNow: [], waiting: [], notStarted: [], doneThisWeek: [] };
    const spaces = new Map<string, OverviewData["spaces"][number]>();
    for (const task of tasks) {
      const group = groupOf(task, dayAgo);
      groups[group].push(task);
      const space = spaces.get(task.task.spaceSlug) ?? {
        slug: task.task.spaceSlug,
        name: task.task.spaceName,
        needsAttention: 0,
        liveNow: 0,
        waiting: 0,
        notStarted: 0,
        doneThisWeek: 0,
      };
      space[group] += 1;
      spaces.set(space.slug, space);
    }

    return { ...groups, spaces: [...spaces.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  }
}
