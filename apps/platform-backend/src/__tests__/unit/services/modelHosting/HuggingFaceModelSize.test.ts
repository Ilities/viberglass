import { HuggingFaceModelSize } from "../../../../services/modelHosting/HuggingFaceModelSize";

function sizes(status: number, siblings: unknown[]) {
  const fetchFn = jest.fn(async () => ({ status, json: async () => ({ siblings }) }));
  return { fetchFn, sizes: new HuggingFaceModelSize(fetchFn) };
}

describe("Hugging Face model size", () => {
  test("adds up the safetensors weights, ignoring other files, and caches the answer", async () => {
    const { sizes: models, fetchFn } = sizes(200, [
      { rfilename: "model-00001-of-00002.safetensors", size: 20_000_000_000 },
      { rfilename: "model-00002-of-00002.safetensors", size: 10_900_000_000 },
      { rfilename: "tokenizer.json", size: 12_000_000 },
      { rfilename: "README.md" },
    ]);
    expect(await models.weightsGb("Qwen/Qwen3.8-27B-FP8")).toBe(30.9);
    await models.weightsGb("Qwen/Qwen3.8-27B-FP8");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(
      "https://huggingface.co/api/models/Qwen/Qwen3.8-27B-FP8?blobs=true",
      expect.objectContaining({ redirect: "error" }),
    );
  });

  test("falls back to PyTorch bins when there are no safetensors", async () => {
    const { sizes: models } = sizes(200, [{ rfilename: "pytorch_model.bin", size: 14_000_000_000 }]);
    expect(await models.weightsGb("old/model")).toBe(14);
  });

  test("doesn't know when the repository can't be read or has no weights", async () => {
    expect(await sizes(404, []).sizes.weightsGb("missing/model")).toBeNull();
    expect(await sizes(200, [{ rfilename: "README.md", size: 10 }]).sizes.weightsGb("empty/model")).toBeNull();
    const failing = new HuggingFaceModelSize(jest.fn(async () => Promise.reject(new Error("offline"))));
    expect(await failing.weightsGb("any/model")).toBeNull();
  });
});
