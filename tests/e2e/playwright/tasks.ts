import { APIRequestContext } from "@playwright/test";

let taskCounter = 0;

/** Creates a task (ticket) through the API and returns its id. */
export async function createTask(
  api: APIRequestContext,
  projectId: string,
  description: string,
): Promise<{ id: string; title: string }> {
  const title = `Smoke task ${Date.now()}-${++taskCounter}`;
  const response = await api.post("/api/tickets", {
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
  const body = await (await api.get(`/api/tickets/${taskId}`)).json();
  return String(body?.data?.workflowPhase);
}

/** The task's lifecycle status: open, in_progress, in_review or resolved. */
export async function taskStatus(api: APIRequestContext, taskId: string): Promise<string> {
  const body = await (await api.get(`/api/tickets/${taskId}`)).json();
  return String(body?.data?.status);
}

/** Starts an automatic research run and returns its job id. */
export async function startResearch(
  api: APIRequestContext,
  taskId: string,
  clankerId: string,
): Promise<string> {
  const response = await api.post(`/api/tickets/${taskId}/phases/research/run`, {
    data: { clankerId },
  });
  if (!response.ok()) {
    throw new Error(`Starting research failed: ${response.status()} ${await response.text()}`);
  }
  const body = await response.json();
  const jobId = body?.data?.jobId;
  if (typeof jobId !== "string") throw new Error("Research run returned no job id");
  return jobId;
}

/** The research document's current content; empty until an agent writes it. */
export async function researchDocument(api: APIRequestContext, taskId: string): Promise<string> {
  const body = await (await api.get(`/api/tickets/${taskId}/phases/research`)).json();
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
): Promise<{ sessionId: string; jobId: string }> {
  const response = await api.post(`/api/tickets/${taskId}/agent-sessions`, {
    data: { clankerId, mode: "research", initialMessage: "Start research" },
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
