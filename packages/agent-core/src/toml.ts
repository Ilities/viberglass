/** A TOML basic string; they share JSON's escapes. */
export function tomlString(value: string): string {
  return JSON.stringify(value);
}

/** A TOML inline table of strings. */
export function tomlInlineTable(values: Record<string, string>): string {
  const entries = Object.entries(values).map(([key, value]) => `${tomlString(key)} = ${tomlString(value)}`);
  return `{ ${entries.join(", ")} }`;
}
