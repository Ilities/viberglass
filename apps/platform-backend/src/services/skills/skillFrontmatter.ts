/**
 * Reads the top-level scalar fields of a SKILL.md's YAML frontmatter: plain,
 * quoted and block (`|`, `>`) values. Nested values are skipped; a skill only
 * needs its name and description read here.
 */
export function readFrontmatter(markdown: string): Record<string, string> | null {
  const lines = markdown.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) return null;

  const fields: Record<string, string> = {};
  for (let index = 1; index < end; index++) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[index]);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (/^[|>][+-]?$/.test(value)) {
      const block: string[] = [];
      while (index + 1 < end && (/^\s+\S/.test(lines[index + 1]) || lines[index + 1].trim() === "")) {
        block.push(lines[++index].trim());
      }
      fields[key] = (value.startsWith(">") ? block.join(" ") : block.join("\n")).trim();
    } else {
      fields[key] = unquote(value);
    }
  }
  return fields;
}

function unquote(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1);
  }
  return value;
}
