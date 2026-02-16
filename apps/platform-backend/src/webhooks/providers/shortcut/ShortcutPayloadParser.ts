import crypto from "crypto";
import type {
  ParsedShortcutEvent,
  ShortcutWebhookObjectType,
  ShortcutWebhookPayload,
} from "./shortcutTypes";
import { buildShortcutMetadata } from "./shortcutMetadataBuilder";

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return value;
}

function toInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function toIdentifier(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return toNonEmptyString(value);
}

function getNestedRecord(
  source: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  if (!source) {
    return undefined;
  }
  return toRecord(source[key]);
}

function getFirstAction(
  source: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const actions = source.actions;
  if (!Array.isArray(actions) || actions.length === 0) {
    return undefined;
  }
  return toRecord(actions[0]);
}

function parseNestedPayload(
  value: unknown,
): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  try {
    return toRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function unwrapShortcutPayload(
  payload: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  if (depth >= 3) {
    return payload;
  }

  const nestedPayload = parseNestedPayload(payload.payload);
  if (!nestedPayload) {
    return payload;
  }

  return unwrapShortcutPayload(nestedPayload, depth + 1);
}

function normalizeEventTypeToken(eventType: string): string {
  return eventType
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function objectTypeFromEventType(
  eventType: string,
): ShortcutWebhookObjectType | undefined {
  const normalized = normalizeEventTypeToken(eventType);
  if (normalized.includes("comment")) {
    return "comment";
  }
  if (normalized.includes("story")) {
    return "story";
  }
  return undefined;
}

function actionFromEventType(eventType: string): string | undefined {
  const normalized = normalizeEventTypeToken(eventType);
  if (normalized.includes("create")) {
    return "create";
  }
  if (normalized.includes("update") || normalized.includes("change")) {
    return "update";
  }
  if (normalized.includes("delete") || normalized.includes("remove")) {
    return "delete";
  }
  return undefined;
}

function normalizeObjectType(
  objectType: unknown,
): ShortcutWebhookObjectType | undefined {
  if (objectType !== "story" && objectType !== "comment") {
    return undefined;
  }
  return objectType;
}

function normalizeAction(action: unknown): string | undefined {
  const raw = toNonEmptyString(action);
  if (!raw) {
    return undefined;
  }

  const normalized = raw.toLowerCase();
  switch (normalized) {
    case "created":
      return "create";
    case "updated":
      return "update";
    case "deleted":
      return "delete";
    default:
      return normalized;
  }
}

function mapShortcutEventType(
  objectType: ShortcutWebhookObjectType,
  action: string,
): string {
  const eventMap: Record<string, string> = {
    story_create: "story_created",
    story_update: "story_updated",
    story_delete: "story_deleted",
    comment_create: "comment_created",
    comment_update: "comment_updated",
    comment_delete: "comment_deleted",
  };

  return eventMap[`${objectType}_${action}`] || `${objectType}_${action}`;
}

function validatePayloadForSupportedEvent(
  eventType: string,
  payload: ShortcutWebhookPayload,
): void {
  const data = toRecord(payload.data);
  if (eventType.startsWith("story_")) {
    if (!toIdentifier(data?.id)) {
      throw new Error("Missing required field 'data.id'");
    }
    if (eventType === "story_created" && !toNonEmptyString(data?.name)) {
      throw new Error("Missing required field 'data.name'");
    }
    return;
  }

  if (eventType.startsWith("comment_")) {
    if (!toIdentifier(data?.id)) {
      throw new Error("Missing required field 'data.id'");
    }
    if (!toIdentifier(data?.story_id)) {
      throw new Error("Missing required field 'data.story_id'");
    }
  }
}

function populateShortcutMetadata(
  payload: ShortcutWebhookPayload,
  metadata: ParsedShortcutEvent["metadata"],
): void {
  const data = toRecord(payload.data);
  const entityId = toIdentifier(data?.id);
  const relatedStoryId = toIdentifier(data?.story_id);

  if (entityId) {
    metadata.issueKey = entityId;
  }

  const project = getNestedRecord(data, "project");
  const projectId = toIdentifier(data?.project_id) || toIdentifier(project?.id);
  if (projectId) {
    metadata.projectId = projectId;
  }

  const projectName = toNonEmptyString(project?.name);
  if (projectName) {
    metadata.repositoryId = projectName;
  } else if (projectId) {
    metadata.repositoryId = projectId;
  }

  if (relatedStoryId) {
    metadata.issueKey = relatedStoryId;
  }
  if (relatedStoryId && entityId) {
    metadata.commentId = entityId;
  }
}

function extractShortcutTimestamp(payload: ShortcutWebhookPayload): string {
  const data = toRecord(payload.data);

  const candidate =
    toNonEmptyString(data?.updated_at) || toNonEmptyString(data?.created_at);

  return candidate || new Date().toISOString();
}

function normalizeRefs(
  value: unknown,
): ShortcutWebhookPayload["refs"] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  type ShortcutRef = { id?: number; entity_type?: string };
  const refs = value
    .map((ref): ShortcutRef | undefined => {
      const record = toRecord(ref);
      if (!record) {
        return undefined;
      }

      const id = toInteger(record.id);
      const entityType = toNonEmptyString(record.entity_type);
      if (typeof id === "undefined" && !entityType) {
        return undefined;
      }

      return {
        id,
        entity_type: entityType,
      };
    })
    .filter((ref): ref is ShortcutRef => typeof ref !== "undefined");

  return refs.length > 0 ? refs : undefined;
}

function normalizeChangedFields(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const fields = value
    .map((field) => toNonEmptyString(field))
    .filter((field): field is string => Boolean(field));

  return fields.length > 0 ? fields : undefined;
}

function extractChangedFieldValue(value: unknown): unknown {
  const record = toRecord(value);
  if (!record) {
    return value;
  }

  if (Object.prototype.hasOwnProperty.call(record, "new")) {
    return record.new;
  }
  if (Object.prototype.hasOwnProperty.call(record, "after")) {
    return record.after;
  }
  if (Object.prototype.hasOwnProperty.call(record, "to")) {
    return record.to;
  }
  if (Object.prototype.hasOwnProperty.call(record, "value")) {
    return record.value;
  }

  return value;
}

function applyChangedFields(
  data: Record<string, unknown> | undefined,
  source: Record<string, unknown>,
  actionRecord: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const changes =
    getNestedRecord(actionRecord, "changes") || getNestedRecord(source, "changes");
  if (!changes) {
    return data;
  }

  const changedFieldNames = new Set<string>([
    ...Object.keys(changes),
    ...(normalizeChangedFields(source.changed_fields) || []),
    ...(normalizeChangedFields(source.changedFields) || []),
    ...(normalizeChangedFields(actionRecord?.changed_fields) || []),
    ...(normalizeChangedFields(actionRecord?.changedFields) || []),
  ]);

  if (changedFieldNames.size === 0) {
    return data;
  }

  const mergedData: Record<string, unknown> = { ...(data || {}) };
  for (const field of changedFieldNames) {
    const candidateValue = extractChangedFieldValue(changes[field]);
    if (typeof candidateValue !== "undefined") {
      mergedData[field] = candidateValue;
    }
  }

  return mergedData;
}

function resolveData(
  source: Record<string, unknown>,
  objectType: ShortcutWebhookObjectType | undefined,
  actionRecord: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const data = getNestedRecord(source, "data");
  if (data) {
    return data;
  }

  const actionData = getNestedRecord(actionRecord, "data");
  if (actionData) {
    return actionData;
  }

  const actionId = toIdentifier(actionRecord?.id);
  const actionStoryId = toIdentifier(actionRecord?.story_id);
  if (actionRecord && (actionId || actionStoryId)) {
    return actionRecord;
  }

  if (objectType === "comment") {
    return getNestedRecord(source, "comment");
  }

  if (objectType === "story") {
    return getNestedRecord(source, "story");
  }

  return getNestedRecord(source, "story") || getNestedRecord(source, "comment");
}

function normalizeShortcutPayload(sourcePayload: Record<string, unknown>): {
  source: Record<string, unknown>;
  payload: ShortcutWebhookPayload;
} {
  const source = unwrapShortcutPayload(sourcePayload);
  const actionRecord = getFirstAction(source);
  const eventType =
    toNonEmptyString(source.event_type) ||
    toNonEmptyString(source.eventType) ||
    toNonEmptyString(actionRecord?.event_type) ||
    toNonEmptyString(actionRecord?.eventType);

  const objectType =
    normalizeObjectType(source.object_type) ||
    normalizeObjectType(source.entity_type) ||
    normalizeObjectType(actionRecord?.object_type) ||
    normalizeObjectType(actionRecord?.entity_type) ||
    (eventType ? objectTypeFromEventType(eventType) : undefined);

  const action =
    normalizeAction(source.action) ||
    normalizeAction(actionRecord?.action) ||
    (eventType ? actionFromEventType(eventType) : undefined);
  const changedFields =
    normalizeChangedFields(source.changed_fields) ||
    normalizeChangedFields(source.changedFields) ||
    normalizeChangedFields(actionRecord?.changed_fields) ||
    normalizeChangedFields(actionRecord?.changedFields);
  const resolvedData = resolveData(source, objectType, actionRecord);
  const normalizedData = applyChangedFields(resolvedData, source, actionRecord);

  return {
    source,
    payload: {
      id: toNonEmptyString(source.id),
      event_type: eventType,
      object_type: objectType,
      action,
      member_id:
        toNonEmptyString(source.member_id) || toNonEmptyString(source.memberId),
      data: normalizedData || resolvedData,
      refs: normalizeRefs(source.refs) || normalizeRefs(source.references),
      changed_fields: changedFields,
    },
  };
}

export class ShortcutPayloadParser {
  parse(
    payload: unknown,
    headers: Record<string, string>,
  ): ParsedShortcutEvent {
    if (!isRecord(payload)) {
      throw new Error("Shortcut payload must be a JSON object");
    }

    const normalized = normalizeShortcutPayload(payload);
    const data = normalized.payload;
    const objectType = normalizeObjectType(data.object_type);
    const action = normalizeAction(data.action);
    if (!objectType) {
      throw new Error("Missing required field 'object_type'");
    }
    if (!action) {
      throw new Error("Missing required field 'action'");
    }

    const eventType = mapShortcutEventType(objectType, action);
    validatePayloadForSupportedEvent(eventType, data);

    const metadata = buildShortcutMetadata(normalized.source);
    metadata.action = action;
    populateShortcutMetadata(data, metadata);

    const memberId = toNonEmptyString(data.member_id);
    if (memberId) {
      metadata.sender = memberId;
    }

    return {
      eventType,
      deduplicationId:
        headers["x-shortcut-delivery"] ||
        headers["x-request-id"] ||
        crypto.randomUUID(),
      timestamp: extractShortcutTimestamp(data),
      metadata,
      payload: data,
    };
  }
}
