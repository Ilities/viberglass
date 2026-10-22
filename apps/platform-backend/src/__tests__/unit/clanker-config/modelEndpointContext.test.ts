import {
  formatModelLines,
  isLocalModelEndpoint,
  maxModelLenOf,
  modelContextWindow,
  modelOutputLimit,
  readModelLines,
} from "@viberglass/types";

describe("model endpoint context lengths", () => {
  it("takes loopback, private, Docker-host, .local and single-label addresses as local", () => {
    for (const url of [
      "http://localhost:11434/v1",
      "http://127.0.0.1:8000/v1",
      "http://host.docker.internal:8993/v1",
      "http://ollama:11434/v1",
      "http://192.168.1.5/v1",
      "http://10.0.0.7/v1",
      "http://172.20.0.3/v1",
      "http://vllm.models.svc.cluster.local/v1",
      "http://[::1]:8000/v1",
    ]) {
      expect([url, isLocalModelEndpoint(url)]).toEqual([url, true]);
    }
    for (const url of ["https://api.z.ai/api/paas/v4", "https://172.32.0.1/v1", "https://[2001:db8::1]/v1", "not a url"]) {
      expect([url, isLocalModelEndpoint(url)]).toEqual([url, false]);
    }
  });

  it("uses the model's known length, else the local default on a local endpoint, else none", () => {
    expect(modelContextWindow({ baseUrl: "https://api.z.ai/v4", contextWindows: { glm: 200000 } }, "glm")).toBe(200000);
    expect(modelContextWindow({ baseUrl: "http://localhost:11434/v1", contextWindows: {} }, "qwen")).toBe(32768);
    expect(modelContextWindow({ baseUrl: "https://api.z.ai/v4", contextWindows: {} }, "glm")).toBeUndefined();
  });

  it("leaves a quarter of the window for a reply, at most 32,000 tokens", () => {
    expect(modelOutputLimit(32768)).toBe(8192);
    expect(modelOutputLimit(200000)).toBe(32000);
  });

  it("reads the form's model list, with a context length after a model when given", () => {
    expect(readModelLines("glm-4.7 200000\n  qwen3:8b  \nmy model 32,768\n\nglm-4.7\nzero 0")).toEqual({
      models: ["glm-4.7", "qwen3:8b", "my model", "zero"],
      contextWindows: { "glm-4.7": 200000, "my model": 32768 },
    });
    expect(formatModelLines(["glm-4.7", "qwen"], { "glm-4.7": 200000 })).toBe("glm-4.7 200000\nqwen");
  });

  it("reads a vLLM deployment's --max-model-len in either form", () => {
    expect(maxModelLenOf(["--max-model-len", "32768", "--tool-call-parser", "hermes"])).toBe(32768);
    expect(maxModelLenOf(["--max-model-len=65536"])).toBe(65536);
    expect(maxModelLenOf(["--tool-call-parser", "hermes"])).toBeUndefined();
  });
});
