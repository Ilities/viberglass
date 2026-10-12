import { ARTIFACT_FORMATS, isObjectRecord, type SpaceFilesSnapshotSummary, type TurnArtifact, type TaskTurnOutcome, type TaskTurnProduct } from "@viberglass/types";
import type { JsonValue } from "../types/database";

const PRODUCTS: readonly TaskTurnProduct[] = ["plan", "code", "summary"];

/** The outcome a finished turn stored (TaskTurnOutcomeService); null before it finished, or for turns from before turns had one. */
export function outcomeOf(json: JsonValue | null): TaskTurnOutcome | null {
  if (!isObjectRecord(json) || typeof json.reply !== "string") return null;
  const produced = Array.isArray(json.produced) ? json.produced : [];
  return {
    intent: typeof json.intent === "string" ? json.intent : null,
    reply: json.reply,
    produced: PRODUCTS.filter((product) => produced.includes(product)),
    ...(isObjectRecord(json.files) ? { files: filesOf(json.files) } : {}),
    ...(Array.isArray(json.artifacts) ? { artifacts: json.artifacts.flatMap(artifactOf) } : {}),
    codeDiscarded: json.codeDiscarded === true,
    resumed: typeof json.resumed === "boolean" ? json.resumed : null,
    mentioned: Array.isArray(json.mentioned) ? json.mentioned.filter(isPerson) : [],
    contextUsage: contextUsageOf(json.contextUsage),
    compacted: json.compacted === true,
    commit: typeof json.commit === "string" ? json.commit : null,
    stoppedPartway: json.stoppedPartway === true,
  };
}

function count(value: JsonValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** What a Files turn saved, as TaskTurnOutcomeService stored it. */
function filesOf(json: { [key: string]: JsonValue | undefined }): SpaceFilesSnapshotSummary {
  const changes = isObjectRecord(json.changes) ? json.changes : {};
  return {
    id: typeof json.id === "string" ? json.id : "",
    parentId: typeof json.parentId === "string" ? json.parentId : null,
    fileCount: count(json.fileCount),
    totalBytes: count(json.totalBytes),
    partial: json.partial === true,
    changes: { added: count(changes.added), changed: count(changes.changed), removed: count(changes.removed) },
    createdAt: typeof json.createdAt === "string" ? json.createdAt : "",
  };
}

function artifactOf(value: JsonValue): TurnArtifact[] {
  if (!isObjectRecord(value) || typeof value.artifactId !== "string" || typeof value.versionId !== "string") return [];
  const format = ARTIFACT_FORMATS.find((candidate) => candidate === value.format) ?? "other";
  return [{
    artifactId: value.artifactId,
    versionId: value.versionId,
    title: typeof value.title === "string" ? value.title : "",
    number: typeof value.number === "number" ? value.number : 0,
    format,
  }];
}

function contextUsageOf(value: JsonValue | undefined): TaskTurnOutcome["contextUsage"] {
  if (!isObjectRecord(value) || typeof value.used !== "number") return null;
  return { used: value.used, size: typeof value.size === "number" ? value.size : null };
}

function isPerson(value: JsonValue): value is { id: string; name: string } {
  return isObjectRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}
