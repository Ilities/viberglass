import { gunzipSync } from "zlib";
import { eachString } from "../bundle/jsonValues";

export interface Finding {
  location: string;
  kind: string;
  /** The start of what matched, never the whole value. */
  excerpt: string;
}

export interface ForbiddenValue {
  kind: string;
  value: string;
}

/** Credential shapes, the provider-specific ones the worker's redactor also replaces among them. */
const CREDENTIAL_PATTERNS: ReadonlyArray<{ kind: string; pattern: RegExp }> = [
  { kind: "credentials in a URL", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]*:[^\s/@]+@/gi },
  { kind: "API key (sk-)", pattern: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { kind: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g },
  { kind: "GitHub token", pattern: /\bgithub_pat_[A-Za-z0-9_]{22,}/g },
  { kind: "GitLab token", pattern: /\bglpat-[A-Za-z0-9_-]{20,}/g },
  { kind: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9_\-.=]{20,}/g },
  { kind: "Slack token", pattern: /\bxox[abeprs]-[A-Za-z0-9-]{10,}/g },
  { kind: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: "Hugging Face token", pattern: /\bhf_[A-Za-z0-9]{30,}\b/g },
  { kind: "Z.ai API key", pattern: /\b[0-9a-f]{32}\.[A-Za-z0-9]{16}\b/g },
  { kind: "JSON web token", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { kind: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { kind: "signed storage link", pattern: /X-Amz-(?:Signature|Credential|Security-Token)=[^&\s"]*/g },
  { kind: "password hash", pattern: /\b[0-9a-f]{32}:[0-9a-f]{128}\b/g },
];

const MIN_FORBIDDEN_LENGTH = 8;
const GZIP_MAGIC = [0x1f, 0x8b];

const excerpt = (text: string): string => (text.length <= 12 ? `${text.slice(0, 4)}…` : `${text.slice(0, 12)}… (${text.length} chars)`);

/**
 * Looks for anything in an export that resembles a credential, or that is a
 * value the source keeps secret: its hashes, ciphertexts, callback tokens and
 * people's real addresses.
 */
export class SecretScanner {
  private readonly forbidden: ForbiddenValue[];
  private readonly allowed: ReadonlySet<string>;

  constructor(forbidden: Iterable<ForbiddenValue>, allowed: Iterable<string> = []) {
    this.forbidden = [...forbidden]
      .filter((item) => item.value.length >= MIN_FORBIDDEN_LENGTH)
      .map((item) => ({ kind: item.kind, value: item.value.toLowerCase() }));
    this.allowed = new Set(allowed);
  }

  scanText(text: string, location: string): Finding[] {
    const findings: Finding[] = [];
    for (const { kind, pattern } of CREDENTIAL_PATTERNS) {
      for (const match of text.matchAll(pattern)) {
        if (!this.allowed.has(match[0])) findings.push({ location, kind, excerpt: excerpt(match[0]) });
      }
    }
    const lower = this.forbidden.length > 0 ? text.toLowerCase() : "";
    for (const { kind, value } of this.forbidden) {
      if (lower.includes(value)) findings.push({ location, kind, excerpt: excerpt(value) });
    }
    return findings;
  }

  scanValue(value: unknown, location: string): Finding[] {
    const findings: Finding[] = [];
    eachString(value, (text) => findings.push(...this.scanText(text, location)));
    return findings;
  }

  /** Compressed objects are scanned unpacked; a tar's file contents are plain text inside it. */
  scanObject(content: Buffer, location: string): Finding[] {
    const gzipped = content.length > 2 && content[0] === GZIP_MAGIC[0] && content[1] === GZIP_MAGIC[1];
    const text = (gzipped ? gunzipSync(content) : content).toString("latin1");
    return this.scanText(text, location);
  }
}
