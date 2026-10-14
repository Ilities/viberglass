import { withOpenCodeModel } from "../src/withOpenCodeModel";

test("sets the model as both the main and the small model", () => {
  expect(JSON.parse(withOpenCodeModel(undefined, "opencode-go/deepseek-v4.1-flash"))).toEqual({
    model: "opencode-go/deepseek-v4.1-flash",
    small_model: "opencode-go/deepseek-v4.1-flash",
  });
});

test("keeps the rest of an existing config", () => {
  const existing = JSON.stringify({ model: "old/model", provider: { viberglass: { name: "EU" } } });

  expect(JSON.parse(withOpenCodeModel(existing, "viberglass/qwen"))).toEqual({
    model: "viberglass/qwen",
    small_model: "viberglass/qwen",
    provider: { viberglass: { name: "EU" } },
  });
});

test("leaves a config it can't read alone", () => {
  expect(withOpenCodeModel("{not json", "a/b")).toBe("{not json");
});
