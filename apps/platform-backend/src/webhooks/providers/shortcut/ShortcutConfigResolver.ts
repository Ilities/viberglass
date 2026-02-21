import { isObjectRecord } from '@viberglass/types';
import type { WebhookProviderConfig } from '../../WebhookProvider';
import type { ShortcutOutboundSettings } from './shortcutTypes';
import {
  DEFAULT_FAILURE_LABEL,
  DEFAULT_SHORTCUT_API_BASE_URL,
  DEFAULT_SUCCESS_LABEL,
} from './shortcutTypes';

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
  const value = source[key];
  return typeof value === 'boolean' ? value : undefined;
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
  const root = isObjectRecord(labelMappings) ? labelMappings : undefined;
  const nestedShortcut = isObjectRecord(root?.shortcut) ? root.shortcut : undefined;
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
    const labelsMapping = isObjectRecord(mapping?.labels) ? mapping.labels : undefined;
    const workflowStatesMapping = isObjectRecord(mapping?.workflowStates)
      ? mapping.workflowStates
      : undefined;

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
