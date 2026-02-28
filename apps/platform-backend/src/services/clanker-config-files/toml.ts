type TomlValue = string | number | boolean | TomlValue[] | TomlTable;

interface TomlTable {
  [key: string]: TomlValue;
}

function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let bracketDepth = 0;
  let braceDepth = 0;
  let inString = false;
  let escaping = false;

  for (const char of input) {
    if (inString) {
      current += char;
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      current += char;
      continue;
    }

    if (char === "[") bracketDepth += 1;
    if (char === "]") bracketDepth -= 1;
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth -= 1;

    if (char === delimiter && bracketDepth === 0 && braceDepth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (inString || bracketDepth !== 0 || braceDepth !== 0) {
    throw new Error("Malformed TOML value");
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function stripLineComment(line: string): string {
  let result = "";
  let inString = false;
  let escaping = false;

  for (const char of line) {
    if (inString) {
      result += char;
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === "#") {
      break;
    }

    result += char;
  }

  if (inString) {
    throw new Error("Unterminated string literal");
  }

  return result.trim();
}

function parseTomlValue(value: string): TomlValue {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Missing TOML value");
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    JSON.parse(trimmed);
    return trimmed.slice(1, -1);
  }

  if (trimmed === "true" || trimmed === "false") {
    return trimmed === "true";
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const body = trimmed.slice(1, -1).trim();
    if (!body) {
      return [];
    }
    return splitTopLevel(body, ",").map((entry) => parseTomlValue(entry));
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const body = trimmed.slice(1, -1).trim();
    const table: TomlTable = {};
    if (!body) {
      return table;
    }

    for (const part of splitTopLevel(body, ",")) {
      const separator = part.indexOf("=");
      if (separator <= 0) {
        throw new Error(`Invalid inline TOML table entry: ${part}`);
      }
      const key = part.slice(0, separator).trim();
      if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
        throw new Error(`Invalid TOML key: ${key}`);
      }
      table[key] = parseTomlValue(part.slice(separator + 1));
    }

    return table;
  }

  throw new Error(`Unsupported TOML value: ${trimmed}`);
}

function formatTomlValue(value: TomlValue): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => formatTomlValue(entry)).join(", ")}]`;
  }

  const inlineEntries = Object.entries(value).map(
    ([key, entry]) => `${key} = ${formatTomlValue(entry)}`,
  );
  return `{ ${inlineEntries.join(", ")} }`;
}

function appendTomlSection(lines: string[], table: TomlTable, prefix?: string): void {
  const scalarEntries = Object.entries(table).filter(([, value]) => {
    return (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      Array.isArray(value)
    );
  });
  const nestedEntries = Object.entries(table).filter(([, value]) => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  });

  if (prefix) {
    lines.push(`[${prefix}]`);
  }

  for (const [key, value] of scalarEntries) {
    lines.push(`${key} = ${formatTomlValue(value)}`);
  }

  if (prefix && nestedEntries.length > 0) {
    lines.push("");
  }

  nestedEntries.forEach(([key, value], index) => {
    appendTomlSection(lines, value as TomlTable, prefix ? `${prefix}.${key}` : key);
    if (index < nestedEntries.length - 1) {
      lines.push("");
    }
  });
}

export function validateToml(content: string): void {
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripLineComment(rawLine);
    if (!line) {
      continue;
    }

    if (line.startsWith("[") && line.endsWith("]")) {
      const tableName = line.slice(1, -1).trim();
      if (!/^[A-Za-z0-9_.-]+$/.test(tableName)) {
        throw new Error(`Invalid TOML table name: ${tableName}`);
      }
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error(`Invalid TOML assignment: ${line}`);
    }

    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
      throw new Error(`Invalid TOML key: ${key}`);
    }

    parseTomlValue(line.slice(separator + 1));
  }
}

export function stringifyToml(table: TomlTable): string {
  const lines: string[] = [];
  appendTomlSection(lines, table);
  return lines.join("\n").trim();
}
