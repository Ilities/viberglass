import { projectSchema } from "../../../../api/middleware/schemas";

describe("projectSchema", () => {
  it("defaults ticketSystem to native when omitted", () => {
    const { error, value } = projectSchema.validate({
      name: "Viberglass",
    });

    expect(error).toBeUndefined();
    expect(value.ticketSystem).toBe("native");
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
