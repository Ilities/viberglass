import { hashConfig, RUN_MANIFEST_VERSION } from "@viberglass/telemetry";
import { isObjectRecord } from "@viberglass/types";
import { resolveComputeImage } from "../../clanker-config/resolveComputeImage";
import { createChildLogger } from "../../config/logger";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import db from "../../persistence/config/database";
import { RunManifestDAO } from "../../persistence/job/RunManifestDAO";

const logger = createChildLogger({ service: "JobBootstrapService" });

/** The payload a run's worker fetches when it starts, and the dispatch half of the run's manifest. */
export class JobBootstrapService {
  constructor(
    private readonly clankerDAO = new ClankerDAO(),
    private readonly runManifestDAO = new RunManifestDAO(),
  ) {}

  /**
   * Persist or replace bootstrap payload for a job.
   *
   * Also writes the dispatch half of the run manifest. This is the one point
   * every dispatch path converges on — ticket runs, claw jobs, session
   * launches and session continuations all call it with the fully assembled
   * payload — so recording here covers all of them instead of four
   * near-identical call sites drifting apart.
   */
  async saveBootstrapPayload(
    jobId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await db
      .updateTable("jobs")
      .set({
        bootstrap_payload: JSON.stringify(payload),
      })
      .where("id", "=", jobId)
      .execute();

    await this.recordDispatchManifest(jobId, payload);
  }

  /**
   * Derives and stores the dispatch manifest from a bootstrap payload.
   *
   * Never throws: telemetry must not be able to fail a job dispatch. A lost
   * manifest costs an eval sample; a thrown error costs the run.
   */
  private async recordDispatchManifest(
    jobId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const readString = (key: string): string | undefined => {
        const value = payload[key];
        return typeof value === "string" && value.trim() ? value : undefined;
      };

      const projectConfig = payload.projectConfig as
        | { id?: string }
        | undefined;
      const scm = payload.scm as { baseBranch?: string } | undefined;
      const context = payload.context as { ticketId?: string } | undefined;

      await this.runManifestDAO.recordDispatch({
        manifestVersion: RUN_MANIFEST_VERSION,
        jobId,
        tenantId: readString("tenantId") ?? "unknown",
        jobKind: readString("jobKind") ?? "unknown",
        ticketId: context?.ticketId,
        projectId: projectConfig?.id,
        clankerId: readString("clankerId"),
        requestedAgent: readString("agent"),
        repository: readString("repository") ?? "unknown",
        baseBranch: scm?.baseBranch ?? readString("baseBranch"),
        workerType: readString("workerType"),
        computeImage: await this.resolveDispatchedImage(readString("clankerId")),
        // Hashes rather than copies: the settings are already on the job row,
        // and what the manifest needs to answer is "was the configuration the
        // same as the previous run", which a hash answers exactly.
        configHash: hashConfig({
          settings: payload.settings ?? null,
          overrides: payload.overrides ?? null,
          workerSettings:
            (payload.projectConfig as { workerSettings?: unknown } | undefined)
              ?.workerSettings ?? null,
        }),
        instructionsHash: hashConfig(payload.instructionFiles ?? null),
        // Env var names only. The payload's requiredCredentials never hold values,
        // and nothing else from them is copied here.
        grantedCredentialNames: Array.isArray(payload.requiredCredentials)
          ? payload.requiredCredentials.flatMap((request: unknown) =>
              isObjectRecord(request) && typeof request.envVar === "string" ? [request.envVar] : [],
            )
          : undefined,
        dispatchedAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn("Failed to record dispatch manifest", { jobId, error });
    }
  }

  /**
   * The image the run's clanker starts workers from, read the way its
   * invoker reads it. Undefined when there is no clanker or it names none.
   */
  private async resolveDispatchedImage(clankerId: string | undefined): Promise<string | undefined> {
    if (!clankerId) return undefined;
    const clanker = await this.clankerDAO.getClanker(clankerId);
    return (clanker && resolveComputeImage(clanker)) ?? undefined;
  }

  /**
   * Retrieve bootstrap payload and tenant binding for worker bootstrap flow.
   */
  async getBootstrapPayload(jobId: string): Promise<{
    tenantId: string;
    payload: Record<string, unknown> | null;
  } | null> {
    const job = await db
      .selectFrom("jobs")
      .select(["tenant_id", "bootstrap_payload"])
      .where("id", "=", jobId)
      .executeTakeFirst();

    if (!job) {
      return null;
    }

    const parsedPayload =
      typeof job.bootstrap_payload === "string"
        ? (JSON.parse(job.bootstrap_payload) as Record<string, unknown>)
        : (job.bootstrap_payload as Record<string, unknown> | null);

    return {
      tenantId: job.tenant_id,
      payload: parsedPayload,
    };
  }
}
