import { isObjectRecord } from "@viberglass/types";

/** GraphQL for where the pull request's latest commit is deployed, and its preview checks. */
export const PREVIEW_FIELDS = `
      latestCommit: commits(last: 1) {
        nodes {
          commit {
            deployments(last: 5) { nodes { latestStatus { state environmentUrl } } }
            checkSuites(first: 20) { nodes { app { slug } checkRuns(first: 5) { nodes { detailsUrl conclusion } } } }
          }
        }
      }`;

/** Apps whose check runs link to a preview of the change. */
const PREVIEW_APPS = new Set(["vercel", "netlify", "cloudflare-pages", "cloudflare-workers-and-pages", "render"]);

const nodes = (connection: unknown): Record<string, unknown>[] => {
  const list = isObjectRecord(connection) ? connection.nodes : undefined;
  return Array.isArray(list) ? list.filter(isObjectRecord) : [];
};

/**
 * A preview link for the pull request: a successful deployment's
 * environment URL, else a preview app's successful check run. Null when the
 * repository reports neither.
 */
export function previewUrlOf(pullRequest: Record<string, unknown>): string | null {
  const commit = nodes(pullRequest.latestCommit).map((node) => node.commit).find(isObjectRecord);
  if (!commit) return null;

  const deployed = nodes(commit.deployments)
    .reverse()
    .map((deployment) => deployment.latestStatus)
    .find((status) => isObjectRecord(status) && status.state === "SUCCESS" && typeof status.environmentUrl === "string");
  if (isObjectRecord(deployed) && typeof deployed.environmentUrl === "string") return deployed.environmentUrl;

  for (const suite of nodes(commit.checkSuites)) {
    const slug = isObjectRecord(suite.app) ? suite.app.slug : null;
    if (typeof slug !== "string" || !PREVIEW_APPS.has(slug)) continue;
    const run = nodes(suite.checkRuns).find((check) => check.conclusion === "SUCCESS" && typeof check.detailsUrl === "string");
    if (run && typeof run.detailsUrl === "string") return run.detailsUrl;
  }
  return null;
}
