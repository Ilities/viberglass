import { TaskTurnFactsDAO } from "../../persistence/agentSession/TaskTurnFactsDAO";
import { PullRequestOutcomeDAO } from "../../persistence/job/PullRequestOutcomeDAO";
import { TaskPullRequestDAO } from "../../persistence/ticketing/TaskPullRequestDAO";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { createProjectRepositoryResolver } from "../repositories/createProjectRepositoryResolver";
import { TaskActivityRecorder } from "../tasks/TaskActivityRecorder";
import { PullRequestOutcomeChecker } from "./PullRequestOutcomeChecker";
import { TaskMergeCompleter } from "./TaskMergeCompleter";
import { TaskUnmergedCloser } from "./TaskUnmergedCloser";

export function createPullRequestOutcomeChecker(): PullRequestOutcomeChecker {
  return new PullRequestOutcomeChecker(
    new PullRequestOutcomeDAO(),
    createProjectRepositoryResolver(),
    [
      new TaskMergeCompleter(),
      new TaskUnmergedCloser({
        pullRequests: new TaskPullRequestDAO(),
        turns: new TaskTurnFactsDAO(),
        tickets: new TicketDAO(),
        activity: new TaskActivityRecorder(),
      }),
    ],
  );
}
