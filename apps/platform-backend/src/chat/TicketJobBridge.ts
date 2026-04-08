import { Card, CardText, Actions, Button } from "chat";
import type { Thread } from "chat";
import logger from "../config/logger";
import { JobService } from "../services/JobService";
import { TicketPhaseDocumentService } from "../services/TicketPhaseDocumentService";
import {
  TICKET_WORKFLOW_PHASE,
  type TicketWorkflowPhase,
} from "@viberglass/types";
import { getThreadForTicket, updateTicketThreadMode } from "./ticketThreadMap";
import { ChatTicketThreadDAO } from "../persistence/chat/ChatTicketThreadDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { TicketPhaseRunDAO } from "../persistence/ticketing/TicketPhaseRunDAO";
import { ticketUrl } from "./platformLinks";
import type { JobStatus, JobStatusResponse } from "../types/Job";

const POLL_INTERVAL_MS = 2000;

type Mode = "research" | "planning" | "execution";

interface ActiveBridge {
  jobId: string;
  ticketId: string;
  thread: Thread;
  mode: Mode;
  timer: ReturnType<typeof setInterval>;
  chainTo?: TicketWorkflowPhase;
  clankerId?: string;
}

export interface TicketBridgeCallbacks {
  advanceAndRun: (params: {
    ticketId: string;
    clankerId: string;
    targetPhase: TicketWorkflowPhase;
  }) => Promise<{ jobId: string; status: string }>;
}

export class TicketJobBridge {
  private readonly jobService = new JobService();
  private readonly documentService = new TicketPhaseDocumentService();
  private readonly threadDAO = new ChatTicketThreadDAO();
  private readonly phaseRunDAO = new TicketPhaseRunDAO();
  private readonly ticketDAO = new TicketDAO();
  private readonly projectDAO = new ProjectDAO();
  private readonly bridges = new Map<string, ActiveBridge>();
  private callbacks: TicketBridgeCallbacks | null = null;

  configure(callbacks: TicketBridgeCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Start polling a job and post the document to the thread when it completes.
   * If `chainTo` is set, on completion the bridge will auto-advance the ticket
   * to that phase and start a new bridge for the follow-up job.
   */
  startBridge(
    jobId: string,
    ticketId: string,
    thread: Thread,
    mode: Mode,
    chainTo?: TicketWorkflowPhase,
    clankerId?: string,
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
          const current = this.bridges.get(key);
          const chainTo = current?.chainTo;
          const chainClankerId = current?.clankerId;
          await this.handleCompleted(ticketId, thread, mode, status);
          this.stopBridge(key);
          if (chainTo && chainClankerId) {
            await this.handleChain(ticketId, thread, chainTo, chainClankerId);
          }
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
    this.bridges.set(key, {
      jobId,
      ticketId,
      thread,
      mode,
      timer,
      chainTo,
      clankerId,
    });
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
        // Persist PR URL on the ticket so the UI reflects completion.
        try {
          await this.ticketDAO.updatePullRequestUrl(
            ticketId,
            result.pullRequestUrl,
          );
        } catch (err) {
          logger.error("Failed to persist pull request URL on ticket", {
            ticketId,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        const ticketLink = await this.buildTicketLink(ticketId);
        const lines = [
          `*Pull Request created:* [${result.pullRequestUrl}](${result.pullRequestUrl})`,
        ];
        if (ticketLink) {
          lines.push(`_View ticket:_ ${ticketLink}`);
        }
        await thread.post({ markdown: lines.join("\n") });
      }

      if (mode === "research" || mode === "planning") {
        const phaseLabel = mode === "research" ? "Research" : "Planning";
        const hint =
          mode === "research"
            ? 'Click Approve to advance to planning, or @mention with feedback to revise. You can also say "plan it" / "next" / "lgtm".'
            : 'Click Approve to start execution, or @mention with feedback to revise. You can also say "execute" / "ship it" / "go".';
        await thread.post(
          Card({
            title: `${phaseLabel} complete`,
            children: [
              CardText(hint),
              Actions([
                Button({
                  id: "ticket_approve_phase",
                  label: "Approve",
                  style: "primary",
                  value: ticketId,
                }),
                Button({
                  id: "ticket_reject_phase",
                  label: "Reject",
                  style: "danger",
                  value: ticketId,
                }),
              ]),
            ],
          }),
        );
      } else {
        await thread.post({ markdown: "*Job completed.*" });
      }
    } catch (err) {
      logger.error("TicketJobBridge handleCompleted error", {
        ticketId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async buildTicketLink(ticketId: string): Promise<string | null> {
    try {
      const ticket = await this.ticketDAO.getTicket(ticketId);
      if (!ticket) return null;
      const project = await this.projectDAO.getProject(ticket.projectId);
      if (!project) return null;
      return ticketUrl(project.slug, ticketId);
    } catch {
      return null;
    }
  }

  private async handleChain(
    ticketId: string,
    thread: Thread,
    chainTo: TicketWorkflowPhase,
    clankerId: string,
  ): Promise<void> {
    if (!this.callbacks) {
      logger.error(
        "TicketJobBridge chain requested but callbacks not configured",
        { ticketId, chainTo },
      );
      return;
    }
    try {
      await thread.post({ markdown: `_Advancing to ${chainTo}…_` });
      await updateTicketThreadMode(ticketId, chainTo);
      const result = await this.callbacks.advanceAndRun({
        ticketId,
        clankerId,
        targetPhase: chainTo,
      });
      const mode = chainTo as Mode;
      this.startBridge(result.jobId, ticketId, thread, mode);
    } catch (err) {
      logger.error("TicketJobBridge chain advance failed", {
        ticketId,
        chainTo,
        error: err instanceof Error ? err.message : String(err),
      });
      await thread.post({
        markdown: `Error advancing to ${chainTo}: ${
          err instanceof Error ? err.message : String(err)
        }`,
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
