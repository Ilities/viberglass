import { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import { PullRequestOutcomeDAO } from "../../persistence/job/PullRequestOutcomeDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { SecretResolutionService } from "../SecretResolutionService";
import { GitHubPullRequestOutcomeSource } from "./GitHubPullRequestOutcomeSource";
import { ProjectScmTokenResolver } from "./ProjectScmTokenResolver";
import { PullRequestOutcomeChecker } from "./PullRequestOutcomeChecker";
import { TaskMergeCompleter } from "./TaskMergeCompleter";

export function createPullRequestOutcomeChecker(): PullRequestOutcomeChecker {
  return new PullRequestOutcomeChecker(
    new PullRequestOutcomeDAO(),
    new ProjectScmTokenResolver(new ProjectScmConfigDAO(), new IntegrationCredentialDAO(), new SecretResolutionService()),
    [new GitHubPullRequestOutcomeSource()],
    [new TaskMergeCompleter()],
  );
}
