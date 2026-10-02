import type { Router } from "express";
import logger from "../../../config/logger";
import type { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import type { FileUploadService } from "../../../services/FileUploadService";
import { validateUuidParam } from "../../middleware/validation";

interface TaskMediaRouteDependencies {
  ticketService: Pick<TicketDAO, "getTicket" | "getMediaAssetById">;
  fileUploadService: Pick<FileUploadService, "generateSignedUrlFromStorageUrl" | "getMediaContentUrl">;
}

/** A task's screenshot and recording: streamed, or as a short-lived link. */
export function registerTaskMediaRoutes(router: Router, { ticketService, fileUploadService }: TaskMediaRouteDependencies): void {
  // GET /api/tasks/media/:mediaId/content - Stream media content
  router.get(
    "/media/:mediaId/content",
    validateUuidParam("mediaId"),
    async (req, res) => {
      try {
        const media = await ticketService.getMediaAssetById(req.params.mediaId);

        if (!media) {
          return res.status(404).json({
            error: "Media asset not found",
          });
        }

        const source = media.storageUrl || media.url;
        if (source.startsWith("file://")) {
          const filePath = decodeURIComponent(new URL(source).pathname);
          return res.sendFile(filePath, {
            headers: {
              "Content-Type": media.mimeType,
              "Content-Disposition": `inline; filename="${media.filename}"`,
            },
          });
        }

        const signedUrl =
          await fileUploadService.generateSignedUrlFromStorageUrl(source, 3600);

        try {
          const s3Response = await fetch(signedUrl);
          if (!s3Response.ok) {
            return res.status(s3Response.status).json({
              error: "Failed to fetch media from storage",
            });
          }
          const buffer = await s3Response.arrayBuffer();
          res.set({
            "Content-Type": media.mimeType,
            "Content-Disposition": `inline; filename="${media.filename}"`,
            "Content-Length": buffer.byteLength,
          });
          return res.send(Buffer.from(buffer));
        } catch (error) {
          logger.error("Error proxying media from S3", {
            mediaId: req.params.mediaId,
            error: error instanceof Error ? error.message : error,
          });
          return res.status(500).json({
            error: "Internal server error",
            message: "Failed to fetch media",
          });
        }
      } catch (error) {
        logger.error("Error streaming media asset", {
          mediaId: req.params.mediaId,
          error: error instanceof Error ? error.message : error,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to stream media asset",
        });
      }
    },
  );

  // GET /api/tasks/:id/media/:mediaId/signed-url - Get signed URL for media access
  router.get(
    "/:id/media/:mediaId/signed-url",
    validateUuidParam("id"),
    validateUuidParam("mediaId"),
    async (req, res) => {
      try {
        const ticket = await ticketService.getTicket(req.params.id);

        if (!ticket) {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        const mediaId = req.params.mediaId;
        let mediaAsset;

        if (ticket.screenshot?.id === mediaId) {
          mediaAsset = ticket.screenshot;
        } else if (ticket.recording?.id === mediaId) {
          mediaAsset = ticket.recording;
        } else {
          return res.status(404).json({
            error: "Media asset not found",
          });
        }

        const source = mediaAsset.storageUrl || mediaAsset.url;
        const signedUrl = source.startsWith("file://")
          ? fileUploadService.getMediaContentUrl(mediaId)
          : await fileUploadService.generateSignedUrlFromStorageUrl(
              source,
              3600,
            );

        res.json({
          success: true,
          data: {
            signedUrl,
            expiresIn: 3600,
          },
        });
      } catch (error) {
        logger.error("Error generating signed URL", {
          error: error instanceof Error ? error.message : error,
        });
        res.status(500).json({
          error: "Internal server error",
          message: "Failed to generate signed URL",
        });
      }
    },
  );
}
