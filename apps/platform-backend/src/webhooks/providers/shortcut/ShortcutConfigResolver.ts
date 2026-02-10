import type { WebhookProviderConfig } from '../../WebhookProvider';
import type { ShortcutOutboundSettings } from './shortcutTypes';
import {
  DEFAULT_FAILURE_LABEL,
  DEFAULT_SHORTCUT_API_BASE_URL,
  DEFAULT_SUCCESS_LABEL,
} from './shortcutTypes';

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function readString(
  source: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!source) {
    return undefined;
  }
  return toNonEmptyString(source[key]);
}

function readBoolean(
  source: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  if (!source) {
    return undefined;
  }
  return typeof source[key] === 'boolean' ? (source[key] as boolean) : undefined;
}

function readInteger(
  source: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  if (!source) {
    return undefined;
  }

  const value = source[key];
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function getProviderLabelMappings(
  labelMappings: WebhookProviderConfig['labelMappings'],
): Record<string, unknown> | undefined {
  const root = toRecord(labelMappings);
  const nestedShortcut = toRecord(root?.shortcut);
  return nestedShortcut || root;
}

export class ShortcutConfigResolver {
  resolveApiBaseUrl(config: WebhookProviderConfig): string {
    const labelMappings = getProviderLabelMappings(config.labelMappings);
    return (
      config.apiBaseUrl ||
      readString(labelMappings, 'apiBaseUrl') ||
      DEFAULT_SHORTCUT_API_BASE_URL
    );
  }

  resolveOutboundSettings(config: WebhookProviderConfig): ShortcutOutboundSettings {
    const mapping = getProviderLabelMappings(config.labelMappings);
    const labelsMapping = toRecord(mapping?.labels);
    const workflowStatesMapping = toRecord(mapping?.workflowStates);

    const updateLabels = readBoolean(mapping, 'updateLabels');
    const skipLabelUpdates =
      readBoolean(mapping, 'skipLabelUpdates') ??
      (typeof updateLabels === 'boolean' ? !updateLabels : false);

    return {
      successLabel:
        readString(mapping, 'successLabel') ||
        readString(labelsMapping, 'success') ||
        DEFAULT_SUCCESS_LABEL,
      failureLabel:
        readString(mapping, 'failureLabel') ||
        readString(labelsMapping, 'failure') ||
        DEFAULT_FAILURE_LABEL,
      skipLabelUpdates,
      successWorkflowStateId:
        readInteger(mapping, 'successWorkflowStateId') ||
        readInteger(workflowStatesMapping, 'successId') ||
        readInteger(workflowStatesMapping, 'success'),
      failureWorkflowStateId:
        readInteger(mapping, 'failureWorkflowStateId') ||
        readInteger(workflowStatesMapping, 'failureId') ||
        readInteger(workflowStatesMapping, 'failure'),
    };
  }
}
