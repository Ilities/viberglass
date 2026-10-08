import type { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import type { TrackerIssueRule, TrackerIssueRuleDAO } from "../../persistence/trackers/TrackerIssueRuleDAO";
import { parseGitHubRepository } from "../setup/gitHubRepository";
import type { TrackerContext } from "./TrackerIssueInbound";

/** A space that takes the issue, and whether the agent writes its plan straight away. */
export interface RoutedSpace {
  projectId: string;
  plan: boolean;
}

export interface IssueRouting {
  /** Lower-cased. */
  labels: string[];
  /** `owner/repo`, for GitHub. */
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
 * Which spaces take a tracker issue. Jira and Shortcut issues go to the spaces
 * that take one of their labels. A GitHub issue goes to the spaces whose
 * repository it's in: all its issues, or when the space has rules for the
 * connection, the ones its rules take.
 */
export class TrackerIssueRouter {
  constructor(private readonly deps: Dependencies) {}

  async route(context: TrackerContext, issue: IssueRouting): Promise<RoutingResult> {
    const rules = await this.deps.rules.listForConnection(context.integrationId);
    return context.provider === "github" ? this.routeGitHub(rules, issue) : routeByLabel(rules, issue.labels);
  }

  private async routeGitHub(rules: TrackerIssueRule[], issue: IssueRouting): Promise<RoutingResult> {
    if (!issue.repository) return { spaces: [], reason: "The issue has no repository" };
    const wanted = issue.repository.toLowerCase();
    const candidates = await this.deps.repositories.listRepositoriesLike(wanted);
    const projectIds = new Set(candidates.filter((candidate) => sameRepository(candidate.sourceRepository, wanted)).map((candidate) => candidate.projectId));
    if (projectIds.size === 0) return { spaces: [], reason: `No space uses the repository '${issue.repository}'` };

    const spaces = [...projectIds].flatMap((projectId): RoutedSpace[] => {
      const own = rules.filter((rule) => rule.projectId === projectId);
      if (own.length === 0) return [{ projectId, plan: false }];
      const matching = own.filter((rule) => rule.label === null || issue.labels.includes(rule.label.toLowerCase()));
      return matching.length > 0 ? [{ projectId, plan: matching.some((rule) => rule.planNewIssues) }] : [];
    });
    return spaces.length > 0 ? { spaces } : { spaces, reason: `The spaces using '${issue.repository}' only take issues with certain labels` };
  }
}

function routeByLabel(rules: TrackerIssueRule[], labels: string[]): RoutingResult {
  const plans = new Map<string, boolean>();
  for (const rule of rules) {
    if (rule.label === null || !labels.includes(rule.label.toLowerCase())) continue;
    plans.set(rule.projectId, (plans.get(rule.projectId) ?? false) || rule.planNewIssues);
  }
  if (plans.size > 0) return { spaces: [...plans].map(([projectId, plan]) => ({ projectId, plan })) };
  return {
    spaces: [],
    reason: labels.length > 0 ? `No space takes issues labelled ${labels.map((label) => `'${label}'`).join(", ")}` : "The issue has no labels, and spaces take issues by label",
  };
}

function sameRepository(address: string, wanted: string): boolean {
  const parsed = parseGitHubRepository(address);
  return !!parsed && `${parsed.owner}/${parsed.repo}`.toLowerCase() === wanted;
}
