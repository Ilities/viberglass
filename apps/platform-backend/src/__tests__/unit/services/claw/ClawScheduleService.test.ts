import { ClawScheduleService } from "../../../../services/claw/ClawScheduleService";

const getTemplate = jest.fn();
const getProject = jest.fn();
const getBackup = jest.fn();

jest.mock("../../../../persistence/claw/ClawTaskTemplateDAO", () => ({
  ClawTaskTemplateDAO: jest.fn().mockImplementation(() => ({ getTemplate })),
}));
jest.mock("../../../../persistence/project/ProjectDAO", () => ({
  ProjectDAO: jest.fn().mockImplementation(() => ({ getProject })),
}));
jest.mock("../../../../persistence/apps/AppDataBackupDAO", () => ({
  AppDataBackupDAO: jest.fn().mockImplementation(() => ({ getById: getBackup })),
}));
jest.mock("../../../../persistence/claw/ClawScheduleDAO", () => ({
  ClawScheduleDAO: jest.fn().mockImplementation(() => ({})),
}));

describe("ClawScheduleService.createSchedule", () => {
  it("refuses a template from another space as if it didn't exist", async () => {
    getProject.mockResolvedValue({ id: "space-a" });
    getTemplate.mockResolvedValue({ id: "template-1", projectId: "space-b" });

    await expect(
      new ClawScheduleService().createSchedule({
        projectId: "space-a",
        taskTemplateId: "template-1",
        name: "Weekly",
        scheduleType: "interval",
        intervalExpression: "1w",
      }),
    ).rejects.toThrow("Task template not found");
  });
});

describe("ClawScheduleService.createSchedule with an app action", () => {
  const createSchedule = jest.fn();
  const getScheduleByProjectAndName = jest.fn();

  beforeEach(() => {
    const { ClawScheduleDAO } = jest.requireMock("../../../../persistence/claw/ClawScheduleDAO");
    ClawScheduleDAO.mockImplementation(() => ({ createSchedule, getScheduleByProjectAndName }));
    getScheduleByProjectAndName.mockResolvedValue(null);
    createSchedule.mockReset().mockImplementation(async (request) => ({ id: "schedule-1", ...request }));
    getTemplate.mockReset();
  });

  const nightly = { projectId: "space-a", action: "app_stop" as const, name: "Off at night", scheduleType: "cron" as const, cronExpression: "0 0 22 * * *" };

  it("needs no template in an App space", async () => {
    getProject.mockResolvedValue({ id: "space-a", backingKind: "app" });

    await expect(new ClawScheduleService().createSchedule(nightly)).resolves.toMatchObject({ action: "app_stop" });
    expect(getTemplate).not.toHaveBeenCalled();
  });

  it("refuses it outside App spaces", async () => {
    getProject.mockResolvedValue({ id: "space-a", backingKind: "git" });

    await expect(new ClawScheduleService().createSchedule(nightly)).rejects.toMatchObject({ code: "NOT_AN_APP_SPACE", statusCode: 400 });
    expect(createSchedule).not.toHaveBeenCalled();
  });
});

describe("ClawScheduleService.createSchedule restoring app data", () => {
  const createSchedule = jest.fn();

  beforeEach(() => {
    const { ClawScheduleDAO } = jest.requireMock("../../../../persistence/claw/ClawScheduleDAO");
    ClawScheduleDAO.mockImplementation(() => ({ createSchedule, getScheduleByProjectAndName: jest.fn(async () => null) }));
    createSchedule.mockReset().mockImplementation(async (request) => ({ id: "schedule-1", ...request }));
    getProject.mockResolvedValue({ id: "space-a", backingKind: "app" });
  });

  const hourly = {
    projectId: "space-a",
    action: "app_restore_data" as const,
    backupId: "backup-1",
    name: "Reset the demo",
    scheduleType: "interval" as const,
    intervalExpression: "1h",
  };

  it("points at a backup of the same space's app", async () => {
    getBackup.mockResolvedValue({ id: "backup-1", projectId: "space-a" });

    await expect(new ClawScheduleService().createSchedule(hourly)).resolves.toMatchObject({ action: "app_restore_data", backupId: "backup-1" });
    expect(getBackup).toHaveBeenCalledWith("backup-1");
  });

  it("treats another space's backup as missing", async () => {
    getBackup.mockResolvedValue({ id: "backup-1", projectId: "space-b" });

    await expect(new ClawScheduleService().createSchedule(hourly)).rejects.toMatchObject({ code: "BACKUP_NOT_FOUND", statusCode: 404 });
    expect(createSchedule).not.toHaveBeenCalled();
  });

  it("needs a backup", async () => {
    await expect(new ClawScheduleService().createSchedule({ ...hourly, backupId: null })).rejects.toMatchObject({ code: "BACKUP_NOT_FOUND" });
  });

  it("refuses it outside App spaces", async () => {
    getProject.mockResolvedValue({ id: "space-a", backingKind: "files" });

    await expect(new ClawScheduleService().createSchedule(hourly)).rejects.toMatchObject({ code: "NOT_AN_APP_SPACE" });
  });
});
