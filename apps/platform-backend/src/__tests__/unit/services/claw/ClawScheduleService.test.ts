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
