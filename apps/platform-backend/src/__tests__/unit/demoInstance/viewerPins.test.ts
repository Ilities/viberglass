import { parseBundleManifest } from "../../../demo/bundle/bundleManifest";
import type { Row } from "../../../demo/bundle/jsonValues";
import { parseExportConfig } from "../../../demo/export/exportConfig";
import { resolveViewerPins } from "../../../demo/export/viewerPins";
import { shuffled, ViewerPins } from "../../../demo/seed/ViewerPins";

const tables: Record<string, Row[]> = {
  projects: [
    { id: "p-bookings", slug: "bookings", name: "Bookings", backing_kind: "app" },
    { id: "p-leadership", slug: "leadership", name: "Leadership", backing_kind: "files" },
    { id: "p-sales", slug: "sales", name: "Sales", backing_kind: "files" },
  ],
  artifacts: [
    { id: "a-deck", project_id: "p-leadership", title: "Board update deck" },
    { id: "a-other-deck", project_id: "p-sales", title: "Board update deck" },
    { id: "a-twin-1", project_id: "p-sales", title: "Twin" },
    { id: "a-twin-2", project_id: "p-sales", title: "Twin" },
  ],
};
const rowsOf = (table: string) => tables[table] ?? [];

describe("viewer pins in the export config", () => {
  it("reads apps by slug and artifacts by space and title, and refuses anything else", () => {
    const config = parseExportConfig({ viewer: { pins: [{ app: "bookings" }, { space: "leadership", artifact: "Board update deck" }] } });
    expect(config.viewer.pins).toEqual([{ app: "bookings" }, { space: "leadership", artifact: "Board update deck" }]);
    expect(parseExportConfig({}).viewer.pins).toEqual([]);
    expect(() => parseExportConfig({ viewer: { pins: "bookings" } })).toThrow("viewer.pins must be a list");
    expect(() => parseExportConfig({ viewer: { pins: [{ space: "leadership" }] } })).toThrow("viewer.pins[0] must name an app, or a space and an artifact");
    expect(() => parseExportConfig({ viewer: { pins: [{ app: "bookings", artifact: "x" }] } })).toThrow("viewer.pins[0]");
  });
});

describe("resolveViewerPins", () => {
  it("pins an App space under its name and an artifact under its title, in the space named", () => {
    expect(resolveViewerPins([{ app: "bookings" }, { space: "leadership", artifact: "Board update deck" }], rowsOf)).toEqual([
      { target: { kind: "app", spaceId: "p-bookings" }, title: "Bookings" },
      { target: { kind: "artifact", artifactId: "a-deck" }, title: "Board update deck" },
    ]);
  });

  it("stops on a space that isn't an app, a missing name, or a title two artifacts share", () => {
    const run = () =>
      resolveViewerPins(
        [{ app: "leadership" }, { app: "gone" }, { space: "leadership", artifact: "Nope" }, { space: "gone", artifact: "Board update deck" }, { space: "sales", artifact: "Twin" }],
        rowsOf,
      );
    expect(run).toThrow(
      `viewer.pins names what the export doesn't have: app leadership, app gone, artifact "Nope" in leadership, artifact "Board update deck" in gone, artifact "Twin" in sales`,
    );
  });
});

describe("viewer pins in the bundle", () => {
  it("are read from the manifest and refused when malformed", () => {
    const base = { format: 1, sourceBucket: "b", newestActivityOffsetMs: -5, tables: [], objects: [] };
    const pins = [{ target: { kind: "app", spaceId: "p1" }, title: "Bookings" }];
    expect(parseBundleManifest({ ...base, viewer: { pins } }).viewer.pins).toEqual(pins);
    expect(() => parseBundleManifest({ ...base, viewer: { pins: [{ target: { kind: "app" }, title: "x" }] } })).toThrow(/viewer pin/);
  });
});

describe("ViewerPins", () => {
  it("shuffles every item exactly once", () => {
    expect(shuffled([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
    expect(shuffled([1, 2, 3, 4], () => 0.999)).toEqual([1, 2, 3, 4]);
  });

  it("pins each after the viewer's last pin, in the shuffled order, as pinning in the app does", async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const db = { query: async (text: string, values: unknown[]) => { queries.push({ text, values }); return { rows: [] }; } };
    await new ViewerPins(db, () => 0).apply("viewer", [
      { target: { kind: "app", spaceId: "p1" }, title: "Bookings" },
      { target: { kind: "artifact", artifactId: "a1" }, title: "Deck" },
    ]);
    expect(queries.map((query) => query.values)).toEqual([
      ["viewer", "a1", null, "Deck"],
      ["viewer", null, "p1", "Bookings"],
    ]);
    expect(queries[0].text).toContain("coalesce(max(position) + 1, 0) FROM user_pins WHERE user_id = $1");
  });
});
