import { isTimestampType, type ColumnInfo } from "../bundle/DatabaseSchema";
import { withoutKeys, type Row } from "../bundle/jsonValues";
import { toOffset } from "../bundle/timestampOffsets";
import type { EmailMapping } from "./EmailMapping";
import type { ColumnRule, TablePolicy } from "./tablePolicies";

export interface SanitizedTable {
  rows: Row[];
  timestampColumns: string[];
}

/**
 * Applies a table's column rules, removes signed links and archive URLs from
 * JSON, replaces people's addresses, and turns times into offsets from the export.
 */
export class RowSanitizer {
  constructor(
    private readonly policies: Readonly<Record<string, TablePolicy>>,
    private readonly strippedKeys: ReadonlySet<string>,
    private readonly emails: Pick<EmailMapping, "rewrite">,
    private readonly exportedAt: Date,
  ) {}

  sanitize(table: string, rows: readonly Row[], columns: readonly ColumnInfo[]): SanitizedTable {
    const rules = this.policies[table]?.columns ?? {};
    const kept = columns.filter((column) => !isDropped(rules[column.name]));
    const timestampColumns = kept.filter((column) => isTimestampType(column.type)).map((column) => column.name);
    return {
      rows: rows.map((row) => Object.fromEntries(kept.map((column) => [column.name, this.value(row[column.name], rules[column.name])]))),
      timestampColumns,
    };
  }

  private value(original: unknown, rule: ColumnRule | undefined): unknown {
    const value = applyRule(original, rule);
    if (value instanceof Date) return toOffset(value, this.exportedAt);
    return this.emails.rewrite(withoutKeys(value, this.strippedKeys));
  }
}

const isDropped = (rule: ColumnRule | undefined): boolean => rule !== undefined && "drop" in rule;

function applyRule(value: unknown, rule: ColumnRule | undefined): unknown {
  if (!rule || "drop" in rule) return value;
  if ("set" in rule) return rule.set;
  return rule.map(value);
}
