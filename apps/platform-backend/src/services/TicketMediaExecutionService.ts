import type { Clanker, Ticket } from "@viberglass/types";
import { resolveClankerConfig } from "../clanker-config";
import { createChildLogger } from "../config/logger";
import { FileUploadService } from "./FileUploadService";
import type { JobTicketMedia, VolumeMount } from "../types/Job";
import type { TicketMediaKind } from "./ticket-media/mediaStoragePaths";

const logger = createChildLogger({ service: "TicketMediaExecutionService" });

interface TicketMediaCandidate {
  kind: TicketMediaKind;
  asset: NonNullable<Ticket["screenshot"]>;
}

export class TicketMediaExecutionService {
  constructor(private readonly fileUploadService: FileUploadService = new FileUploadService()) {}

  async prepareForExecution(
    ticket: Ticket,
    clanker: Clanker,
  ): Promise<{ media: JobTicketMedia[]; mounts: VolumeMount[] }> {
    const candidates: TicketMediaCandidate[] = [];
    if (ticket.screenshot) {
      candidates.push({ kind: "screenshot", asset: ticket.screenshot });
    }
    if (ticket.recording) {
      candidates.push({ kind: "recording", asset: ticket.recording });
    }

    if (candidates.length === 0) {
      return { media: [], mounts: [] };
    }

    const strategyType = resolveClankerConfig(clanker).config.strategy.type;
    if (strategyType === "docker") {
      return this.prepareForDocker(candidates);
    }

    return this.prepareForHosted(candidates);
  }

  private async prepareForDocker(
    candidates: TicketMediaCandidate[],
  ): Promise<{ media: JobTicketMedia[]; mounts: VolumeMount[] }> {
    const media: JobTicketMedia[] = [];
    const mounts: VolumeMount[] = [];

    for (const candidate of candidates) {
      let hostPath: string | null = null;
      try {
        hostPath = await this.fileUploadService.ensureLocalPathForMedia(
          candidate.asset,
          candidate.kind,
        );
      } catch (error) {
        logger.warn("Failed to prepare local ticket media for Docker execution", {
          mediaId: candidate.asset.id,
          kind: candidate.kind,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (!hostPath) {
        logger.warn("Skipping ticket media for Docker execution; no local path", {
          mediaId: candidate.asset.id,
          kind: candidate.kind,
        });
        continue;
      }

      const mountPath = this.fileUploadService.getContainerMountPath(
        candidate.asset.id,
        candidate.asset.filename,
        candidate.kind,
      );

      mounts.push({
        hostPath,
        containerPath: mountPath,
        readOnly: true,
      });

      media.push({
        id: candidate.asset.id,
        kind: candidate.kind,
        filename: candidate.asset.filename,
        mimeType: candidate.asset.mimeType,
        size: candidate.asset.size,
        uploadedAt: candidate.asset.uploadedAt,
        storageUrl: candidate.asset.storageUrl || candidate.asset.url,
        mountPath,
      });
    }

    return { media, mounts };
  }

  private async prepareForHosted(
    candidates: TicketMediaCandidate[],
  ): Promise<{ media: JobTicketMedia[]; mounts: VolumeMount[] }> {
    const media: JobTicketMedia[] = [];

    for (const candidate of candidates) {
      let s3Url: string | null = null;
      try {
        s3Url = await this.fileUploadService.ensureS3UrlForMedia(
          candidate.asset,
          candidate.kind,
        );
      } catch (error) {
        logger.warn("Failed to prepare S3 ticket media for hosted execution", {
          mediaId: candidate.asset.id,
          kind: candidate.kind,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (!s3Url) {
        logger.warn("Skipping ticket media for hosted execution; no S3 URL", {
          mediaId: candidate.asset.id,
          kind: candidate.kind,
        });
        continue;
      }

      let accessUrl = "";
      try {
        accessUrl = await this.fileUploadService.generateSignedUrlFromStorageUrl(
          s3Url,
          3600,
        );
      } catch (error) {
        logger.warn("Failed to generate signed URL for ticket media", {
          mediaId: candidate.asset.id,
          kind: candidate.kind,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      media.push({
        id: candidate.asset.id,
        kind: candidate.kind,
        filename: candidate.asset.filename,
        mimeType: candidate.asset.mimeType,
        size: candidate.asset.size,
        uploadedAt: candidate.asset.uploadedAt,
        storageUrl: s3Url,
        s3Url,
        ...(accessUrl ? { accessUrl } : {}),
      });
    }

    return { media, mounts: [] };
  }
}
