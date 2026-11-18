import { KubernetesRunLimiter } from "../../../../workers/capacity/KubernetesRunLimiter";

jest.mock("../../../../persistence/job/KubernetesRunDAO");
jest.mock("../../../../persistence/workspace/WorkspaceSettingsDAO");

function limiterWith(maxRuns: number | null, running: string[] = [], open?: string[]) {
  const runs = {
    running: jest.fn().mockResolvedValue(running),
    abandonedWaiting: jest.fn().mockResolvedValue(["job_left"]),
    stillOpen: jest.fn(async (ids: string[]) => open ?? ids),
  };
  const limiter = new KubernetesRunLimiter(runs, { getWorkerMaxRuns: jest.fn().mockResolvedValue(maxRuns) });
  return { limiter, runs };
}

async function settled(turn: Promise<boolean>): Promise<boolean | "pending"> {
  return Promise.race([turn, new Promise<"pending">((resolve) => setImmediate(() => resolve("pending")))]);
}

describe("KubernetesRunLimiter", () => {
  it("starts every run when there is no limit", async () => {
    const { limiter } = limiterWith(null);
    await limiter.load();
    const entries = ["a", "b", "c"].map((id) => limiter.enter(id, false));
    expect(entries.map((entry) => entry.waiting)).toEqual([false, false, false]);
    expect(limiter.status()).toEqual({ maxRuns: null, running: 3, waiting: 0 });
  });

  it("counts runs already on the cluster and returns the ones a restart left waiting", async () => {
    const { limiter } = limiterWith(2, ["running_1"]);
    await expect(limiter.load()).resolves.toEqual(["job_left"]);
    expect(limiter.enter("a", false).waiting).toBe(false);
    expect(limiter.enter("b", false).waiting).toBe(true);
  });

  it("starts the next waiting run when one ends, people's runs before background ones", async () => {
    const { limiter } = limiterWith(1);
    await limiter.load();
    limiter.enter("first", false);
    const scheduled = limiter.enter("scheduled", true);
    const turn = limiter.enter("turn", false);

    limiter.release("first");
    await expect(settled(turn.turn)).resolves.toBe(true);
    await expect(settled(scheduled.turn)).resolves.toBe("pending");

    limiter.release("turn");
    await expect(settled(scheduled.turn)).resolves.toBe(true);
  });

  it("drops a waiting run that ends before it starts", async () => {
    const { limiter } = limiterWith(1);
    await limiter.load();
    limiter.enter("first", false);
    const waiting = limiter.enter("cancelled", false);
    limiter.release("cancelled");
    await expect(waiting.turn).resolves.toBe(false);
    expect(limiter.status()).toEqual({ maxRuns: 1, running: 1, waiting: 0 });
  });

  it("starts waiting runs when the limit is raised", async () => {
    const { limiter } = limiterWith(1);
    await limiter.load();
    limiter.enter("first", false);
    const waiting = limiter.enter("second", false);
    limiter.setMaxRuns(2);
    await expect(waiting.turn).resolves.toBe(true);
  });

  it("lets go of runs whose job ended without a release", async () => {
    const { limiter } = limiterWith(1, [], ["second"]);
    await limiter.load();
    limiter.enter("first", false);
    const waiting = limiter.enter("second", false);
    await expect(limiter.resync()).resolves.toBe(1);
    await expect(waiting.turn).resolves.toBe(true);
  });
});
