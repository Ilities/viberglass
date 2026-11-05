import { mkdtempSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sqliteFileProblem } from "../../../../services/apps/sqliteFileCheck";

const dir = mkdtempSync(join(tmpdir(), "sqlite-check-"));

describe("sqliteFileProblem", () => {
  it("accepts an intact database", () => {
    const path = join(dir, "good.db");
    const database = new DatabaseSync(path);
    database.prepare("CREATE TABLE laptops (serial TEXT)").all();
    database.close();

    expect(sqliteFileProblem(path)).toBeNull();
  });

  it("refuses a file that isn't SQLite", () => {
    const path = join(dir, "notes.txt");
    writeFileSync(path, "just some notes, not a database at all");

    expect(sqliteFileProblem(path)).toBe("That file isn't a SQLite database.");
  });
});
