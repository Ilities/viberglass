import type { OverviewData, OverviewTask } from "@viberglass/types";
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

/**
 * Overview, for viewers and anyone wanting the workspace picture:
 * what's stuck (failed, or waiting on people for over a day), what's in
 * progress, what was done this week, and where an agent is working now.
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
    const isStuck = ({ situation }: OverviewTask) =>
      situation.state === "failed" || (situation.waitingOn.kind === "people" && situation.since < dayAgo);
    const done = tasks.filter((task) => task.situation.state === "done");
    const open = tasks.filter((task) => task.situation.state !== "done");
    const stuck = open.filter(isStuck);
    const inProgress = open.filter((task) => !isStuck(task));

    const spaces = new Map<string, OverviewData["spaces"][number]>();
    const count = (task: OverviewTask, field: "inProgress" | "stuck" | "doneThisWeek") => {
      const space = spaces.get(task.task.spaceSlug) ?? { slug: task.task.spaceSlug, name: task.task.spaceName, inProgress: 0, stuck: 0, doneThisWeek: 0 };
      space[field] += 1;
      spaces.set(space.slug, space);
    };
    inProgress.forEach((task) => count(task, "inProgress"));
    stuck.forEach((task) => count(task, "stuck"));
    done.forEach((task) => count(task, "doneThisWeek"));

    return {
      stuck,
      inProgress,
      doneThisWeek: done,
      liveNow: open.filter((task) => task.situation.state === "agent_working"),
      spaces: [...spaces.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
