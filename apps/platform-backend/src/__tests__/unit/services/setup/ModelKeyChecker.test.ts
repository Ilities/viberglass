import { ModelKeyChecker } from "../../../../services/setup/ModelKeyChecker";
import { SETUP_SERVICE_ERROR_CODE } from "../../../../services/errors/SetupServiceError";

function respondWith(status: number) {
  return jest.fn(async () => ({ status }));
}

describe("ModelKeyChecker", () => {
  it("sends Anthropic keys in x-api-key with the API version", async () => {
    const fetchFn = respondWith(200);
    await new ModelKeyChecker(fetchFn).check("anthropic", "sk-ant-abc");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: { "anthropic-version": "2023-06-01", "x-api-key": "sk-ant-abc" },
      }),
    );
  });

  it("sends other keys as a bearer token", async () => {
    const fetchFn = respondWith(200);
    await new ModelKeyChecker(fetchFn).check("deepseek", "key-123");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.deepseek.com/models",
      expect.objectContaining({ headers: { Authorization: "Bearer key-123" } }),
    );
  });

  it("checks keys whose model list is public with a request that generates nothing", async () => {
    const fetchFn = respondWith(400);
    await new ModelKeyChecker(fetchFn).check("opencode-go", "key-123");

    expect(fetchFn).toHaveBeenCalledWith(
      "https://opencode.ai/zen/go/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer key-123", "Content-Type": "application/json" },
        body: JSON.stringify({ model: "kimi-k3", messages: [] }),
      }),
    );
  });

  it("still rejects such a key when authentication fails", async () => {
    const check = new ModelKeyChecker(respondWith(401)).check("alibaba-coding-plan", "sk-sp-abc");

    await expect(check).rejects.toMatchObject({ code: SETUP_SERVICE_ERROR_CODE.KEY_REJECTED });
  });

  it.each([
    [400, SETUP_SERVICE_ERROR_CODE.KEY_REJECTED, "Google Gemini rejected this key"],
    [401, SETUP_SERVICE_ERROR_CODE.KEY_REJECTED, "Google Gemini rejected this key"],
    [403, SETUP_SERVICE_ERROR_CODE.KEY_FORBIDDEN, "refused access"],
    [402, SETUP_SERVICE_ERROR_CODE.KEY_NO_CREDIT, "no credit left"],
    [429, SETUP_SERVICE_ERROR_CODE.KEY_RATE_LIMITED, "rate limiting"],
    [503, SETUP_SERVICE_ERROR_CODE.PROVIDER_ERROR, "HTTP 503"],
  ])("explains HTTP %i", async (status, code, message) => {
    const check = new ModelKeyChecker(respondWith(status)).check("google", "AIzaabc");

    await expect(check).rejects.toMatchObject({ code, message: expect.stringContaining(message) });
  });

  it("says when the provider can't be reached", async () => {
    const fetchFn = jest.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(new ModelKeyChecker(fetchFn).check("openai", "sk-abc")).rejects.toMatchObject({
      code: SETUP_SERVICE_ERROR_CODE.PROVIDER_UNREACHABLE,
      statusCode: 502,
      message: expect.stringContaining("Couldn't reach OpenAI"),
    });
  });
});
