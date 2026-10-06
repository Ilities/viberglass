import { ModelRecipeCatalog } from "../../../../services/modelHosting/ModelRecipeCatalog";

const recipe = {
  meta: {
    title: "GPT-OSS 20B",
    provider: "OpenAI",
    description: "Reasoning model",
    hardware: { h100: "verified", b200: "verified" },
  },
  features: {
    tool_calling: { args: ["--tool-call-parser", "openai", "--enable-auto-tool-choice"] },
  },
  variants: { default: { vram_minimum_gb: 16 } },
};

function catalog(pages: Record<string, unknown>) {
  const fetchFn = jest.fn(async (url: string) => {
    const path = url.replace("https://recipes.vllm.ai", "");
    if (!(path in pages)) return { status: 200, json: async () => Promise.reject(new SyntaxError("HTML")) };
    return { status: 200, json: async () => pages[path] };
  });
  return { fetchFn, catalog: new ModelRecipeCatalog(fetchFn) };
}

describe("vLLM Recipes catalog", () => {
  test("lists models and caches the index", async () => {
    const { catalog: recipes, fetchFn } = catalog({
      "/models.json": [{ hf_id: "openai/gpt-oss-20b", title: "GPT-OSS 20B", provider: "OpenAI" }, { bad: true }],
    });
    expect(await recipes.list()).toEqual([{ model: "openai/gpt-oss-20b", title: "GPT-OSS 20B", provider: "OpenAI" }]);
    await recipes.list();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test("reads a recipe's hardware and memory need", async () => {
    const { catalog: recipes } = catalog({ "/openai/gpt-oss-20b.json": recipe });
    expect(await recipes.get("openai/gpt-oss-20b")).toEqual({
      model: "openai/gpt-oss-20b",
      title: "GPT-OSS 20B",
      provider: "OpenAI",
      description: "Reasoning model",
      hardware: ["h100", "b200"],
      minVramGb: 16,
    });
  });

  test("turns the hardware command into serving arguments with tool calling and GPU count", async () => {
    const { catalog: recipes } = catalog({
      "/openai/gpt-oss-20b.json": recipe,
      "/openai/gpt-oss-20b/hw/h100.json": {
        argv: ["vllm", "serve", "openai/gpt-oss-20b", "--tensor-parallel-size", "2"],
      },
    });
    expect(await recipes.command("openai/gpt-oss-20b", "h100")).toEqual({
      model: "openai/gpt-oss-20b",
      hardware: "h100",
      servingArgs: [
        "--tensor-parallel-size",
        "2",
        "--tool-call-parser",
        "openai",
        "--enable-auto-tool-choice",
      ],
      gpuCount: 2,
    });
  });

  test("treats a page that isn't JSON as a missing recipe", async () => {
    const { catalog: recipes } = catalog({});
    await expect(recipes.get("nobody/nothing")).rejects.toMatchObject({ statusCode: 404 });
  });
});
