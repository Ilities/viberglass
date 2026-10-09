import { PullRequestOutcomeDAO } from "../../persistence/job/PullRequestOutcomeDAO";
import { createProjectRepositoryResolver } from "../repositories/createProjectRepositoryResolver";
import { PullRequestOutcomeChecker } from "./PullRequestOutcomeChecker";
import { TaskMergeCompleter } from "./TaskMergeCompleter";

export function createPullRequestOutcomeChecker(): PullRequestOutcomeChecker {
  return new PullRequestOutcomeChecker(
    new PullRequestOutcomeDAO(),
    createProjectRepositoryResolver(),
    [new TaskMergeCompleter()],
  );
}
