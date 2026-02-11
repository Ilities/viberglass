export type CustomOutboundHttpMethod = "POST" | "PUT" | "PATCH";
export type CustomOutboundSignatureAlgorithm = "sha256" | "sha1";
export type CustomOutboundAuthType = "none" | "bearer" | "basic" | "header";

export interface CustomOutboundRetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  maxBackoffMs: number;
}

export interface CustomOutboundAuth {
  type: CustomOutboundAuthType;
  token?: string;
  username?: string;
  password?: string;
  headerName?: string;
  headerValue?: string;
}

export interface CustomOutboundTargetConfig {
  name: string;
  targetUrl: string;
  method: CustomOutboundHttpMethod;
  headers: Record<string, string>;
  auth: CustomOutboundAuth;
  signingSecret?: string;
  signatureAlgorithm: CustomOutboundSignatureAlgorithm;
  retryPolicy: CustomOutboundRetryPolicy;
}

interface ParseOptions {
  existing?: CustomOutboundTargetConfig | null;
  requireNameAndUrl?: boolean;
}

interface ParseResult {
  config?: CustomOutboundTargetConfig;
  error?: string;
}

interface PublicAuthConfig {
  type: CustomOutboundAuthType;
  username?: string;
  headerName?: string;
  hasToken?: boolean;
  hasPassword?: boolean;
  hasHeaderValue?: boolean;
}

const ALLOWED_METHODS = new Set<CustomOutboundHttpMethod>(["POST", "PUT", "PATCH"]);
const ALLOWED_SIGNATURE_ALGORITHMS = new Set<CustomOutboundSignatureAlgorithm>([
  "sha256",
  "sha1",
]);

const DEFAULT_RETRY_POLICY: CustomOutboundRetryPolicy = {
  maxAttempts: 1,
  backoffMs: 250,
  maxBackoffMs: 2000,
};

export function parseCustomOutboundTargetConfig(
  input: unknown,
  options: ParseOptions = {},
): ParseResult {
  const source = toRecord(extractConfigRoot(input));
  const existing = options.existing || null;
  if (!source) {
    return { error: "Custom outbound target configuration must be an object" };
  }

  const name = readOptionalString(source.name) ?? existing?.name ?? "";
  const targetUrl = readOptionalString(source.targetUrl) ?? existing?.targetUrl ?? "";
  if (options.requireNameAndUrl && !name.trim()) {
    return { error: "Custom outbound target name is required" };
  }
  if (options.requireNameAndUrl && !targetUrl.trim()) {
    return { error: "Custom outbound target URL is required" };
  }
  if (name && !name.trim()) {
    return { error: "Custom outbound target name cannot be empty" };
  }
  if (targetUrl && !isHttpUrl(targetUrl)) {
    return { error: "Custom outbound target URL must be a valid http/https URL" };
  }

  const parsedMethod = readOptionalString(source.method)?.toUpperCase();
  const method = (parsedMethod || existing?.method || "POST") as CustomOutboundHttpMethod;
  if (!ALLOWED_METHODS.has(method)) {
    return { error: "Custom outbound target method must be POST, PUT, or PATCH" };
  }

  const headers = parseHeaders(source.headers, existing?.headers);
  if (!headers) {
    return { error: "Custom outbound headers must be a string-to-string object" };
  }

  const auth = parseAuth(source, existing?.auth);
  if (!auth.config) {
    return { error: auth.error || "Custom outbound auth configuration is invalid" };
  }

  const signingSecretInput = readNullableString(source.signingSecret);
  const signingSecret =
    signingSecretInput === undefined
      ? existing?.signingSecret
      : signingSecretInput || undefined;

  const signatureAlgorithmRaw = readOptionalString(source.signatureAlgorithm);
  const normalizedSignatureAlgorithm = (
    signatureAlgorithmRaw ||
    existing?.signatureAlgorithm ||
    "sha256"
  ).toLowerCase();
  if (
    !ALLOWED_SIGNATURE_ALGORITHMS.has(
      normalizedSignatureAlgorithm as CustomOutboundSignatureAlgorithm,
    )
  ) {
    return { error: "Custom outbound signature algorithm must be sha256 or sha1" };
  }
  const signatureAlgorithm =
    normalizedSignatureAlgorithm as CustomOutboundSignatureAlgorithm;

  const retryPolicy = parseRetryPolicy(source.retryPolicy, existing?.retryPolicy);
  if (!retryPolicy.config) {
    return { error: retryPolicy.error || "Custom outbound retry policy is invalid" };
  }

  return {
    config: {
      name: name.trim(),
      targetUrl: targetUrl.trim(),
      method,
      headers,
      auth: auth.config,
      signingSecret,
      signatureAlgorithm,
      retryPolicy: retryPolicy.config,
    },
  };
}

export function readCustomOutboundTargetConfig(
  value: unknown,
): CustomOutboundTargetConfig | null {
  const parsed = parseCustomOutboundTargetConfig(value, {
    requireNameAndUrl: true,
  });
  if (!parsed.config) {
    return null;
  }
  return parsed.config;
}

export function toPublicCustomOutboundTargetConfig(config: CustomOutboundTargetConfig): {
  name: string;
  targetUrl: string;
  method: CustomOutboundHttpMethod;
  headers: Record<string, string>;
  auth: PublicAuthConfig;
  hasSigningSecret: boolean;
  signatureAlgorithm: CustomOutboundSignatureAlgorithm | null;
  retryPolicy: CustomOutboundRetryPolicy;
} {
  return {
    name: config.name,
    targetUrl: config.targetUrl,
    method: config.method,
    headers: config.headers,
    auth: sanitizeAuth(config.auth),
    hasSigningSecret: Boolean(config.signingSecret),
    signatureAlgorithm: config.signingSecret ? config.signatureAlgorithm : null,
    retryPolicy: config.retryPolicy,
  };
}

function sanitizeAuth(auth: CustomOutboundAuth): PublicAuthConfig {
  if (auth.type === "bearer") {
    return {
      type: "bearer",
      hasToken: Boolean(auth.token),
    };
  }
  if (auth.type === "basic") {
    return {
      type: "basic",
      username: auth.username,
      hasPassword: Boolean(auth.password),
    };
  }
  if (auth.type === "header") {
    return {
      type: "header",
      headerName: auth.headerName,
      hasHeaderValue: Boolean(auth.headerValue),
    };
  }
  return { type: "none" };
}

function extractConfigRoot(input: unknown): unknown {
  const root = toRecord(input);
  if (!root) {
    return input;
  }

  const nested = toRecord(root.outboundTargetConfig);
  return nested || input;
}

function parseHeaders(
  value: unknown,
  fallback: Record<string, string> | undefined,
): Record<string, string> | null {
  if (value === undefined) {
    return fallback || {};
  }

  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const headers: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry !== "string") {
      return null;
    }
    headers[key] = entry;
  }
  return headers;
}

function parseAuth(
  source: Record<string, unknown>,
  fallback: CustomOutboundAuth | undefined,
): {
  config?: CustomOutboundAuth;
  error?: string;
} {
  const authInput = toRecord(source.auth);
  const authTypeInput = readOptionalString(authInput?.type);
  const type = (authTypeInput || fallback?.type || "none").toLowerCase() as CustomOutboundAuthType;

  if (type !== "none" && type !== "bearer" && type !== "basic" && type !== "header") {
    return { error: "Custom outbound auth type must be none, bearer, basic, or header" };
  }

  if (type === "none") {
    return { config: { type: "none" } };
  }

  if (type === "bearer") {
    const token = readOptionalString(authInput?.token) ?? fallback?.token;
    if (!token?.trim()) {
      return { error: "Custom outbound bearer auth requires auth.token" };
    }
    return { config: { type, token: token.trim() } };
  }

  if (type === "basic") {
    const username = readOptionalString(authInput?.username) ?? fallback?.username;
    const password = readOptionalString(authInput?.password) ?? fallback?.password;
    if (!username?.trim() || !password?.trim()) {
      return { error: "Custom outbound basic auth requires auth.username and auth.password" };
    }
    return {
      config: {
        type,
        username: username.trim(),
        password: password.trim(),
      },
    };
  }

  const headerName = readOptionalString(authInput?.headerName) ?? fallback?.headerName;
  const headerValue = readOptionalString(authInput?.headerValue) ?? fallback?.headerValue;
  if (!headerName?.trim() || !headerValue?.trim()) {
    return { error: "Custom outbound header auth requires auth.headerName and auth.headerValue" };
  }
  return {
    config: {
      type,
      headerName: headerName.trim(),
      headerValue: headerValue.trim(),
    },
  };
}

function parseRetryPolicy(
  value: unknown,
  fallback: CustomOutboundRetryPolicy | undefined,
): { config?: CustomOutboundRetryPolicy; error?: string } {
  const retryInput = toRecord(value);
  const base = fallback || DEFAULT_RETRY_POLICY;

  const maxAttemptsRaw = readInteger(retryInput?.maxAttempts);
  const backoffMsRaw = readInteger(retryInput?.backoffMs);
  const maxBackoffMsRaw = readInteger(retryInput?.maxBackoffMs);

  const maxAttempts = maxAttemptsRaw ?? base.maxAttempts;
  const backoffMs = backoffMsRaw ?? base.backoffMs;
  const maxBackoffMs = maxBackoffMsRaw ?? base.maxBackoffMs;

  if (maxAttempts < 1 || maxAttempts > 10) {
    return { error: "Custom outbound retry maxAttempts must be between 1 and 10" };
  }
  if (backoffMs < 0 || backoffMs > 60000) {
    return { error: "Custom outbound retry backoffMs must be between 0 and 60000" };
  }
  if (maxBackoffMs < backoffMs || maxBackoffMs > 600000) {
    return {
      error: "Custom outbound retry maxBackoffMs must be >= backoffMs and <= 600000",
    };
  }

  return {
    config: {
      maxAttempts,
      backoffMs,
      maxBackoffMs,
    },
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return null;
}

function readInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.trunc(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
