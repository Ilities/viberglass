import type { ArtifactCover, ArtifactFormat } from "@viberglass/types";

/** How much of the entry file a cover is read from. */
export const COVER_READ_BYTES = 256 * 1024;
const SLIDES = 24;
const TEXT_CHARS = 120;
const EXCERPT_CHARS = 280;
const COLUMNS = 6;
const ROWS = 5;
const KEYS = 8;

/** What a version's cover shows, read from its entry file; null when the format has nothing to draw from. */
export function artifactCover(format: ArtifactFormat, content: Buffer): ArtifactCover | null {
  const text = content.subarray(0, COVER_READ_BYTES).toString("utf8");
  switch (format) {
    case "html":
      return htmlCover(text);
    case "markdown":
      return markdownCover(text);
    case "text":
      return { kind: "page", heading: null, excerpt: clip(collapse(text), EXCERPT_CHARS) };
    case "csv":
      return csvCover(text);
    case "json":
      return jsonCover(content.length > COVER_READ_BYTES ? null : text);
    default:
      return null;
  }
}

function htmlCover(html: string): ArtifactCover {
  const body = html.replace(/<(script|style|template|svg)\b[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const starts = slideStarts(body);
  if (starts.length >= 2) {
    const slides = starts.slice(0, SLIDES).map((start) => {
      const chunk = body.slice(start.index, elementEnd(body, start));
      return clip(firstMatch(chunk, /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]\s*>/i) ?? "", TEXT_CHARS);
    });
    return { kind: "deck", slides, slideCount: starts.length };
  }
  const heading = firstMatch(body, /<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i) ?? firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  // A deck whose script draws its slides still says it's a deck: its container, or its "1 / 6" counter.
  const counter = /<[^>]*>\s*1\s*\/\s*(\d{1,3})\s*</.exec(body);
  if (counter || hasDeckContainer(body)) {
    return { kind: "deck", slides: heading ? [clip(heading, TEXT_CHARS)] : [], slideCount: counter ? Number(counter[1]) : 0 };
  }
  const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)].map((match) => plain(match[1]));
  return { kind: "page", heading: heading ? clip(heading, TEXT_CHARS) : null, excerpt: clip(paragraphs.join(" "), EXCERPT_CHARS) };
}

interface SlideStart {
  index: number;
  tag: string;
}

/** Where each slide opens: elements classed `slide`, or the sections of a reveal.js-style deck. */
function slideStarts(html: string): SlideStart[] {
  const tags = [...html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)].map((match) => ({
    index: match.index ?? 0,
    tag: match[1].toLowerCase(),
    classes: classTokens(match[2]),
  }));
  const classed = tags.filter((tag) => tag.classes.includes("slide"));
  if (classed.length >= 2) return classed;
  const container = tags.some((tag) => tag.classes.some((token) => token === "slides" || token === "reveal"));
  return container ? tags.filter((tag) => tag.tag === "section") : [];
}

/** Where the element opened at `start` closes, counting nested elements of the same name. */
function elementEnd(html: string, start: SlideStart): number {
  const pattern = new RegExp(`<(/?)${start.tag}\\b[^>]*>`, "gi");
  pattern.lastIndex = start.index;
  let depth = 0;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return html.length;
}

function hasDeckContainer(html: string): boolean {
  return [...html.matchAll(/<[a-z][a-z0-9-]*\b([^>]*)>/gi)].some((tag) => {
    const id = /\bid\s*=\s*["']([^"']*)["']/i.exec(tag[1])?.[1];
    return [...classTokens(tag[1]), id].some((token) => token === "slides" || token === "deck" || token === "reveal");
  });
}

function classTokens(attributes: string): string[] {
  const value = /\bclass\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attributes);
  return (value?.[2] ?? value?.[3] ?? "").split(/\s+/).filter(Boolean);
}

function markdownCover(markdown: string): ArtifactCover {
  const lines = markdown.replace(/^---\n[\s\S]*?\n---\n/, "").split("\n");
  const headingIndex = lines.findIndex((line) => /^#{1,6}\s+\S/.test(line));
  const heading = headingIndex >= 0 ? clip(inlineMarkdown(lines[headingIndex].replace(/^#+\s+/, "")), TEXT_CHARS) : null;
  const prose = lines
    .slice(headingIndex + 1)
    .filter((line) => line.trim() && !/^(#|```|\||---|<)/.test(line.trim()))
    .map((line) => inlineMarkdown(line.replace(/^\s*([-*+]|\d+\.|>)\s+/, "")));
  return { kind: "page", heading, excerpt: clip(prose.join(" "), EXCERPT_CHARS) };
}

function inlineMarkdown(text: string): string {
  return collapse(text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`~]+/g, ""));
}

function csvCover(csv: string): ArtifactCover {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim()).slice(0, ROWS + 1);
  const delimiter = (lines[0] ?? "").split(";").length > (lines[0] ?? "").split(",").length ? ";" : ",";
  const [columns = [], ...rows] = lines.map((line) => csvFields(line, delimiter).slice(0, COLUMNS).map((field) => clip(field, 40)));
  return { kind: "table", columns, rows };
}

function csvFields(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted && char === '"' && line[i + 1] === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  return fields;
}

function jsonCover(json: string | null): ArtifactCover | null {
  if (json === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const sample = Array.isArray(value) ? value[0] : value;
  if (typeof sample !== "object" || sample === null || Array.isArray(sample)) return null;
  return { kind: "keys", keys: Object.keys(sample).slice(0, KEYS).map((key) => clip(key, 40)) };
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  const value = match ? plain(match[1]) : "";
  return value || null;
}

function plain(html: string): string {
  return collapse(decodeEntities(html.replace(/<[^>]*>/g, " ")));
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  });
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
