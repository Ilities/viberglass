import { projectSchema } from "../../../../api/middleware/schemas";

describe("projectSchema", () => {
  it("defaults ticketSystem to custom when omitted", () => {
    const { error, value } = projectSchema.validate({
      name: "Viberglass",
    });

    expect(error).toBeUndefined();
    expect(value.ticketSystem).toBe("custom");
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
