import { JOB_FAILURE_CODE } from "@viberglass/types";
import { repositoryFailure } from "./repositoryFailure";

describe("repositoryFailure", () => {
  const access = repositoryFailure(JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED);
  const write = repositoryFailure(JOB_FAILURE_CODE.REPOSITORY_WRITE_FAILED);

  it.each([
    "Git clone failed: Cloning into '/work/repo'...\nfatal: unable to access 'https://github.com/acme/app.git/': Could not resolve host: github.com",
    "Git fetch failed: getaddrinfo EAI_AGAIN github.com",
    "fetch failed: getaddrinfo ENOTFOUND api.github.com",
    "Failed to push branch: fatal: unable to access 'https://github.com/acme/app.git/': Failed to connect to github.com port 443 after 130000 ms: Connection timed out",
    "Git clone failed: error: RPC failed; curl 56 OpenSSL SSL_read: Connection reset by peer\nfatal: early EOF",
    "Git clone failed: fatal: unable to access 'https://github.com/acme/app.git/': The requested URL returned error: 503",
  ])("calls a network hiccup a network problem: %s", (message) => {
    expect(access(new Error(message))).toBe(JOB_FAILURE_CODE.REPOSITORY_NETWORK_FAILED);
    expect(write(new Error(message))).toBe(JOB_FAILURE_CODE.REPOSITORY_NETWORK_FAILED);
  });

  it.each([
    "Git clone failed: remote: Repository not found.\nfatal: repository 'https://github.com/acme/nope.git/' not found",
    "Git clone failed: fatal: Authentication failed for 'https://github.com/acme/app.git/'",
    "Git clone failed: fatal: unable to access 'https://github.com/acme/app.git/': The requested URL returned error: 403",
    "Git clone failed: error: RPC failed; HTTP 401 curl 22 The requested URL returned error: 401\nfatal: the remote end hung up unexpectedly",
  ])("keeps the step's own code for a wrong address or credential: %s", (message) => {
    expect(access(new Error(message))).toBe(JOB_FAILURE_CODE.REPOSITORY_ACCESS_FAILED);
  });

  it("keeps the step's own code for errors that aren't errors", () => {
    expect(write("push rejected")).toBe(JOB_FAILURE_CODE.REPOSITORY_WRITE_FAILED);
  });
});
