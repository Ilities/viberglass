import type { Thread } from "chat";
import logger from "../config/logger";
import { JobService } from "../services/JobService";
import { TicketPhaseDocumentService } from "../services/TicketPhaseDocumentService";
import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import { getThreadForTicket } from "./ticketThreadMap";
import { ChatTicketThreadDAO } from "../persistence/chat/ChatTicketThreadDAO";
import { TicketPhaseRunDAO } from "../persistence/ticketing/TicketPhaseRunDAO";
import type { JobStatus, JobStatusResponse } from "../types/Job";

const POLL_INTERVAL_MS = 2000;

type Mode = "research" | "planning" | "execution";

interface ActiveBridge {
  jobId: string;
  ticketId: string;
  thread: Thread;
  mode: Mode;
  timer: ReturnType<typeof setInterval>;
}

export class TicketJobBridge {
  private readonly jobService = new JobService();
  private readonly documentService = new TicketPhaseDocumentService();
  private readonly threadDAO = new ChatTicketThreadDAO();
  private readonly phaseRunDAO = new TicketPhaseRunDAO();
  private readonly bridges = new Map<string, ActiveBridge>();

  /**
   * Start polling a job and post the document to the thread when it completes.
   */
  startBridge(
    jobId: string,
    ticketId: string,
    thread: Thread,
    mode: Mode,
  ): void {
    const key = `${ticketId}:${jobId}`;
    if (this.bridges.has(key)) return;

    let lastStatus: JobStatus | null = null;

    const poll = async () => {
      try {
        const status = await this.jobService.getJobStatus(jobId);
        if (!status) return;

        // Only act on terminal state transitions
        if (status.status === lastStatus) return;
        lastStatus = status.status;

        if (status.status === "completed") {
          await this.handleCompleted(ticketId, thread, mode, status);
          this.stopBridge(key);
        } else if (status.status === "failed") {
          await thread.post({
            markdown: "*Job failed.* An error occurred during processing.",
          });
          this.stopBridge(key);
        }
      } catch (err) {
        logger.error("TicketJobBridge poll error", {
          jobId,
          ticketId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    this.bridges.set(key, { jobId, ticketId, thread, mode, timer });
    poll();
  }

  stopBridge(key: string): void {
    const bridge = this.bridges.get(key);
    if (bridge) {
      clearInterval(bridge.timer);
      this.bridges.delete(key);
    }
  }

  /**
   * On startup, find ticket threads whose last job may not have been posted yet
   * and resume polling.
   */
  async resumeActiveBridges(): Promise<void> {
    try {
      const threads = await this.threadDAO.listAll();
      let resumed = 0;

      for (const entry of threads) {
        // Look up the latest phase run for this ticket to find the active job
        const ticketId = entry.ticketId;
        const thread = await getThreadForTicket(ticketId);
        if (!thread) continue;

        // Get latest job status — if it's not terminal, start a bridge
        const mode = entry.mode as Mode;
        // We need the latest job ID from the phase run. Use a simplified approach:
        // check if there's a non-terminal job for this ticket
        const activeJob = await this.findActiveJob(ticketId, mode);
        if (activeJob) {
          this.startBridge(activeJob, ticketId, thread, mode);
          resumed++;
        }
      }

      if (resumed > 0) {
        logger.info(`Resumed ${resumed} ticket job bridges on startup`);
      }
    } catch (err) {
      logger.error("Failed to resume ticket job bridges", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleCompleted(
    ticketId: string,
    thread: Thread,
    mode: Mode,
    status: JobStatusResponse,
  ): Promise<void> {
    try {
      const result = status.result as { pullRequestUrl?: string };

      if (mode !== "execution") {
        const phase =
          mode === "research"
            ? TICKET_WORKFLOW_PHASE.RESEARCH
            : TICKET_WORKFLOW_PHASE.PLANNING;

        const doc = await this.documentService.getOrCreateDocument(
          ticketId,
          phase,
        );
        if (doc.content?.trim()) {
          const filename =
            phase === TICKET_WORKFLOW_PHASE.RESEARCH
              ? "research.md"
              : "planning.md";
          await thread.post({
            markdown: `_${phase === TICKET_WORKFLOW_PHASE.RESEARCH ? "Research" : "Planning"} document:_`,
            files: [
              {
                data: Buffer.from(doc.content),
                filename,
                mimeType: "text/markdown",
              },
            ],
          });
        }
      } else if (result?.pullRequestUrl) {
        await thread.post({
          markdown: `*Pull Request created:* [${result.pullRequestUrl}](${result.pullRequestUrl})`,
        });
      }

      const parts: string[] = ["*Job completed.*"];

      // We don't have project ID here easily — skip ticket URL for now
      // (the modal already posted it)

      if (mode === "research") {
        parts.push(
          '_Mention @viberator with feedback to revise, or say "plan it" / "next" / "lgtm" to move to planning._',
        );
      } else if (mode === "planning") {
        parts.push(
          '_Mention @viberator with feedback to revise, or say "execute" / "ship it" / "go" to start execution._',
        );
      }

      await thread.post({ markdown: parts.join("\n") });
    } catch (err) {
      logger.error("TicketJobBridge handleCompleted error", {
        ticketId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async findActiveJob(
    ticketId: string,
    mode: Mode,
  ): Promise<string | null> {
    const phase =
      mode === "research"
        ? TICKET_WORKFLOW_PHASE.RESEARCH
        : mode === "planning"
          ? TICKET_WORKFLOW_PHASE.PLANNING
          : TICKET_WORKFLOW_PHASE.EXECUTION;

    return this.phaseRunDAO.findActiveJobId(ticketId, phase);
  }
}

// Singleton instance
export const ticketJobBridge = new TicketJobBridge();
