/**
 * Log redaction utilities
 * Sanitizes sensitive values in structured logs
 *
 * Ensures SEC-04: No credential values appear in logs,
 * error messages, or API responses
 */

/**
 * Sensitive key patterns that should never be logged
 */
const SENSITIVE_PATTERNS = [
  'token',
  'password',
  'apikey',
  'api_key',
  'secret',
  'credential',
  'authorization',
  'auth',
  'private',
  'key',
  'cookie',
  'session',
];

/**
 * Check if a key name is sensitive
 */
function isSensitiveKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_PATTERNS.some(pattern => lowerKey.includes(pattern));
}

/**
 * Redact sensitive values from an object
 * Returns a new object with sensitive values replaced
 */
export function sanitize<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item)) as unknown as T;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      // Redact the entire value for sensitive keys
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

/**
 * Redact credential-like strings from text
 * Detects and redacts potential credential values in string content
 */
export function redactCredentials(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let redacted = text;

  // Redact things that look like Bearer tokens
  redacted = redacted.replace(
    /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    'Bearer [REDACTED]'
  );

  // Redact things that look like API keys (common patterns)
  redacted = redacted.replace(
    /(['"]?)(?:api[_-]?key|token|secret|password|authorization)\s*[=:]\s*['"]?([A-Za-z0-9\-._~+/]{20,})['"]?/gi,
    '$1$2: [REDACTED]'
  );

  // Redact GitHub tokens
  redacted = redacted.replace(
    /ghp_[A-Za-z0-9]{36}/gi,
    'ghp_[REDACTED]'
  );

  // Redact UUIDs that might be sensitive (in auth contexts)
  redacted = redacted.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    '[UUID]'
  );

  return redacted;
}

/**
 * Create a safe error message that redacts sensitive details
 */
export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return redactCredentials(error.message);
  }

  if (typeof error === 'string') {
    return redactCredentials(error);
  }

  return redactCredentials(JSON.stringify(error));
}

/**
 * Winston log format that sanitizes sensitive data
 */
export function createSanitizeFormat() {
  return {
    transform(info: any) {
      return sanitize(info);
    },
  };
}
