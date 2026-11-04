import { AppReleaseDAO } from "../../persistence/apps/AppReleaseDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { SpaceOwnershipDAO } from "../../persistence/project/SpaceOwnershipDAO";
import { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { AuditRecorder } from "../audit/AuditRecorder";
import { createPullRequestOutcomeChecker } from "../pull-request-outcomes/createPullRequestOutcomeChecker";
import { createProjectRepositoryResolver } from "../repositories/createProjectRepositoryResolver";
import { TaskAskPolicyService } from "../taskTurns/TaskAskPolicyService";
import { MakeLiveService } from "./MakeLiveService";
import { ReleaseBuildService } from "./ReleaseBuildService";

export function createMakeLiveService(): MakeLiveService {
  const releases = new AppReleaseDAO();
  return new MakeLiveService({
    policy: new TaskAskPolicyService(),
    owners: new SpaceOwnershipDAO(),
    tickets: new TicketDAO(),
    pullRequests: new TaskPullRequestDAO(),
    repositories: createProjectRepositoryResolver(),
    users: new UserDAO(),
    outcomes: createPullRequestOutcomeChecker(),
    scmConfigs: new ProjectScmConfigDAO(),
    builds: new ReleaseBuildService(releases),
    releases,
    audit: new AuditRecorder(),
  });
}
