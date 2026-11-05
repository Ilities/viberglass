import { ClawScheduleService } from "../../../../services/claw/ClawScheduleService";

const getTemplate = jest.fn();
const getProject = jest.fn();

jest.mock("../../../../persistence/claw/ClawTaskTemplateDAO", () => ({
  ClawTaskTemplateDAO: jest.fn().mockImplementation(() => ({ getTemplate })),
}));
jest.mock("../../../../persistence/project/ProjectDAO", () => ({
  ProjectDAO: jest.fn().mockImplementation(() => ({ getProject })),
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
