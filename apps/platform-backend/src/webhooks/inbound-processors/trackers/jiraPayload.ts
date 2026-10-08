import { isObjectRecord, type Severity } from "@viberglass/types";
import type { TrackerPerson } from "../../../services/trackers/TrackerIssueInbound";
import { field, stringAt } from "./payloadFields";

/** Where the API path starts in an issue's `self` link: https://acme.atlassian.net/rest/api/2/issue/10001. */
const REST_PATH = /^(.*)\/rest\/api\/[^/]+(?:\/.*)?$/i;

/** The Jira site an issue's `self` link points into, e.g. https://acme.atlassian.net. */
export function jiraSiteUrl(issueSelf: string | undefined): string | null {
  if (!issueSelf) return null;
  try {
    const parsed = new URL(issueSelf);
    const match = parsed.pathname.replace(/\/+$/, "").match(REST_PATH);
    return match ? `${parsed.origin}${(match[1] ?? "").replace(/\/+$/, "")}` : null;
  } catch {
    return null;
  }
}

export function jiraBrowseUrl(issueSelf: string | undefined, issueKey: string): string | null {
  const site = jiraSiteUrl(issueSelf);
  return site ? `${site}/browse/${issueKey}` : null;
}

export function jiraPerson(user: unknown): TrackerPerson | null {
  const name = stringAt(user, "displayName") ?? stringAt(user, "name");
  return name ? { name, email: stringAt(user, "emailAddress") ?? null } : null;
}

export function jiraSeverity(priorityName: string | undefined): Severity {
  const normalized = priorityName?.toLowerCase() ?? "";
  if (normalized.includes("highest") || normalized.includes("critical")) return "critical";
  if (normalized.includes("high")) return "high";
  if (normalized.includes("low")) return "low";
  return "medium";
}

/**
 * Jira text as Markdown: webhooks send wiki markup as a string, which is kept,
 * or rich text (Atlassian Document Format), whose blocks become paragraphs,
 * list items and code blocks.
 */
export function jiraText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!isObjectRecord(value)) return "";
  return blocks(field(value, "content")).join("\n\n").trim();
}

function blocks(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content.map(block).filter((text) => text.length > 0);
}

function block(node: unknown): string {
  const type = stringAt(node, "type");
  const content = field(node, "content");
  switch (type) {
    case "paragraph":
    case "heading":
      return inline(content);
    case "bulletList":
    case "orderedList":
      return listItems(content, type === "orderedList");
    case "codeBlock":
      return `\`\`\`\n${inline(content)}\n\`\`\``;
    case "blockquote":
      return blocks(content).map((text) => `> ${text}`).join("\n");
    default:
      return inline(content) || (stringAt(node, "text") ?? "");
  }
}

function listItems(items: unknown, ordered: boolean): string {
  if (!Array.isArray(items)) return "";
  return items.map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${blocks(field(item, "content")).join(" ")}`).join("\n");
}

function inline(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((node) => {
      const type = stringAt(node, "type");
      if (type === "hardBreak") return "\n";
      if (type === "mention" || type === "emoji") return stringAt(field(node, "attrs"), "text") ?? "";
      if (type === "inlineCard") return stringAt(field(node, "attrs"), "url") ?? "";
      return field(node, "text") === undefined ? inline(field(node, "content")) : (stringAt(node, "text") ?? " ");
    })
    .join("");
}

/** An issue's labels, lower-cased. */
export function jiraLabels(fields: unknown): string[] {
  const labels = field(fields, "labels");
  if (!Array.isArray(labels)) return [];
  return labels.flatMap((label) => (typeof label === "string" && label.trim() ? [label.trim().toLowerCase()] : []));
}
