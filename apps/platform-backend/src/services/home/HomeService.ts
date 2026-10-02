import type { HomeData, HomeThread } from "@viberglass/types";
import { TaskReadDAO } from "../../persistence/ticketing/TaskReadDAO";
import { TaskThreadListDAO } from "../../persistence/ticketing/TaskThreadListDAO";
import { SpaceAccessService, type SpaceViewer } from "../spaces/SpaceAccessService";
import { TaskSituationService } from "../tasks/TaskSituationService";

interface Dependencies {
  access: Pick<SpaceAccessService, "visibleProjectIds">;
  list: Pick<TaskThreadListDAO, "listFor">;
  situations: Pick<TaskSituationService, "describe">;
  reads: Pick<TaskReadDAO, "unreadCounts">;
}

/**
 * Home: the task threads someone is in, like a chat app's
 * conversation list. Those where it's their move come first; the rest follow
 * by latest activity.
 */
export class HomeService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = {
      access: new SpaceAccessService(),
      list: new TaskThreadListDAO(),
      situations: new TaskSituationService(),
      reads: new TaskReadDAO(),
      ...deps,
    };
  }

  async load(viewer: SpaceViewer): Promise<HomeData> {
    const rows = await this.deps.list.listFor(viewer.id, await this.deps.access.visibleProjectIds(viewer));
    const ids = rows.map((row) => row.id);
    const [described, unread] = await Promise.all([
      this.deps.situations.describe(rows, { id: viewer.id, isAdmin: viewer.role === "admin" }),
      this.deps.reads.unreadCounts(viewer.id, ids),
    ]);

    const threads = rows
      .flatMap((row): HomeThread[] => {
        const about = described.get(row.id);
        if (!about) return [];
        return [
          {
            task: { id: row.id, key: row.key, title: row.title, spaceSlug: row.spaceSlug, spaceName: row.spaceName },
            situation: about.situation,
            roles: row.roles,
            unread: unread.get(row.id) ?? 0,
            mentionsYou: about.mentionsYou,
            lastMessage: about.lastMessage,
            latestActivityAt: about.latestActivityAt,
          },
        ];
      })
      .sort((a, b) => b.latestActivityAt.localeCompare(a.latestActivityAt));
    return {
      needsYou: threads.filter((thread) => thread.situation.yourMove),
      threads: threads.filter((thread) => !thread.situation.yourMove),
    };
  }
}
