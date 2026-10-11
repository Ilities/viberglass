import type { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import type { TrackerIssueRule, TrackerIssueRuleDAO } from "../../persistence/trackers/TrackerIssueRuleDAO";
import type { TrackerContext } from "./TrackerIssueInbound";

/** A space that takes the issue, and whether the agent writes its plan straight away. */
export interface RoutedSpace {
  projectId: string;
  plan: boolean;
}

export interface IssueRouting {
  /** Lower-cased. */
  labels: string[];
  /** `owner/repo`, for a tracker whose issues belong to a repository. */
  repository: string | null;
}

export interface RoutingResult {
  spaces: RoutedSpace[];
  /** Why no space takes the issue. */
  reason?: string;
}

interface Dependencies {
  rules: Pick<TrackerIssueRuleDAO, "listForConnection">;
  repositories: Pick<ProjectScmConfigDAO, "listRepositoriesLike">;
}

/**
 * Which spaces take a tracker issue: the spaces whose rules for the
 * connection take it, every issue or those with one of the rule's labels. A
 * space without rules takes none. An issue that belongs to a repository can
 * only go to the spaces using that repository.
 */
export class TrackerIssueRouter {
  constructor(private readonly deps: Dependencies) {}

  async route(context: TrackerContext, issue: IssueRouting): Promise<RoutingResult> {
    const all = await this.deps.rules.listForConnection(context.integrationId);
    if (all.length === 0) return { spaces: [], reason: "No space takes this connection's issues" };

    const inRepository = issue.repository ? await this.spacesUsing(issue.repository) : null;
    const rules = inRepository ? all.filter((rule) => inRepository.has(rule.projectId)) : all;
    if (rules.length === 0) return { spaces: [], reason: `No space taking this connection's issues uses the repository '${issue.repository}'` };

    const plans = new Map<string, boolean>();
    for (const rule of rules) {
      if (!takes(rule, issue.labels)) continue;
      plans.set(rule.projectId, (plans.get(rule.projectId) ?? false) || rule.planNewIssues);
    }
    if (plans.size > 0) return { spaces: [...plans].map(([projectId, plan]) => ({ projectId, plan })) };
    return {
      spaces: [],
      reason:
        issue.labels.length > 0
          ? `No space takes issues labelled ${issue.labels.map((label) => `'${label}'`).join(", ")}`
          : "The issue has no labels, and the spaces taking this connection's issues take them by label",
    };
  }

  private async spacesUsing(repository: string): Promise<Set<string>> {
    const wanted = repository.toLowerCase();
    const candidates = await this.deps.repositories.listRepositoriesLike(wanted);
    return new Set(candidates.filter((candidate) => repositoryPath(candidate.sourceRepository) === wanted).map((candidate) => candidate.projectId));
  }
}

/** A rule without a label takes every issue; one with a label, the issues with it. */
function takes(rule: TrackerIssueRule, labels: string[]): boolean {
  return rule.label === null || labels.includes(rule.label.toLowerCase());
}

/** `owner/repo` of a repository address: a URL, an SSH address or the path itself. */
function repositoryPath(address: string): string {
  const trimmed = address.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  const path = trimmed.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\//i, "").replace(/^[^@/]+@[^:/]+:/, "");
  return path.replace(/^\/+/, "").toLowerCase();
}
