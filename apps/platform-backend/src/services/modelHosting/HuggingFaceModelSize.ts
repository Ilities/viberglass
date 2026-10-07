import { isObjectRecord } from "@viberglass/types";

type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "json">>;

const CACHE_MS = 60 * 60_000;

/** The weight files of a Hugging Face repository; safetensors when it has them, else PyTorch bins. */
function weightBytes(siblings: unknown[]): number {
  const files = siblings.flatMap((sibling) =>
    isObjectRecord(sibling) && typeof sibling.rfilename === "string" && typeof sibling.size === "number"
      ? [{ name: sibling.rfilename, size: sibling.size }]
      : [],
  );
  const sum = (suffix: string) =>
    files.filter((file) => file.name.endsWith(suffix)).reduce((total, file) => total + file.size, 0);
  return sum(".safetensors") || sum(".bin");
}

/**
 * How big a model's weights are, from the sizes of its weight files on Hugging Face,
 * so a deployment isn't put on a GPU that can't hold them. Unknown (null) when the
 * repository can't be read, which the caller treats as "check it yourself".
 */
export class HuggingFaceModelSize {
  private readonly cache = new Map<string, { at: number; value: number | null }>();

  constructor(
    private readonly fetchFn: Fetch = fetch,
    private readonly baseUrl = "https://huggingface.co",
    private readonly now: () => number = Date.now,
  ) {}

  async weightsGb(model: string): Promise<number | null> {
    const cached = this.cache.get(model);
    if (cached && this.now() - cached.at < CACHE_MS) return cached.value;
    const value = await this.read(model);
    this.cache.set(model, { at: this.now(), value });
    return value;
  }

  private async read(model: string): Promise<number | null> {
    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/models/${model}?blobs=true`, {
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status !== 200) return null;
      const info: unknown = await response.json();
      const siblings = isObjectRecord(info) && Array.isArray(info.siblings) ? info.siblings : [];
      const bytes = weightBytes(siblings);
      return bytes > 0 ? Math.round(bytes / 1e8) / 10 : null;
    } catch {
      return null;
    }
  }
}
