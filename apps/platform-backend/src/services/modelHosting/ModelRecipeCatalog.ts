import {
  isObjectRecord,
  type ModelRecipe,
  type ModelRecipeCommand,
  type ModelRecipeSummary,
} from "@viberglass/types";
import { ModelHostingError } from "../errors/ModelHostingError";

type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "json">>;

const CACHE_MS = 60 * 60_000;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * vLLM Recipes, read from its published JSON: which models it covers, the hardware each
 * is tested on, and the `vllm serve` arguments it recommends there.
 */
export class ModelRecipeCatalog {
  private readonly cache = new Map<string, { at: number; value: unknown }>();

  constructor(
    private readonly fetchFn: Fetch = fetch,
    private readonly baseUrl = "https://recipes.vllm.ai",
    private readonly now: () => number = Date.now,
  ) {}

  async list(): Promise<ModelRecipeSummary[]> {
    const models = await this.read("/models.json");
    if (!Array.isArray(models)) return [];
    return models.flatMap((entry: unknown) =>
      isObjectRecord(entry) && typeof entry.hf_id === "string"
        ? [
            {
              model: entry.hf_id,
              title: text(entry.title) || entry.hf_id,
              provider: text(entry.provider),
            },
          ]
        : [],
    );
  }

  async get(model: string): Promise<ModelRecipe> {
    const recipe = await this.read(`/${model}.json`);
    const meta = isObjectRecord(recipe) && isObjectRecord(recipe.meta) ? recipe.meta : {};
    const variants = isObjectRecord(recipe) && isObjectRecord(recipe.variants) ? recipe.variants : {};
    const variant = isObjectRecord(variants.default) ? variants.default : {};
    return {
      model,
      title: text(meta.title) || model,
      provider: text(meta.provider),
      description: text(meta.description),
      hardware: isObjectRecord(meta.hardware) ? Object.keys(meta.hardware) : [],
      minVramGb:
        typeof variant.vram_minimum_gb === "number" ? variant.vram_minimum_gb : null,
    };
  }

  async command(model: string, hardware: string): Promise<ModelRecipeCommand> {
    const [recipe, command] = await Promise.all([
      this.read(`/${model}.json`),
      this.read(`/${model}/hw/${encodeURIComponent(hardware)}.json`),
    ]);
    const argv = isObjectRecord(command) ? strings(command.argv) : [];
    if (argv[0] !== "vllm" || argv[1] !== "serve")
      throw new ModelHostingError(
        "MODEL_RECIPE_UNSUPPORTED",
        `The recipe for ${model} on ${hardware} isn't a single vllm serve command.`,
      );
    const servingArgs = argv.slice(3);
    // Agents need tool calls; add the recipe's parser when the recommended command leaves it out.
    const features = isObjectRecord(recipe) && isObjectRecord(recipe.features) ? recipe.features : {};
    const toolCalling = isObjectRecord(features.tool_calling) ? strings(features.tool_calling.args) : [];
    if (!servingArgs.includes("--tool-call-parser")) servingArgs.push(...toolCalling);
    const parallel = servingArgs.indexOf("--tensor-parallel-size");
    const gpuCount = parallel >= 0 ? Number(servingArgs[parallel + 1]) : 1;
    return {
      model,
      hardware,
      servingArgs,
      gpuCount: Number.isInteger(gpuCount) && gpuCount > 0 ? gpuCount : 1,
    };
  }

  private async read(path: string): Promise<unknown> {
    const cached = this.cache.get(path);
    if (cached && this.now() - cached.at < CACHE_MS) return cached.value;
    let response: Pick<Response, "status" | "json">;
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, { redirect: "error" });
    } catch {
      throw new ModelHostingError("MODEL_RECIPES_UNREACHABLE", "Couldn't reach vLLM Recipes.", 502);
    }
    if (response.status === 404)
      throw new ModelHostingError("MODEL_RECIPE_NOT_FOUND", "vLLM Recipes has no such recipe.", 404);
    if (response.status !== 200)
      throw new ModelHostingError(
        "MODEL_RECIPES_UNREACHABLE",
        `vLLM Recipes answered HTTP ${response.status}.`,
        502,
      );
    // A model page that isn't JSON (the site serves HTML for unknown paths) reads as no recipe.
    const value: unknown = await response.json().catch(() => {
      throw new ModelHostingError("MODEL_RECIPE_NOT_FOUND", "vLLM Recipes has no such recipe.", 404);
    });
    this.cache.set(path, { at: this.now(), value });
    return value;
  }
}
