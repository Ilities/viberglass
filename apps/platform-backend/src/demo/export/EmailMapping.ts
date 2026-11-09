import { mapStrings } from "../bundle/jsonValues";

export interface Person {
  email: string;
  name: string;
}

function firstNameLocalPart(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Gives each exported person an address on a reserved domain, from the mapping
 * where it names them and from their first name otherwise, and replaces their
 * real address wherever it appears.
 */
export class EmailMapping {
  private readonly targets = new Map<string, string>();
  private readonly pattern: RegExp | null;

  constructor(people: readonly Person[], mapping: Readonly<Record<string, string>>, domain: string) {
    const explicit = new Map(Object.entries(mapping).map(([from, to]) => [from.toLowerCase(), to.toLowerCase()]));
    for (const person of people) {
      const source = person.email.toLowerCase();
      const local = firstNameLocalPart(person.name);
      const target = explicit.get(source) ?? (local ? `${local}@${domain}` : null);
      if (!target) throw new Error(`No address for ${person.name || "a person without a name"}; add them to the email mapping`);
      this.targets.set(source, target);
    }
    const taken = new Map<string, string>();
    for (const [source, target] of this.targets) {
      const other = taken.get(target);
      if (other) throw new Error(`${source} and ${other} would both become ${target}; map one of them explicitly`);
      taken.set(target, source);
    }
    const sources = [...this.targets.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
    this.pattern = sources.length > 0 ? new RegExp(sources.join("|"), "gi") : null;
  }

  sourceEmails(): string[] {
    return [...this.targets.keys()];
  }

  rewrite(value: unknown): unknown {
    const pattern = this.pattern;
    if (!pattern) return value;
    return mapStrings(value, (text) => text.replace(pattern, (match) => this.targets.get(match.toLowerCase()) ?? match));
  }
}
