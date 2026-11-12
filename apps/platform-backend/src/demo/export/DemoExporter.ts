import { BUNDLE_FORMAT, objectFile, type BundleManifest, type BundleTable } from "../bundle/bundleManifest";
import type { SchemaSnapshot } from "../bundle/DatabaseSchema";
import { textValue, type Row } from "../bundle/jsonValues";
import { newestPastOffset } from "../bundle/timestampOffsets";
import type { BundleWriter } from "./BundleWriter";
import { EmailMapping } from "./EmailMapping";
import { ExcludedMessageRepair } from "./ExcludedMessageRepair";
import { GitHubAccountMapping } from "./GitHubAccountMapping";
import type { ExportConfig } from "./exportConfig";
import type { ObjectExporter } from "./ObjectExporter";
import { objectReferences } from "./objectReferences";
import { PiStartupNoticeRepair } from "./PiStartupNoticeRepair";
import { RowSanitizer } from "./RowSanitizer";
import { RowSelection } from "./RowSelection";
import type { Finding, ForbiddenValue } from "./SecretScanner";
import { SecretScanner } from "./SecretScanner";
import { selectionContext, viewerUserId } from "./selectionContext";
import { TaskFolderRepair } from "./TaskFolderRepair";
import { ACTIVITY_COLUMNS, EXCLUDED_OBJECT_PREFIXES, EXCLUDED_TABLES, EXPORTED_TABLES, LOOSE_REFERENCES, STRIPPED_JSON_KEYS } from "./tablePolicies";

export interface ExportSource {
  schema(): Promise<SchemaSnapshot>;
  rows(table: string): Promise<Row[]>;
  forbiddenValues(columns: SchemaSnapshot["columns"]): Promise<ForbiddenValue[]>;
}

export class SecretsFoundError extends Error {
  constructor(readonly findings: Finding[]) {
    super(`The export looks like it holds secrets, so nothing was written:\n${findings.slice(0, 50).map((f) => `  ${f.location}: ${f.kind} ${f.excerpt}`).join("\n")}`);
  }
}

/** Reads the source workspace, keeps what a public demo may show, and writes it as a bundle. */
export class DemoExporter {
  constructor(
    private readonly source: ExportSource,
    private readonly writer: BundleWriter,
    private readonly objects: (directory: string) => Pick<ObjectExporter, "export">,
    private readonly config: ExportConfig,
    private readonly sourceBucket: string,
    private readonly log: (line: string) => void,
  ) {}

  async export(exportedAt: Date): Promise<BundleManifest> {
    const schema = await this.source.schema();
    for (const table of schema.columns.keys()) {
      if (!(table in EXPORTED_TABLES) && !EXCLUDED_TABLES.has(table)) this.log(`Not exported, no policy yet: ${table}`);
    }
    const raw = new Map<string, Row[]>();
    for (const table of Object.keys(EXPORTED_TABLES)) if (schema.columns.has(table)) raw.set(table, await this.source.rows(table));

    const rowsOf = (table: string) => raw.get(table) ?? [];
    const context = selectionContext(rowsOf, this.config);
    const selected = new RowSelection(EXPORTED_TABLES, [...schema.foreignKeys, ...LOOSE_REFERENCES]).select(raw, context);
    const excludedMessages = ExcludedMessageRepair.from(rowsOf("task_messages"), context.excludedMessageIds);
    const users = selected.get("users") ?? [];
    const viewerId = viewerUserId(users, this.config.viewer.sourceEmail);
    const emails = new EmailMapping(
      users.map((user) => ({ email: textValue(user, "email") ?? "", name: textValue(user, "name") ?? "" })),
      this.config.emails,
      this.config.emailDomain,
    );
    const sanitizer = new RowSanitizer(EXPORTED_TABLES, STRIPPED_JSON_KEYS, emails, exportedAt);
    const repairs = [excludedMessages, TaskFolderRepair.from(selected), new PiStartupNoticeRepair(), new GitHubAccountMapping(this.config.githubAccounts)];

    const tables = new Map<string, Row[]>();
    const manifestTables: BundleTable[] = [];
    for (const [table, rows] of selected) {
      const repaired = repairs.reduce<Row[]>((current, repair) => repair.repair(table, current), [...rows]);
      const sanitized = sanitizer.sanitize(table, repaired, schema.columns.get(table) ?? []);
      tables.set(table, sanitized.rows);
      manifestTables.push({ name: table, rows: sanitized.rows.length, timestampColumns: sanitized.timestampColumns });
    }
    const offsets = ACTIVITY_COLUMNS.flatMap(([table, column]) =>
      (tables.get(table) ?? []).flatMap((row) => {
        const value = row[column];
        return typeof value === "number" ? [value] : [];
      }),
    );

    const scanner = new SecretScanner([...(await this.source.forbiddenValues(schema.columns)), ...excludedMessages.forbiddenValues()], this.config.allowedFindings);
    const findings: Finding[] = [];
    for (const [table, rows] of tables) rows.forEach((row, index) => findings.push(...scanner.scanValue(row, `${table} ${textValue(row, "id") ?? `row ${index + 1}`}`)));

    await this.writer.start();
    try {
      const exported = await this.objects(this.writer.workDirectory).export(objectReferences(tables, this.sourceBucket, EXCLUDED_OBJECT_PREFIXES));
      for (const key of exported.missing) this.log(`Missing in the source bucket, left out: ${key}`);
      for (const key of exported.keys) findings.push(...scanner.scanObject(await this.writer.readObject(objectFile(key)), `object ${key}`));
      if (findings.length > 0) throw new SecretsFoundError(findings);

      const manifest: BundleManifest = {
        format: BUNDLE_FORMAT,
        sourceBucket: this.sourceBucket,
        newestActivityOffsetMs: newestPastOffset(offsets),
        tables: manifestTables,
        objects: exported.keys,
        contentTypes: exported.contentTypes,
        viewer: { userId: viewerId, watchTaskKeys: this.config.viewer.watchTaskKeys },
      };
      await this.writer.finish(tables, manifest);
      return manifest;
    } catch (error) {
      await this.writer.abandon();
      throw error;
    }
  }
}
