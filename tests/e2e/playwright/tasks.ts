import { APIRequestContext } from "@playwright/test";

let taskCounter = 0;

/** Creates a task (ticket) through the API and returns its id. */
export async function createTask(
  api: APIRequestContext,
  projectId: string,
  description: string,
): Promise<{ id: string; title: string }> {
  const title = `Smoke task ${Date.now()}-${++taskCounter}`;
  const response = await api.post("/api/tasks", {
    multipart: { projectId, title, description },
  });
  if (!response.ok()) {
    throw new Error(`Creating a task failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  const id = body?.data?.id ?? body?.id;
  if (typeof id !== "string") throw new Error("Task creation returned no id");
  return { id, title };
}

/** The task's current workflow phase: research, planning or execution. */
export async function taskPhase(api: APIRequestContext, taskId: string): Promise<string> {
  const body = await (await api.get(`/api/tasks/${taskId}`)).json();
  return String(body?.data?.workflowPhase);
}

/** The task's lifecycle status: open, in_progress, in_review or resolved. */
export async function taskStatus(api: APIRequestContext, taskId: string): Promise<string> {
  const body = await (await api.get(`/api/tasks/${taskId}`)).json();
  return String(body?.data?.status);
}

/** The agent's turn an ask started (or joined, while one was running). */
export interface AskedTurn {
  sessionId: string;
  turnId: string;
  jobId: string;
  status: string;
}

/** Asks the agent in the task's thread, as a suggested action does, and returns its turn. */
export async function askAgent(
  api: APIRequestContext,
  taskId: string,
  ask: { action?: "research" | "plan" | "code" | "reply"; body?: string; agentId?: string },
): Promise<AskedTurn> {
  const response = await api.post(`/api/tasks/${taskId}/messages`, { data: { body: ask.body ?? "", ...ask } });
  if (!response.ok()) {
    throw new Error(`Asking the agent failed: ${response.status()} ${await response.text()}`);
  }
  const turn = (await response.json())?.turn;
  if (typeof turn?.jobId !== "string") throw new Error("Asking the agent started no run");
  return turn;
}

/** Asks the agent for the research and returns its run's job id. */
export async function startResearch(api: APIRequestContext, taskId: string, clankerId: string): Promise<string> {
  return (await askAgent(api, taskId, { action: "research", body: "Write the research", agentId: clankerId })).jobId;
}

/** The task's thread, oldest first. */
export async function timeline(api: APIRequestContext, taskId: string): Promise<Array<Record<string, unknown>>> {
  const body = await (await api.get(`/api/tasks/${taskId}/timeline`)).json();
  return Array.isArray(body?.data) ? body.data : [];
}

/** The research document's current content; empty until an agent writes it. */
export async function researchDocument(api: APIRequestContext, taskId: string): Promise<string> {
  const body = await (await api.get(`/api/tasks/${taskId}/phases/research`)).json();
  return String(body?.data?.document?.content ?? "");
}

/** The plan's current content; empty until it's written. */
export async function planDocument(api: APIRequestContext, taskId: string): Promise<string> {
  const body = await (await api.get(`/api/tasks/${taskId}/phases/planning`)).json();
  return String(body?.data?.document?.content ?? "");
}

export async function runStatus(api: APIRequestContext, jobId: string): Promise<string> {
  // Unlike most routes, this one returns the job itself rather than { data }.
  const body = await (await api.get(`/api/jobs/${jobId}`)).json();
  return String(body?.status);
}

/** Starts a live research session and returns the session and first run ids. */
export async function startLiveResearchSession(
  api: APIRequestContext,
  taskId: string,
  clankerId: string,
  initialMessage = "Start research",
): Promise<{ sessionId: string; jobId: string }> {
  const response = await api.post(`/api/tasks/${taskId}/agent-sessions`, {
    data: { clankerId, mode: "research", initialMessage },
  });
  if (!response.ok()) {
    throw new Error(`Starting a session failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  const sessionId = body?.data?.session?.id;
  const jobId = body?.data?.job?.id;
  if (typeof sessionId !== "string" || typeof jobId !== "string") {
    throw new Error("Session launch returned no session or run id");
  }
  return { sessionId, jobId };
}

export async function sessionStatus(api: APIRequestContext, sessionId: string): Promise<string> {
  const body = await (await api.get(`/api/agent-sessions/${sessionId}`)).json();
  return String(body?.data?.session?.status);
}

/** The run a page shows: task pages open a run with ?run=, the standalone run page has it in the path. */
export function shownRunId(url: string): string {
  const parsed = new URL(url);
  const fromQuery = parsed.searchParams.get("run");
  if (fromQuery) return fromQuery;
  const fromPath = parsed.pathname.split("/runs/")[1];
  if (!fromPath) throw new Error(`No run in ${url}`);
  return fromPath;
}
