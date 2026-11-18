import type { WorkerCapacityStatus } from "@viberglass/types";
import { KubernetesRunDAO } from "../../persistence/job/KubernetesRunDAO";
import { WorkspaceSettingsDAO } from "../../persistence/workspace/WorkspaceSettingsDAO";

interface Waiter {
  jobId: string;
  settle: (started: boolean) => void;
}

/**
 * Caps how many Kubernetes workers run at once. Runs over the limit wait in
 * memory, people's runs ahead of scheduled ones and builds, so this assumes
 * one backend replica.
 */
export class KubernetesRunLimiter {
  private maxRuns: number | null = null;
  private readonly running = new Set<string>();
  private readonly interactive: Waiter[] = [];
  private readonly background: Waiter[] = [];

  constructor(
    private readonly runs: Pick<KubernetesRunDAO, "running" | "abandonedWaiting" | "stillOpen">,
    private readonly settings: Pick<WorkspaceSettingsDAO, "getWorkerMaxRuns">,
  ) {}

  /** Loads the limit and the runs already on the cluster; returns runs that were waiting before a restart and can't start now. */
  async load(): Promise<string[]> {
    this.maxRuns = await this.settings.getWorkerMaxRuns();
    for (const jobId of await this.runs.running()) this.running.add(jobId);
    return this.runs.abandonedWaiting();
  }

  /** `turn` settles true when the run may start, or false when it ended while waiting. */
  enter(jobId: string, background: boolean): { waiting: boolean; turn: Promise<boolean> } {
    const turn = new Promise<boolean>((settle) => (background ? this.background : this.interactive).push({ jobId, settle }));
    this.startNext();
    return { waiting: !this.running.has(jobId), turn };
  }

  release(jobId: string): void {
    if (this.running.delete(jobId)) {
      this.startNext();
      return;
    }
    for (const line of [this.interactive, this.background]) {
      const index = line.findIndex((waiter) => waiter.jobId === jobId);
      if (index >= 0) line.splice(index, 1)[0].settle(false);
    }
  }

  setMaxRuns(maxRuns: number | null): void {
    this.maxRuns = maxRuns;
    this.startNext();
  }

  /** Lets go of runs whose job ended without telling us, such as one the database changed directly. */
  async resync(): Promise<number> {
    const tracked = [...this.running, ...this.interactive.map((w) => w.jobId), ...this.background.map((w) => w.jobId)];
    const open = new Set(await this.runs.stillOpen(tracked));
    const ended = tracked.filter((jobId) => !open.has(jobId));
    ended.forEach((jobId) => this.release(jobId));
    return ended.length;
  }

  status(): WorkerCapacityStatus {
    return { maxRuns: this.maxRuns, running: this.running.size, waiting: this.interactive.length + this.background.length };
  }

  private startNext(): void {
    while (this.maxRuns === null || this.running.size < this.maxRuns) {
      const next = this.interactive.shift() ?? this.background.shift();
      if (!next) return;
      this.running.add(next.jobId);
      next.settle(true);
    }
  }
}

export const kubernetesRunLimiter = new KubernetesRunLimiter(new KubernetesRunDAO(), new WorkspaceSettingsDAO());
