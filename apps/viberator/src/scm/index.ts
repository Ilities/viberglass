/**
 * SCM Authentication Module
 * Provides generic authentication for various source control management systems
 */

export { SCMAuthProvider, SCMAuthConfig } from "./types";
export { SCMAuthFactory } from "./SCMAuthFactory";
export { GithubAuthProvider } from "./providers/GithubAuthProvider";
export { GitlabAuthProvider } from "./providers/GitlabAuthProvider";
export { BitbucketAuthProvider } from "./providers/BitbucketAuthProvider";
