import { mapStrings } from "./jsonValues";

const bucketUrl = (bucket: string): string => `s3://${bucket}/`;

/** The object key a value names, when the whole value is a URL into the bucket. */
export function objectKeyOf(value: string, bucket: string): string | null {
  const prefix = bucketUrl(bucket);
  if (!value.startsWith(prefix) || /\s/.test(value)) return null;
  const key = value.slice(prefix.length);
  return key.length > 0 ? key : null;
}

/** Points every URL into one bucket at another, wherever it appears in a value. */
export function rewriteBucketUrls(value: unknown, from: string, to: string): unknown {
  if (from === to) return value;
  const source = bucketUrl(from);
  const target = bucketUrl(to);
  return mapStrings(value, (text) => (text.includes(source) ? text.split(source).join(target) : text));
}
