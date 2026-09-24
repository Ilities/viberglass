import { getModelProvider, type ModelProvider, type ModelProviderId } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../errors/SetupServiceError";

const logger = createChildLogger({ service: "ModelKeyChecker" });
const CHECK_TIMEOUT_MS = 10_000;

type Fetch = (url: string, init: RequestInit) => Promise<Pick<Response, "status">>;

function buildRequest(provider: ModelProvider, key: string): RequestInit {
  const { auth, headers, post } = provider.keyCheck;
  const authHeader: Record<string, string> =
    auth.scheme === "bearer" ? { Authorization: `Bearer ${key}` } : { [auth.header]: key };
  const signal = AbortSignal.timeout(CHECK_TIMEOUT_MS);
  if (!post) {
    return { method: "GET", headers: { ...headers, ...authHeader }, signal };
  }
  return {
    method: "POST",
    headers: { ...headers, ...authHeader, "Content-Type": "application/json" },
    body: JSON.stringify(post.body),
    signal,
  };
}

/**
 * Checks a model API key with one request to the provider that needs a valid
 * key and generates nothing (see `ModelKeyCheck`). It proves the key is valid;
 * it can't tell whether the account has credit, which surfaces as a
 * classified failure on the first run.
 */
export class ModelKeyChecker {
  constructor(private readonly fetchFn: Fetch = fetch) {}

  async check(providerId: ModelProviderId, key: string): Promise<void> {
    const provider = getModelProvider(providerId);
    const name = provider.displayName;

    let status: number;
    try {
      const response = await this.fetchFn(provider.keyCheck.url, buildRequest(provider, key));
      status = response.status;
    } catch (error) {
      logger.warn("Model key check could not reach the provider", {
        provider: providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.PROVIDER_UNREACHABLE,
        `Couldn't reach ${name} from this server. Check that the server can make outgoing HTTPS requests, then try again.`,
      );
    }

    if (status >= 200 && status < 300) return;
    if (provider.keyCheck.post?.acceptedStatuses.includes(status)) return;
    throw this.toError(name, status);
  }

  private toError(name: string, status: number): SetupServiceError {
    // Google answers an invalid key with 400; the others use 401.
    if (status === 400 || status === 401) {
      return new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.KEY_REJECTED,
        `${name} rejected this key. Check that it was copied in full and hasn't been revoked.`,
      );
    }
    if (status === 403) {
      return new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.KEY_FORBIDDEN,
        `${name} recognised the key but refused access. If it's a restricted key, allow it to read models.`,
      );
    }
    if (status === 402) {
      return new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.KEY_NO_CREDIT,
        `${name} says this account has no credit left. Add credit, then try again.`,
      );
    }
    if (status === 429) {
      return new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.KEY_RATE_LIMITED,
        `${name} is rate limiting this key right now. Wait a minute, then try again.`,
      );
    }
    return new SetupServiceError(
      SETUP_SERVICE_ERROR_CODE.PROVIDER_ERROR,
      `${name} couldn't check the key (HTTP ${status}). Try again in a moment.`,
    );
  }
}
