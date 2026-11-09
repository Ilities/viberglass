import type { FilesCheckpointResult } from "@viberglass/types";
import { changedFileCount } from "./changedFileCount";

const snapshot: FilesCheckpointResult = {
  id: "snapshot-2",
  parentId: "snapshot-1",
  fileCount: 4,
  totalBytes: 50,
  partial: false,
  changes: { added: 1, changed: 2, removed: 1 },
  createdAt: "now",
  artifacts: [],
  artifactError: null,
};

test("counts a Files run's added, changed and removed files from its save", () => {
  expect(changedFileCount({ changedFiles: [], filesSnapshot: snapshot })).toBe(4);
});

test("counts a code run's changed paths", () => {
  expect(changedFileCount({ changedFiles: ["a.ts", "b.ts"] })).toBe(2);
});
