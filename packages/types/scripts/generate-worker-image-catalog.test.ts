import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkedSettings } from "./generate-worker-image-catalog.ts";

describe("checkedSettings", () => {
  for (const property of ["options", "allowCustom"]) {
    it(`rejects ${property} on a string setting`, () => {
      const setting = {
        key: "model",
        label: "Model",
        type: "string",
        env: ["MODEL"],
        [property]: property === "options" ? [{ value: "x", label: "X" }] : true,
      };

      assert.throws(
        () => checkedSettings("@viberglass/agent-example", [setting]),
        /Plugin @viberglass\/agent-example setting 'model' has options or allowCustom/,
      );
    });
  }

  for (const options of [undefined, [], "invalid"]) {
    it(`rejects a select with no valid options (${String(options)})`, () => {
      assert.throws(
        () => checkedSettings("@viberglass/agent-example", [
          { key: "model", label: "Model", type: "select", env: ["MODEL"], options },
        ]),
        /Plugin @viberglass\/agent-example setting 'model' is a select and needs at least one option\./,
      );
    });
  }

  it("accepts valid string and select settings", () => {
    assert.equal(checkedSettings("@viberglass/agent-example", [
      { key: "model", label: "Model", type: "string", env: ["MODEL"] },
      { key: "region", label: "Region", type: "select", env: ["REGION"], options: [{ value: "us", label: "US" }] },
    ]).length, 2);
  });
});
