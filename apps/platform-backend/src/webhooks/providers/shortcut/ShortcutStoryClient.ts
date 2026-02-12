import type { AxiosInstance } from 'axios';
import type { ShortcutStory } from './shortcutTypes';

type ShortcutApiErrorHandler = (error: unknown, context: string) => never;

function normalizeLabelName(label: string): string {
  return label.trim().toLowerCase();
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function toStoryId(storyId: string): number {
  const parsed = Number.parseInt(storyId, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Shortcut story ID must be a positive integer: ${storyId}`);
  }
  return parsed;
}

function encodeStoryId(storyId: string): string {
  return String(toStoryId(storyId));
}

function mergeLabels(
  current: Array<{ name?: string }> | undefined,
  add: string[],
  remove: string[],
): string[] {
  const labelsByKey = new Map<string, string>();

  for (const label of current || []) {
    const value = toNonEmptyString(label.name);
    if (!value) {
      continue;
    }

    const key = normalizeLabelName(value);
    if (!labelsByKey.has(key)) {
      labelsByKey.set(key, value);
    }
  }

  for (const label of remove) {
    labelsByKey.delete(normalizeLabelName(label));
  }
  for (const label of add) {
    const normalized = normalizeLabelName(label);
    if (!labelsByKey.has(normalized)) {
      labelsByKey.set(normalized, label);
    }
  }

  return Array.from(labelsByKey.values());
}

export class ShortcutStoryClient {
  async postComment(
    client: AxiosInstance,
    storyId: string,
    body: string,
    onError: ShortcutApiErrorHandler,
  ): Promise<void> {
    const numericStoryId = toStoryId(storyId);

    try {
      await client.post('/comments', {
        story_id: numericStoryId,
        text: body,
      });
    } catch (error) {
      onError(error, `Failed to post Shortcut comment for story ${storyId}`);
    }
  }

  async updateLabels(
    client: AxiosInstance,
    storyId: string,
    add: string[],
    remove: string[],
    onError: ShortcutApiErrorHandler,
  ): Promise<void> {
    const encodedStoryId = encodeStoryId(storyId);

    try {
      const storyResponse = await client.get(`/stories/${encodedStoryId}`);
      const story = storyResponse.data as { labels?: Array<{ name?: string }> };
      const mergedLabels = mergeLabels(story.labels, add, remove);

      await client.put(`/stories/${encodedStoryId}`, {
        labels: mergedLabels.map((name) => ({ name })),
      });
    } catch (error) {
      onError(error, `Failed to update Shortcut labels for story ${storyId}`);
    }
  }

  async getStory(
    client: AxiosInstance,
    storyId: string,
    onError: ShortcutApiErrorHandler,
  ): Promise<ShortcutStory> {
    const encodedStoryId = encodeStoryId(storyId);

    try {
      const response = await client.get(`/stories/${encodedStoryId}`);
      const story = response.data as {
        id: number;
        name: string;
        description?: string;
        story_type: string;
        workflow_state?: { name?: string };
        labels?: Array<{ name?: string }>;
        app_url?: string;
      };

      return {
        id: story.id,
        name: story.name,
        description: story.description,
        story_type: story.story_type,
        state: story.workflow_state?.name || '',
        labels: (story.labels || [])
          .map((label) => toNonEmptyString(label.name))
          .filter((label): label is string => Boolean(label)),
        url: story.app_url || '',
      };
    } catch (error) {
      onError(error, `Failed to fetch Shortcut story ${storyId}`);
    }
  }

  async updateStoryState(
    client: AxiosInstance,
    storyId: string,
    workflowStateId: number,
    onError: ShortcutApiErrorHandler,
  ): Promise<void> {
    const encodedStoryId = encodeStoryId(storyId);
    if (!Number.isInteger(workflowStateId) || workflowStateId <= 0) {
      throw new Error(`Shortcut workflowStateId must be a positive integer: ${workflowStateId}`);
    }

    try {
      await client.put(`/stories/${encodedStoryId}`, {
        workflow_state_id: workflowStateId,
      });
    } catch (error) {
      onError(error, `Failed to update Shortcut workflow state for story ${storyId}`);
    }
  }

  async addOwner(
    client: AxiosInstance,
    storyId: string,
    memberId: string,
    onError: ShortcutApiErrorHandler,
  ): Promise<void> {
    const encodedStoryId = encodeStoryId(storyId);

    try {
      const storyResponse = await client.get(`/stories/${encodedStoryId}`);
      const currentOwners = (storyResponse.data as { owner_ids?: string[] }).owner_ids || [];

      if (!currentOwners.includes(memberId)) {
        await client.put(`/stories/${encodedStoryId}`, {
          owner_ids: [...currentOwners, memberId],
        });
      }
    } catch (error) {
      onError(error, `Failed to add owner to Shortcut story ${storyId}`);
    }
  }
}
