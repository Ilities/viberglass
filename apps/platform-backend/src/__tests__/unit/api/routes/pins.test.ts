import { pinTargetOf } from "../../../../api/routes/pins";

const ID = "0f8e8f2a-3c1b-4d2e-9a7b-5c6d7e8f9a0b";

describe("pinTargetOf", () => {
  it("reads an artifact or an app", () => {
    expect(pinTargetOf({ target: { kind: "artifact", artifactId: ID } })).toEqual({ kind: "artifact", artifactId: ID });
    expect(pinTargetOf({ target: { kind: "app", spaceId: ID, extra: 1 } })).toEqual({ kind: "app", spaceId: ID });
  });

  it("refuses anything else", () => {
    expect(pinTargetOf({ target: { kind: "artifact", artifactId: "nope" } })).toBeNull();
    expect(pinTargetOf({ target: { kind: "task", taskId: ID } })).toBeNull();
    expect(pinTargetOf({ target: { kind: "app" } })).toBeNull();
    expect(pinTargetOf(null)).toBeNull();
  });
});
