/**
 * Express request extended with raw body buffer
 */
export interface ExtendedRequest extends Express.Request {
  /** Raw request body as buffer for signature verification */
  rawBody?: Buffer;
  /** Parsed JSON body (may be null if parsing failed) */
  parsedBody?: unknown;
}
