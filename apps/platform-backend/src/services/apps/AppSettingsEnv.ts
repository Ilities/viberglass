import type { AppHostTarget, AppSecretRef } from "@viberglass/types";
import type { AppSettingDAO } from "../../persistence/apps/AppSettingDAO";
import type { SecretMetadata } from "../SecretService";

export interface AppSettingsForInstance {
  env: Record<string, string>;
  secretRefs: AppSecretRef[];
}

/**
 * An instance's settings: the live app gets all of them, a preview its plain
 * ones and the secrets marked for previews. On ECS secrets stay references to
 * their SSM parameters, so their values never appear in a task definition.
 */
export class AppSettingsEnv {
  constructor(
    private readonly settings: Pick<AppSettingDAO, "list">,
    private readonly secrets: {
      getSecret(id: string): Promise<Pick<SecretMetadata, "secretLocation" | "secretPath"> | null>;
      resolveSecretValues(ids: string[]): Promise<Map<string, string>>;
    },
  ) {}

  async forInstance(projectId: string, preview: boolean, target: AppHostTarget): Promise<AppSettingsForInstance> {
    const env: Record<string, string> = {};
    const secretSettings: Array<{ name: string; secretId: string }> = [];
    for (const setting of await this.settings.list(projectId)) {
      if (setting.value !== null) env[setting.name] = setting.value;
      else if (setting.secretId && (!preview || setting.forPreviews)) secretSettings.push({ name: setting.name, secretId: setting.secretId });
    }
    if (target === "ecs") return { env, secretRefs: await this.references(secretSettings) };

    const values = await this.secrets.resolveSecretValues(secretSettings.map((setting) => setting.secretId));
    for (const setting of secretSettings) {
      const value = values.get(setting.secretId);
      if (value !== undefined) env[setting.name] = value;
    }
    return { env, secretRefs: [] };
  }

  private async references(secretSettings: Array<{ name: string; secretId: string }>): Promise<AppSecretRef[]> {
    const refs: AppSecretRef[] = [];
    for (const setting of secretSettings) {
      const secret = await this.secrets.getSecret(setting.secretId);
      if (secret?.secretLocation !== "ssm" || !secret.secretPath) {
        throw new Error(`The secret setting ${setting.name} isn't kept in SSM, so the app can't read it on ECS. Set it again to move it there.`);
      }
      refs.push({ name: setting.name, ssmParameter: secret.secretPath });
    }
    return refs;
  }
}
