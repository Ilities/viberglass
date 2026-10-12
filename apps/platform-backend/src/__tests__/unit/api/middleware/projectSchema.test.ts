import { projectSchema, setupSpaceSchema, updateProjectSchema } from "../../../../api/middleware/schemas";

describe("projectSchema", () => {
  it("accepts Files backing but rejects unknown backing kinds", () => {
    expect(projectSchema.validate({ name: "Slides", backingKind: "files" }).error).toBeUndefined();
    expect(projectSchema.validate({ name: "Slides", backingKind: "notion" }).error).toBeDefined();
  });

  it("does not allow changing backing after creation", () => {
    expect(updateProjectSchema.validate({ backingKind: "files" }).error).toBeDefined();
  });

  it("requires a repository for Git setup and forbids it for Files setup", () => {
    expect(setupSpaceSchema.validate({ name: "Slides", backingKind: "files" }).error).toBeUndefined();
    expect(setupSpaceSchema.validate({ name: "Web" }).error).toBeDefined();
    expect(setupSpaceSchema.validate({ name: "Slides", backingKind: "files", repository: "acme/web" }).error).toBeDefined();
    expect(setupSpaceSchema.validate({ name: "Slides", backingKind: "files", baseBranch: "main" }).error).toBeDefined();
  });
  it("defaults ticketSystem to native when omitted", () => {
    const { error, value } = projectSchema.validate({
      name: "Viberglass",
    });

    expect(error).toBeUndefined();
    expect(value.ticketSystem).toBe("native");
    expect(value.backingKind).toBe("git");
  });

  it("keeps explicit ticketSystem when provided", () => {
    const { error, value } = projectSchema.validate({
      name: "Viberglass",
      ticketSystem: "jira",
    });

    expect(error).toBeUndefined();
    expect(value.ticketSystem).toBe("jira");
  });
});
