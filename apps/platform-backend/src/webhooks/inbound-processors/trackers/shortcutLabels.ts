import { field, idAt, recordAt, stringAt } from "./payloadFields";

/**
 * A story's label names, lower-cased. Shortcut names labels only in the
 * event's references; the story itself carries their ids, all of them when it's
 * created and the added ones when it's updated.
 */
export function shortcutLabels(payload: unknown): string[] {
  const data = recordAt(payload, "data");
  const names = new Map<string, string>();
  for (const ref of arrayAt(payload, "refs")) {
    const id = idAt(ref, "id");
    const name = stringAt(ref, "name");
    if (id && name && stringAt(ref, "entity_type") === "label") names.set(id, name);
  }

  const labelIds = field(data, "label_ids");
  const ids = Array.isArray(labelIds) ? labelIds : arrayAt(labelIds, "adds");
  const fromIds = ids.flatMap((id) => {
    const name = names.get(String(id));
    return name ? [name] : [];
  });
  const fromLabels = arrayAt(data, "labels").flatMap((label) => {
    const name = stringAt(label, "name");
    return name ? [name] : [];
  });
  return [...new Set([...fromIds, ...fromLabels].map((name) => name.trim().toLowerCase()))];
}

function arrayAt(source: unknown, key: string): unknown[] {
  const value = field(source, key);
  return Array.isArray(value) ? value : [];
}
