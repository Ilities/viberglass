import { approvePermissionRequest } from "../src/acp/permissionReply";

function request(options: unknown[]) {
  return { sessionId: "sess_1", toolCall: { toolCallId: "call_1" }, options };
}

describe("approvePermissionRequest", () => {
  it("selects the harness's allow-once option by kind, whatever its id", () => {
    // OpenCode's option ids.
    const params = request([
      { optionId: "once", name: "Allow once", kind: "allow_once" },
      { optionId: "always", name: "Always allow", kind: "allow_always" },
      { optionId: "reject", name: "Reject", kind: "reject_once" },
    ]);

    expect(approvePermissionRequest(params)).toEqual({
      outcome: { outcome: "selected", optionId: "once" },
    });
  });

  it("falls back to allow-always when allow-once isn't offered", () => {
    const params = request([
      { optionId: "reject", name: "Reject", kind: "reject_once" },
      { optionId: "allow-always", name: "Always allow", kind: "allow_always" },
    ]);

    expect(approvePermissionRequest(params)).toEqual({
      outcome: { outcome: "selected", optionId: "allow-always" },
    });
  });

  it("cancels when no option allows the call", () => {
    const params = request([{ optionId: "reject", name: "Reject", kind: "reject_once" }]);

    expect(approvePermissionRequest(params)).toEqual({ outcome: { outcome: "cancelled" } });
  });

  it("cancels on a request without options", () => {
    expect(approvePermissionRequest({})).toEqual({ outcome: { outcome: "cancelled" } });
    expect(approvePermissionRequest(null)).toEqual({ outcome: { outcome: "cancelled" } });
  });
});
