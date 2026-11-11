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

  it("keeps what the browser extension captured, failed requests with their method included", () => {
    const metadata = {
      capturedBy: "browser-extension",
      failedRequests: [
        { method: "POST", url: "http://localhost:5173/api/billing/checkout", status: 402, timestamp: "2026-11-11T17:00:00Z" },
        { method: "GET", url: "http://localhost:5173/logo.png", error: "net::ERR_CONNECTION_REFUSED", timestamp: "2026-11-11T17:00:01Z" },
      ],
      timestamp: "2026-11-11T17:00:02Z",
      timezone: "Europe/Helsinki",
    };

    const result = ticketSchema.validate({ ...baseTicket, metadata });

    expect(result.error).toBeUndefined();
    expect(result.value.metadata.capturedBy).toBe("browser-extension");
    expect(result.value.metadata.failedRequests.map((request: { method: string }) => request.method)).toEqual(["POST", "GET"]);
  });

  it("takes no starting phase: a task's phase follows what it has produced", () => {
    const result = ticketSchema.validate({ ...baseTicket, workflowPhase: "execution" });

    expect(result.error?.message).toContain("workflowPhase");
  });
});
