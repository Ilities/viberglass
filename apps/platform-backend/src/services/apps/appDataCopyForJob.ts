import { objectStorageBucket } from "@viberglass/types";
import type { AppDataGrantRecord } from "../../persistence/apps/AppDataGrantDAO";
import type { JobAppDataCopy } from "../../types/Job";
import { FileUploadService } from "../FileUploadService";

const LINK_SECONDS = 60 * 60;

export type AppDataCopyLinker = (grant: Pick<AppDataGrantRecord, "objectKey" | "copiedAt" | "bytes">) => Promise<JobAppDataCopy>;

/** The worker downloads the copy before the agent starts, so the link only has to outlast the wait for a worker. */
export const linkAppDataCopy: AppDataCopyLinker = async (grant) => {
  const s3Url = `s3://${objectStorageBucket(process.env)}/${grant.objectKey}`;
  const accessUrl = await new FileUploadService().generateSignedUrlFromStorageUrl(s3Url, LINK_SECONDS, "worker");
  return { s3Url, accessUrl, copiedAt: grant.copiedAt.toISOString(), bytes: grant.bytes };
};
