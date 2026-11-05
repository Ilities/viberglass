import { APP_SETTING_VALUE_MAX_BYTES, appSettingNameProblem, type AppSettingsView, type SaveAppSettingRequest } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppDAO } from "../../persistence/apps/AppDAO";
import type { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import type { AppSettingDAO, AppSettingRecord } from "../../persistence/apps/AppSettingDAO";
import type { AppSpaceDAO, AppSpaceRef } from "../../persistence/apps/AppSpaceDAO";
import type { SecretInput, SecretUpdate } from "../SecretService";
import type { AppReconciler } from "./AppReconciler";
import type { AppSettingSecretStorage } from "./appSettingSecretStorage";
import { AppSpaceError } from "./AppSpaceError";

const logger = createChildLogger({ service: "AppSettingsService" });

/**
 * The values an App space's maintainers set for its app. Secret ones live in
 * the secret store and are never shown again. A change restarts the running
 * app, so it reads the new values.
 */
export class AppSettingsService {
  constructor(
    private readonly spaces: Pick<AppSpaceDAO, "findById">,
    private readonly settings: Pick<AppSettingDAO, "list" | "get" | "put" | "delete">,
    private readonly secrets: {
      createSecret(input: SecretInput): Promise<{ id: string }>;
      updateSecret(id: string, updates: SecretUpdate): Promise<unknown>;
      deleteSecret(id: string): Promise<boolean>;
    },
    private readonly releases: Pick<AppReleaseDAO, "declaredSettings">,
    private readonly apps: Pick<AppDAO, "get" | "requestRestart">,
    private readonly reconciler: Pick<AppReconciler, "reconcile">,
    private readonly secretStorage: (projectId: string, name: string) => AppSettingSecretStorage,
  ) {}

  async view(projectId: string): Promise<AppSettingsView> {
    await this.appSpace(projectId);
    const [settings, app] = await Promise.all([this.settings.list(projectId), this.apps.get(projectId)]);
    const declared = await this.releases.declaredSettings(projectId, app?.currentReleaseId ?? null);
    const set = new Set(settings.map((setting) => setting.name));
    return {
      settings: settings.map((setting) => ({
        name: setting.name,
        secret: setting.secretId !== null,
        value: setting.value,
        forPreviews: setting.secretId === null || setting.forPreviews,
        updatedAt: setting.updatedAt.toISOString(),
      })),
      declared,
      missing: declared.filter((setting) => !set.has(setting.name)).map((setting) => setting.name),
    };
  }

  async save(projectId: string, name: string, request: SaveAppSettingRequest, actorId: string): Promise<AppSettingsView> {
    const space = await this.appSpace(projectId);
    const problem = appSettingNameProblem(name);
    if (problem) throw new AppSpaceError("SETTING_INVALID", problem);
    if (request.value !== undefined && Buffer.byteLength(request.value, "utf8") > APP_SETTING_VALUE_MAX_BYTES) {
      throw new AppSpaceError("SETTING_INVALID", `A setting's value can be at most ${APP_SETTING_VALUE_MAX_BYTES} bytes.`);
    }
    const existing = await this.settings.get(projectId, name);
    if (request.secret) await this.saveSecret(space, name, request, existing, actorId);
    else await this.savePlain(projectId, name, request, existing, actorId);
    await this.restart(projectId);
    return this.view(projectId);
  }

  async remove(projectId: string, name: string): Promise<AppSettingsView> {
    await this.appSpace(projectId);
    const existing = await this.settings.get(projectId, name);
    if (!existing) throw new AppSpaceError("SETTING_NOT_FOUND", `The app has no setting called ${name}.`);
    await this.settings.delete(projectId, name);
    if (existing.secretId) await this.secrets.deleteSecret(existing.secretId);
    await this.restart(projectId);
    return this.view(projectId);
  }

  private async saveSecret(space: AppSpaceRef, name: string, request: SaveAppSettingRequest, existing: AppSettingRecord | null, actorId: string): Promise<void> {
    const forPreviews = request.forPreviews ?? existing?.forPreviews ?? false;
    if (existing?.secretId) {
      if (request.value !== undefined) await this.secrets.updateSecret(existing.secretId, { secretValue: request.value });
      await this.settings.put(space.projectId, name, { value: null, secretId: existing.secretId, forPreviews, updatedBy: actorId });
      return;
    }
    if (request.value === undefined) throw new AppSpaceError("SETTING_INVALID", "Give the secret a value.");
    const created = await this.secrets.createSecret({
      name: `${space.name} · ${name}`,
      purpose: "app_setting",
      ...this.secretStorage(space.projectId, name),
      secretValue: request.value,
    });
    try {
      await this.settings.put(space.projectId, name, { value: null, secretId: created.id, forPreviews, updatedBy: actorId });
    } catch (error) {
      await this.secrets.deleteSecret(created.id).catch(() => false);
      throw error;
    }
  }

  private async savePlain(projectId: string, name: string, request: SaveAppSettingRequest, existing: AppSettingRecord | null, actorId: string): Promise<void> {
    if (request.value === undefined) throw new AppSpaceError("SETTING_INVALID", "Give the setting a value.");
    await this.settings.put(projectId, name, { value: request.value, secretId: null, forPreviews: false, updatedBy: actorId });
    // After the row stops pointing at it: deleting the secret would take the row with it.
    if (existing?.secretId) await this.secrets.deleteSecret(existing.secretId);
  }

  private async restart(projectId: string): Promise<void> {
    await this.apps.requestRestart(projectId);
    this.reconciler.reconcile(projectId).catch((error: unknown) => {
      logger.error("Restarting an app with its new settings failed", { projectId, error: error instanceof Error ? error.message : String(error) });
    });
  }

  private async appSpace(projectId: string): Promise<AppSpaceRef> {
    const space = await this.spaces.findById(projectId);
    if (!space) throw new AppSpaceError("NOT_AN_APP_SPACE", "This space has no app.");
    return space;
  }
}
