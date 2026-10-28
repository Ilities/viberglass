import { isObjectRecord } from "../src/clankerConfig";
import type { AgentSettingField } from "../src/agentSettings";

/**
 * Rejects a harness setting the runner form can't show as declared: a string input ignores
 * options and allowCustom, and a select without options renders an empty dropdown.
 * `raw` is the setting as the plugin declared it; `setting` is its parsed form.
 */
export function assertSettingRenderable(packageName: string, setting: AgentSettingField, raw: unknown): void {
  const declared = isObjectRecord(raw) ? raw : {};
  if (setting.type === "string") {
    if (declared.options !== undefined) {
      throw new Error(
        `Plugin ${packageName} setting '${setting.key}' is a string, which ignores options: use type "select" or remove options.`,
      );
    }
    if (declared.allowCustom !== undefined) {
      throw new Error(
        `Plugin ${packageName} setting '${setting.key}' is a string, which ignores allowCustom: use type "select" or remove allowCustom.`,
      );
    }
    return;
  }
  if (!setting.options || setting.options.length === 0) {
    throw new Error(
      `Plugin ${packageName} setting '${setting.key}' is a select with no options: add options or use type "string".`,
    );
  }
}
