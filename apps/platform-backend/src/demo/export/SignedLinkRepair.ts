import { mapStrings, type Row } from "../bundle/jsonValues";

/** Query parameters that make a link a signed one: S3, Google Cloud Storage, Alibaba OSS, Azure SAS, CloudFront, Tencent COS. */
export const SIGNATURE_PARAMETERS: readonly string[] = [
  "X-Amz-Signature",
  "X-Amz-Credential",
  "X-Amz-Security-Token",
  "AWSAccessKeyId",
  "X-Goog-Signature",
  "X-Goog-Credential",
  "GoogleAccessId",
  "OSSAccessKeyId",
  "x-oss-signature",
  "x-oss-credential",
  "Key-Pair-Id",
  "q-signature",
  "Signature",
  "sig",
];

const SIGNATURE_NAMES = new Set(SIGNATURE_PARAMETERS.map((name) => name.toLowerCase()));

/** A link's address up to its query, and the query, which stops at a fragment, quote, backslash or closing parenthesis. */
const LINK_WITH_QUERY = /\bhttps?:\/\/[^\s"'<>\\`?#]+\?([^\s"'<>\\`#)]*)/gi;

const isSigned = (query: string): boolean =>
  query.split(/&(?:amp;)?/).some((parameter) => SIGNATURE_NAMES.has(parameter.split("=")[0].toLowerCase()));

export function withoutSignedQueries(text: string): string {
  if (!text.includes("?")) return text;
  return text.replace(LINK_WITH_QUERY, (link, query: string) => (isSigned(query) ? link.slice(0, link.length - query.length - 1) : link));
}

/** Drops the query string from any signed link in any column, so the link's path stays but its signature and key id don't. */
export class SignedLinkRepair {
  repair(_table: string, rows: readonly Row[]): Row[] {
    return rows.map((row) => {
      let changed = false;
      const repaired = mapStrings(row, (text) => {
        const stripped = withoutSignedQueries(text);
        if (stripped !== text) changed = true;
        return stripped;
      }) as Row;
      return changed ? repaired : row;
    });
  }
}
