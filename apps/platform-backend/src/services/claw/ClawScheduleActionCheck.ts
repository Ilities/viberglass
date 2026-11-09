import { isAppScheduleAction, type CreateClawScheduleRequest, type Project } from "@viberglass/types";
import { AppDataBackupDAO } from "../../persistence/apps/AppDataBackupDAO";
import { ClawTaskTemplateDAO } from "../../persistence/claw/ClawTaskTemplateDAO";
import { CLAW_SERVICE_ERROR_CODE, ClawServiceError } from "../errors/ClawServiceError";

/**
 * What a new schedule does has to belong to its space: a task template of the
 * space, or, in an App space, its app, with a backup of that app's data to restore.
 * One from another space is treated as missing, so its existence isn't revealed.
 */
export class ClawScheduleActionCheck {
  constructor(
    private readonly templates: Pick<ClawTaskTemplateDAO, "getTemplate"> = new ClawTaskTemplateDAO(),
    private readonly backups: Pick<AppDataBackupDAO, "getById"> = new AppDataBackupDAO(),
  ) {}

  async assertFits(request: CreateClawScheduleRequest, project: Pick<Project, "id" | "backingKind">): Promise<void> {
    const action = request.action ?? "run_template";
    if (!isAppScheduleAction(action)) {
      const template = request.taskTemplateId ? await this.templates.getTemplate(request.taskTemplateId) : null;
      if (!template || template.projectId !== project.id) {
        throw new ClawServiceError(CLAW_SERVICE_ERROR_CODE.TEMPLATE_NOT_FOUND, "Task template not found");
      }
      return;
    }
    if (project.backingKind !== "app") {
      throw new ClawServiceError(CLAW_SERVICE_ERROR_CODE.NOT_AN_APP_SPACE, "Only App spaces have an app to schedule");
    }
    if (action !== "app_restore_data") return;
    const backup = request.backupId ? await this.backups.getById(request.backupId) : null;
    if (!backup || backup.projectId !== project.id) {
      throw new ClawServiceError(CLAW_SERVICE_ERROR_CODE.BACKUP_NOT_FOUND, "Backup not found");
    }
  }
}
