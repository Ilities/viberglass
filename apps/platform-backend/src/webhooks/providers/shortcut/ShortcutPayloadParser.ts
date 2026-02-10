import crypto from 'crypto';
import type {
  ParsedShortcutEvent,
  ShortcutCommentData,
  ShortcutStoryData,
  ShortcutWebhookObjectType,
  ShortcutWebhookPayload,
} from './shortcutTypes';
import { buildShortcutMetadata } from './shortcutMetadataBuilder';

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toShortcutStoryData(data: unknown): ShortcutStoryData | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  return data as ShortcutStoryData;
}

function toShortcutCommentData(data: unknown): ShortcutCommentData | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  return data as ShortcutCommentData;
}

function normalizeObjectType(
  objectType: unknown,
): ShortcutWebhookObjectType | undefined {
  if (objectType !== 'story' && objectType !== 'comment') {
    return undefined;
  }
  return objectType;
}

function normalizeAction(action: unknown): string | undefined {
  if (typeof action !== 'string') {
    return undefined;
  }

  const normalized = action.trim().toLowerCase();
  return normalized || undefined;
}

function mapShortcutEventType(
  objectType: ShortcutWebhookObjectType,
  action: string,
): string {
  const eventMap: Record<string, string> = {
    story_create: 'story_created',
    story_update: 'story_updated',
    story_delete: 'story_deleted',
    comment_create: 'comment_created',
    comment_update: 'comment_updated',
    comment_delete: 'comment_deleted',
  };

  return eventMap[`${objectType}_${action}`] || `${objectType}_${action}`;
}

function validatePayloadForSupportedEvent(
  eventType: string,
  payload: ShortcutWebhookPayload,
): void {
  if (eventType.startsWith('story_')) {
    const storyData = toShortcutStoryData(payload.data);
    if (!storyData?.id) {
      throw new Error("Missing required field 'data.id'");
    }
    if (eventType === 'story_created' && !toNonEmptyString(storyData.name)) {
      throw new Error("Missing required field 'data.name'");
    }
    return;
  }

  if (eventType.startsWith('comment_')) {
    const commentData = toShortcutCommentData(payload.data);
    if (!commentData?.id) {
      throw new Error("Missing required field 'data.id'");
    }
    if (!commentData?.story_id) {
      throw new Error("Missing required field 'data.story_id'");
    }
  }
}

function populateShortcutMetadata(
  payload: ShortcutWebhookPayload,
  metadata: ParsedShortcutEvent['metadata'],
): void {
  const storyData = toShortcutStoryData(payload.data);
  if (storyData?.id) {
    metadata.issueKey = String(storyData.id);
  }

  const projectId = storyData?.project_id || storyData?.project?.id;
  if (typeof projectId === 'number') {
    metadata.projectId = String(projectId);
  }

  const projectName = toNonEmptyString(storyData?.project?.name);
  if (projectName) {
    metadata.repositoryId = projectName;
  } else if (typeof projectId === 'number') {
    metadata.repositoryId = String(projectId);
  }

  const commentData = toShortcutCommentData(payload.data);
  if (commentData?.id) {
    metadata.commentId = String(commentData.id);
  }
  if (commentData?.story_id) {
    metadata.issueKey = String(commentData.story_id);
  }
}

function extractShortcutTimestamp(payload: ShortcutWebhookPayload): string {
  const storyData = toShortcutStoryData(payload.data);
  const commentData = toShortcutCommentData(payload.data);

  const candidate =
    toNonEmptyString(commentData?.updated_at) ||
    toNonEmptyString(commentData?.created_at) ||
    toNonEmptyString(storyData?.updated_at) ||
    toNonEmptyString(storyData?.created_at);

  return candidate || new Date().toISOString();
}

export class ShortcutPayloadParser {
  parse(
    payload: unknown,
    headers: Record<string, string>,
  ): ParsedShortcutEvent {
    if (!isRecord(payload)) {
      throw new Error('Shortcut payload must be a JSON object');
    }

    const data = payload as ShortcutWebhookPayload;
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

    const metadata = buildShortcutMetadata(payload);
    metadata.action = action;
    populateShortcutMetadata(data, metadata);

    const memberId = toNonEmptyString(data.member_id);
    if (memberId) {
      metadata.sender = memberId;
    }

    return {
      eventType,
      deduplicationId:
        headers['x-shortcut-delivery'] ||
        headers['x-request-id'] ||
        crypto.randomUUID(),
      timestamp: extractShortcutTimestamp(data),
      metadata,
    };
  }
}
