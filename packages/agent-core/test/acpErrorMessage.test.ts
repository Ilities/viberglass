import { acpErrorMessage } from "../src/acp/acpErrorMessage";

describe("acpErrorMessage", () => {
  it("adds the cause an ACP SDK server puts in data.details", () => {
    // Qwen Code's report of a model provider rejecting the key.
    const error = { code: -32603, message: "Internal error", data: { details: "401 Incorrect API key provided." } };
    expect(acpErrorMessage(error)).toBe("Internal error: 401 Incorrect API key provided.");
  });

  it("adds a string or a message in data", () => {
    expect(acpErrorMessage({ message: "Internal error", data: "Session not found" })).toBe("Internal error: Session not found");
    expect(acpErrorMessage({ message: "Internal error", data: { message: "Quota exceeded" } })).toBe("Internal error: Quota exceeded");
  });

  it("keeps the message alone when data adds nothing", () => {
    expect(acpErrorMessage({ message: "Authentication required", data: {} })).toBe("Authentication required");
    expect(acpErrorMessage({ message: "Prompt is too long", data: "Prompt is too long" })).toBe("Prompt is too long");
  });

  it("says it was an ACP error when the error has no message", () => {
    expect(acpErrorMessage("boom")).toBe("ACP error");
  });
});
