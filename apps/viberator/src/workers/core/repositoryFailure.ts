import { JOB_FAILURE_CODE, type JobFailureCode } from "@viberglass/types";

/**
 * Network trouble on the way to the repository host: name lookups, timeouts,
 * dropped connections and the host's own gateway errors.
 */
const TRANSIENT_NETWORK =
  /could not resolve host|temporary failure in name resolution|name or service not known|\bEAI_AGAIN\b|\bENOTFOUND\b|getaddrinfo|\bECONNRESET\b|\bETIMEDOUT\b|\bENETUNREACH\b|\bEHOSTUNREACH\b|connection reset|connection timed out|operation timed out|network is unreachable|early EOF|unexpected disconnect|the remote end hung up unexpectedly|RPC failed|gnutls_handshake|SSL_ERROR_SYSCALL|returned error: 50[234]|fetch failed|socket hang up/i;

/** What a wrong address or credential says; it wins when git reports a network error alongside it. */
const ACCESS_DENIED =
  /authentication failed|permission denied|invalid username or password|could not read username|repository not found|returned error: 40[134]|HTTP 40[134]/i;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The failure code for a repository step: a passing network problem when the
 * error says so, so the task isn't paused for a setup fix it doesn't need.
 */
export function repositoryFailure(code: JobFailureCode): (error: unknown) => JobFailureCode {
  return (error) => {
    const message = messageOf(error);
    return TRANSIENT_NETWORK.test(message) && !ACCESS_DENIED.test(message) ? JOB_FAILURE_CODE.REPOSITORY_NETWORK_FAILED : code;
  };
}
