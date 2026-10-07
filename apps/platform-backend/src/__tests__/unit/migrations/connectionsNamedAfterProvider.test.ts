import { renamesFor } from "../../../migrations/111_connections_named_after_provider";

describe("renaming timestamp-named connections", () => {
  it("names them after the provider, numbered past names already taken", () => {
    const renames = renamesFor([
      { id: "a", name: "GitHub", system: "github" },
      { id: "b", name: "GitHub 2026-09-22 13:48:32", system: "github" },
      { id: "c", name: "GitHub 2026-09-23 08:00:00", system: "github" },
      { id: "d", name: "Jira 2026-09-24 10:11:12", system: "jira" },
    ]);

    expect(Object.fromEntries(renames)).toEqual({ b: "GitHub 2", c: "GitHub 3", d: "Jira" });
  });

  it("leaves names that only look similar", () => {
    const renames = renamesFor([
      { id: "a", name: "Acme 2026-09-22 13:48:32", system: "github" },
      { id: "b", name: "GitHub 2026-09-22", system: "github" },
      { id: "c", name: "Jira 2026-09-22 13:48:32", system: "github" },
    ]);

    expect(renames.size).toBe(0);
  });
});
