import type { ComparisonArmRecord } from "../../../../persistence/ticketing/TaskComparisonDAO";
import { ComparisonMergeFinisher } from "../../../../services/tasks/ComparisonMergeFinisher";

const PR_1 = "https://github.com/acme/website/pull/1";
const MERGED = { pullRequestUrl: PR_1, merged: true, mergedBy: "dev-patel" };

const arm = (ticketId: string, key: string, status: ComparisonArmRecord["status"]): ComparisonArmRecord => ({
  ticketId,
  comparisonId: "cmp-1",
  key,
  title: "Pricing",
  status,
  runner: { id: key, name: key, slug: key },
  position: 0,
  waiting: false,
});

function setup(winnerTicketId: string | null = null, parentStatus = "in_review") {
  const deps = {
    comparisons: {
      armOf: jest.fn().mockResolvedValue({ comparison: { id: "cmp-1", parentTicketId: "web-1", winnerTicketId } }),
      listArms: jest.fn().mockResolvedValue([arm("web-2", "WEB-2", "resolved"), arm("web-3", "WEB-3", "in_review"), arm("web-4", "WEB-4", "resolved")]),
      setWinner: jest.fn(),
    },
    tickets: { getTicket: jest.fn().mockResolvedValue({ id: "web-1", status: parentStatus }), updateTicket: jest.fn() },
    activity: { record: jest.fn() },
    done: { finish: jest.fn().mockResolvedValue(true) },
  };
  return { deps, finisher: new ComparisonMergeFinisher(deps) };
}

describe("ComparisonMergeFinisher", () => {
  it("finishes the original with the merged fork's pull request", async () => {
    const { deps, finisher } = setup("web-2");

    await finisher.onActivity({ ticketId: "web-2", kind: "pull_request_merged", actorId: null, payload: MERGED });

    expect(deps.tickets.updateTicket).toHaveBeenCalledWith("web-1", { status: "resolved" });
    expect(deps.activity.record).toHaveBeenCalledWith("web-1", { type: "system" }, "pull_request_merged", { ...MERGED, fork: "WEB-2" });
    expect(deps.comparisons.setWinner).not.toHaveBeenCalled();
  });

  it("finishes the forks still open as not picked", async () => {
    const { deps, finisher } = setup("web-2");

    await finisher.onActivity({ ticketId: "web-2", kind: "pull_request_merged", actorId: null, payload: MERGED });

    expect(deps.done.finish).toHaveBeenCalledTimes(1);
    expect(deps.done.finish).toHaveBeenCalledWith("web-3", { type: "system" }, { notPicked: true, picked: "WEB-2" });
  });

  it("picks the merged fork when nobody picked one", async () => {
    const { deps, finisher } = setup(null);

    await finisher.onActivity({ ticketId: "web-2", kind: "pull_request_merged", actorId: null, payload: MERGED });

    expect(deps.comparisons.setWinner).toHaveBeenCalledWith("cmp-1", "web-2");
  });

  it("leaves an original that's done already as it is", async () => {
    const { deps, finisher } = setup("web-2", "resolved");

    await finisher.onActivity({ ticketId: "web-2", kind: "pull_request_merged", actorId: null, payload: MERGED });

    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
    expect(deps.activity.record).not.toHaveBeenCalled();
  });

  it("ignores tasks outside a comparison and other activity", async () => {
    const { deps, finisher } = setup();

    await finisher.onActivity({ ticketId: "web-2", kind: "task_done", actorId: "dev", payload: {} });
    deps.comparisons.armOf.mockResolvedValue(null);
    await finisher.onActivity({ ticketId: "web-5", kind: "pull_request_merged", actorId: null, payload: MERGED });

    expect(deps.comparisons.listArms).not.toHaveBeenCalled();
    expect(deps.tickets.updateTicket).not.toHaveBeenCalled();
  });
});
