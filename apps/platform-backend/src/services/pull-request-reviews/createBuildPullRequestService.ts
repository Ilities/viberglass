import { TaskBuildDAO } from "../../persistence/job/TaskBuildDAO";
import { IntegrationCredentialDAO } from "../../persistence/integrations/IntegrationCredentialDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { ProjectScmTokenResolver } from "../pull-request-outcomes/ProjectScmTokenResolver";
import { SecretResolutionService } from "../SecretResolutionService";
import { BuildPullRequestService } from "./BuildPullRequestService";
import { GitHubPullRequestReviewSource } from "./GitHubPullRequestReviewSource";

export function createBuildPullRequestService(): BuildPullRequestService {
  return new BuildPullRequestService(
    new GitHubPullRequestReviewSource(),
    new ProjectScmTokenResolver(new ProjectScmConfigDAO(), new IntegrationCredentialDAO(), new SecretResolutionService()),
    new TaskBuildDAO(),
  );
}
