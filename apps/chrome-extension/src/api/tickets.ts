import { apiRequest } from "./client";
import { getAuth, getPlatformUrl } from "@/storage";
import type {
  CreateTicketPayload,
  TicketResponse,
  TicketWorkflowPhase,
} from "@/types";

export async function createTicket(
  payload: CreateTicketPayload,
  screenshotDataUrl?: string,
  recordingBlob?: Blob,
): Promise<TicketResponse> {
  const auth = await getAuth();
  const baseUrl = await getPlatformUrl();

  const formData = new FormData();
  formData.append("projectId", payload.projectId);
  formData.append("title", payload.title);
  formData.append("description", payload.description);
  formData.append("severity", payload.severity);
  formData.append("category", payload.category);
  formData.append("metadata", JSON.stringify(payload.metadata));
  formData.append("annotations", JSON.stringify(payload.annotations));
  formData.append("autoFixRequested", String(payload.autoFixRequested));

  if (payload.ticketSystem) {
    formData.append("ticketSystem", payload.ticketSystem);
  }
  if (payload.workflowPhase) {
    formData.append("workflowPhase", payload.workflowPhase);
  }

  if (screenshotDataUrl) {
    const blob = await dataUrlToBlob(screenshotDataUrl);
    formData.append("screenshot", blob, "screenshot.png");
  }

  if (recordingBlob) {
    formData.append("recording", recordingBlob, "recording.webm");
  }

  const response = await fetch(`${baseUrl}/api/tickets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth?.token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    let message = "Failed to create ticket";
    try {
      const body = await response.json();
      if (body.error) message = body.error;
      if (body.details) {
        const details = body.details
          .map((d: { field: string; message: string }) => `${d.field}: ${d.message}`)
          .join(", ");
        message = `${message}: ${details}`;
      }
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export async function runPhase(
  ticketId: string,
  phase: TicketWorkflowPhase,
  clankerId: string,
): Promise<void> {
  const endpoints: Record<TicketWorkflowPhase, string> = {
    research: `/api/tickets/${ticketId}/phases/research/run`,
    planning: `/api/tickets/${ticketId}/phases/planning/run`,
    execution: `/api/tickets/${ticketId}/run`,
  };

  await apiRequest(endpoints[phase], {
    method: "POST",
    body: JSON.stringify({ clankerId }),
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}
