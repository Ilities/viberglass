import type { AgentSession } from "../../../../persistence/agentSession/AgentSessionDAO";
import { AgentSessionQueryService } from "../../../../services/agentSession/AgentSessionQueryService";

const at = new Date("2026-10-01T00:00:00Z");
const SESSION: AgentSession = {
  id: "s-1",
  tenantId: "t-1",
  projectId: "p-1",
  projectSlug: "shop",
  ticketId: "task-1",
  ticketTitle: "Fix checkout",
  clankerId: "c-1",
  mode: "execution",
  status: "active",
  title: null,
  repository: null,
  baseBranch: null,
  workspaceBranch: null,
  draftPullRequestUrl: null,
  headCommitHash: null,
  lastJobId: null,
  lastTurnId: null,
  latestPendingRequestId: null,
  metadataJson: { acpSessionId: "acp-1", conversationStateUrl: "https://storage.example.com/state.tar.gz?X-Amz-Signature=x" },
  createdBy: null,
  createdAt: at,
  updatedAt: at,
  completedAt: null,
};

function service() {
  return new AgentSessionQueryService(
    {
      getById: jest.fn(async () => SESSION),
      listByTicket: jest.fn(async () => [SESSION]),
      listByProject: jest.fn(async () => [SESSION]),
      listByStatuses: jest.fn(async () => [SESSION]),
    },
    { listBySession: jest.fn(async () => []) },
    { listBySession: jest.fn(async () => []) },
    { getOpenBySession: jest.fn(async () => null) },
  );
}

describe("AgentSessionQueryService", () => {
  it("never hands out a session's resume state, which links to the agent's full transcript", async () => {
    const queries = service();
    const shown = [
      (await queries.getDetail("s-1"))?.session,
      ...(await queries.listForTicket("task-1")),
      ...(await queries.listForProject("p-1")),
      ...(await queries.listByStatuses(["active"])),
    ];
    expect(shown).toHaveLength(4);
    for (const session of shown) {
      expect(session).toMatchObject({ id: "s-1", ticketTitle: "Fix checkout" });
      expect(session).not.toHaveProperty("metadataJson");
      expect(JSON.stringify(session)).not.toContain("state.tar.gz");
    }
  });
});
