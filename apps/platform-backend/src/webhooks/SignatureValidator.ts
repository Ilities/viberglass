/**
 * Signature validator with timing-safe comparison
 *
 * Provides secure HMAC signature verification using crypto.timingSafeEqual()
 * to prevent timing attacks. Per GitHub documentation, never use plain
 * string comparison for webhook signatures.
 *
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */

import crypto from 'crypto';
import { HashAlgorithm } from './WebhookProvider';

/**
 * Configuration for signature validator
 */
export interface SignatureValidatorConfig {
  /** Hash algorithm for HMAC computation */
  algorithm: HashAlgorithm;
  /** Header name containing the signature */
  headerName: string;
  /** Prefix before the hex digest (e.g., 'sha256=') */
  prefix: string;
}

/**
 * Result of signature verification
 */
export interface SignatureVerificationResult {
  /** Whether signature is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Expected signature for debugging (do not log in production) */
  expectedSignature?: string;
}

/**
 * Secure signature validator using timing-safe comparison
 */
export class SignatureValidator {
  private readonly config: SignatureValidatorConfig;
  private readonly cryptoAlgorithm: string;

  constructor(config: SignatureValidatorConfig) {
    this.config = config;
    // Map our algorithm types to crypto module format
    this.cryptoAlgorithm = config.algorithm === 'sha256' ? 'sha256' : 'sha1';
  }

  /**
   * Verify webhook signature using timing-safe comparison
   *
   * @param payload - Raw request body as buffer
   * @param signature - Signature from header
   * @param secret - Webhook secret
   * @returns True if signature is valid
   */
  verify(payload: Buffer, signature: string, secret: string): boolean {
    try {
      // Strip prefix if present (e.g., 'sha256=' -> '')
      const receivedSignature = this.stripPrefix(signature);

      // Validate hex format
      if (!this.isValidHex(receivedSignature)) {
        return false;
      }

      // Compute expected HMAC
      const expectedSignature = this.computeSignature(payload, secret);

      // Convert to buffers for comparison
      const receivedBuf = Buffer.from(receivedSignature, 'hex');
      const expectedBuf = Buffer.from(expectedSignature, 'hex');

      // Check buffer lengths match before comparison
      // Timing-safe equal requires same-length buffers
      if (receivedBuf.length !== expectedBuf.length) {
        return false;
      }

      // CRITICAL: Use timing-safe comparison to prevent timing attacks
      // GitHub explicitly warns against using === or ==
      return crypto.timingSafeEqual(receivedBuf, expectedBuf);
    } catch {
      // Any error means signature is invalid
      return false;
    }
  }

  /**
   * Verify signature with detailed result
   *
   * @param payload - Raw request body as buffer
   * @param signature - Signature from header
   * @param secret - Webhook secret
   * @returns Detailed verification result
   */
  verifyWithDetails(
    payload: Buffer,
    signature: string,
    secret: string
  ): SignatureVerificationResult {
    try {
      const receivedSignature = this.stripPrefix(signature);

      if (!this.isValidHex(receivedSignature)) {
        return {
          valid: false,
          error: 'Invalid signature format: not valid hex string',
        };
      }

      const expectedSignature = this.computeSignature(payload, secret);
      const receivedBuf = Buffer.from(receivedSignature, 'hex');
      const expectedBuf = Buffer.from(expectedSignature, 'hex');

      if (receivedBuf.length !== expectedBuf.length) {
        return {
          valid: false,
          error: `Signature length mismatch: received ${receivedBuf.length} bytes, expected ${expectedBuf.length} bytes`,
          expectedSignature,
        };
      }

      const isValid = crypto.timingSafeEqual(receivedBuf, expectedBuf);

      if (!isValid) {
        return {
          valid: false,
          error: 'Signature mismatch: computed HMAC does not match provided signature',
          expectedSignature,
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Compute HMAC signature for payload
   *
   * @param payload - Raw payload bytes
   * @param secret - Secret key
   * @returns Hex-encoded HMAC digest
   */
  private computeSignature(payload: Buffer, secret: string): string {
    const hmac = crypto.createHmac(this.cryptoAlgorithm, secret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  /**
   * Strip prefix from signature string
   *
   * @param signature - Full signature string (e.g., 'sha256=abc123...')
   * @returns Signature without prefix
   */
  private stripPrefix(signature: string): string {
    if (this.config.prefix && signature.startsWith(this.config.prefix)) {
      return signature.substring(this.config.prefix.length);
    }
    return signature;
  }

  /**
   * Check if string is valid hex
   *
   * @param str - String to validate
   * @returns True if valid hex string
   */
  private isValidHex(str: string): boolean {
    return /^[0-9a-fA-F]+$/.test(str);
  }

  /**
   * Get configured header name
   */
  getHeaderName(): string {
    return this.config.headerName;
  }

  /**
   * Get signature prefix
   */
  getPrefix(): string {
    return this.config.prefix;
  }

  /**
   * Get algorithm name
   */
  getAlgorithm(): HashAlgorithm {
    return this.config.algorithm;
  }
}

/**
 * Factory for creating validators for common providers
 */
export class SignatureValidatorFactory {
  /**
   * Create validator for GitHub webhooks
   * GitHub uses SHA-256 with 'sha256=' prefix in 'X-Hub-Signature-256' header
   */
  static forGitHub(): SignatureValidator {
    return new SignatureValidator({
      algorithm: 'sha256',
      headerName: 'x-hub-signature-256',
      prefix: 'sha256=',
    });
  }

  /**
   * Create validator for GitHub legacy webhooks
   * Legacy SHA-1 with 'sha1=' prefix in 'X-Hub-Signature' header
   * @deprecated Use SHA-256 instead
   */
  static forGitHubLegacy(): SignatureValidator {
    return new SignatureValidator({
      algorithm: 'sha1',
      headerName: 'x-hub-signature',
      prefix: 'sha1=',
    });
  }

  /**
   * Create validator for Jira webhooks
   * Jira uses SHA-256 with optional 'sha256=' prefix in 'X-Hub-Signature' header
   * (as of February 2024, Jira supports HMAC verification)
   */
  static forJira(): SignatureValidator {
    return new SignatureValidator({
      algorithm: 'sha256',
      headerName: 'x-hub-signature',
      prefix: 'sha256=',
    });
  }

  /**
   * Create validator with custom configuration
   */
  static custom(config: SignatureValidatorConfig): SignatureValidator {
    return new SignatureValidator(config);
  }
}
