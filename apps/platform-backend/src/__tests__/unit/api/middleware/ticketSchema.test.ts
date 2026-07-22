import { ticketSchema } from "../../../../api/middleware/schemas";

describe("ticketSchema", () => {
  const baseTicket = {
    title: "Fix checkout",
    description: "The checkout button does not respond.",
    projectId: "26a3d280-94b2-4a66-8426-b16dc9745537",
  };

  it("defaults a normal submission to submitter-friendly optional details", () => {
    const result = ticketSchema.validate(baseTicket);

    expect(result.error).toBeUndefined();
    expect(result.value).toEqual(
      expect.objectContaining({
        severity: "medium",
        category: "General",
        annotations: [],
        autoFixRequested: false,
      }),
    );
  });

  it("requires an audit reason when a client skips Research", () => {
    const result = ticketSchema.validate({
      ...baseTicket,
      workflowPhase: "execution",
    });

    expect(result.error?.message).toContain("workflowOverrideReason");
  });

  it("accepts an explicit phase override reason", () => {
    const result = ticketSchema.validate({
      ...baseTicket,
      workflowPhase: "execution",
      workflowOverrideReason: "Production incident requires an immediate patch",
    });

    expect(result.error).toBeUndefined();
  });
});
