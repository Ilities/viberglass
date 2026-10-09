import { TaskBuildDAO } from "../../persistence/job/TaskBuildDAO";
import { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import { createProjectRepositoryResolver } from "../repositories/createProjectRepositoryResolver";
import { BuildPullRequestService } from "./BuildPullRequestService";

export function createBuildPullRequestService(): BuildPullRequestService {
  return new BuildPullRequestService(createProjectRepositoryResolver(), new TaskBuildDAO(), new TaskPullRequestDAO());
}
