import type { HomeData, HomeThread } from "@viberglass/types";
import { TaskReadDAO } from "../../persistence/ticketing/TaskReadDAO";
import { TaskAttentionDAO } from "../../persistence/ticketing/TaskAttentionDAO";
import { TaskThreadListDAO } from "../../persistence/ticketing/TaskThreadListDAO";
import { SpaceAccessService, type SpaceViewer } from "../spaces/SpaceAccessService";
import { TaskSituationService } from "../tasks/TaskSituationService";

interface Dependencies {
  access: Pick<SpaceAccessService, "visibleProjectIds">;
  list: Pick<TaskThreadListDAO, "listFor">;
  situations: Pick<TaskSituationService, "describe">;
  reads: Pick<TaskReadDAO, "unreadCounts">;
  attention: Pick<TaskAttentionDAO, "list">;
  now: () => Date;
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
      attention: new TaskAttentionDAO(),
      now: () => new Date(),
      ...deps,
    };
  }

  async load(viewer: SpaceViewer): Promise<HomeData> {
    const rows = await this.deps.list.listFor(viewer.id, await this.deps.access.visibleProjectIds(viewer));
    const ids = rows.map((row) => row.id);
    const [described, unread, dispositions] = await Promise.all([
      this.deps.situations.describe(rows, { id: viewer.id, isAdmin: viewer.role === "admin" }),
      this.deps.reads.unreadCounts(viewer.id, ids),
      this.deps.attention.list(viewer.id, ids),
    ]);
    const bySource = new Map(dispositions.map((entry) => [`${entry.ticketId}\0${entry.source}`, entry]));

    const threads: HomeThread[] = [];
    const requests: HomeThread[] = [];
    const now = this.deps.now();
    for (const row of rows) {
      const about = described.get(row.id);
      if (!about) continue;
      const thread: HomeThread = {
        task: { id: row.id, key: row.key, title: row.title, spaceSlug: row.spaceSlug, spaceName: row.spaceName },
        situation: about.situation,
        roles: row.roles,
        unread: unread.get(row.id) ?? 0,
        mentionsYou: about.mentionsYou,
        lastMessage: about.lastMessage,
        latestActivityAt: about.latestActivityAt,
      };
      if (!about.attentionRequests.length) threads.push(thread);
      for (const request of about.attentionRequests) {
        const disposition = bySource.get(`${row.id}\0${request.source}`);
        const expired = disposition?.remindAt && disposition.remindAt <= now;
        const status = !disposition || expired ? "new" : disposition.mode;
        requests.push({ ...thread, ...(request.kind === "mention" ? { lastMessage: request.mentionMessage ?? null } : {}), questionText: request.questionText, attention: { source: request.source, kind: request.kind, status, reason: disposition?.reason ?? null, remindAt: disposition?.remindAt?.toISOString() ?? null, questionIds: request.questionIds } });
      }
    }
    const newestFirst = (a: HomeThread, b: HomeThread) => b.latestActivityAt.localeCompare(a.latestActivityAt);
    const uniqueTasks = (items: HomeThread[]) => {
      const seen = new Set<string>();
      return items.filter((thread) => {
        if (seen.has(thread.task.id)) return false;
        seen.add(thread.task.id);
        return true;
      });
    };
    requests.sort(newestFirst);
    const newlyRequested = requests.filter((thread) => thread.attention?.status === "new");
    const acknowledged = requests.filter((thread) => thread.attention?.status === "acknowledged");
    const needsYou = uniqueTasks([...newlyRequested, ...acknowledged]);
    return {
      needsYou,
      threads: threads.sort(newestFirst),
      waiting: uniqueTasks(requests.filter((thread) => thread.attention?.status === "waiting")),
      later: uniqueTasks(requests.filter((thread) => thread.attention?.status === "later")),
      newCount: new Set(newlyRequested.map((thread) => thread.task.id)).size,
    };
  }
}
