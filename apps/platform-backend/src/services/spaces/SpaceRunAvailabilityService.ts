import { FILES_RUNS_UNAVAILABLE } from "@viberglass/types";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import {
  TICKET_SERVICE_ERROR_CODE,
  TicketServiceError,
} from "../errors/TicketServiceError";

export class SpaceRunAvailabilityService {
  constructor(
    private readonly projects: Pick<
      ProjectDAO,
      "getProject"
    > = new ProjectDAO(),
  ) {}

  async assertAvailable(projectId: string): Promise<void> {
    const project = await this.projects.getProject(projectId);
    if (!project) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.SPACE_NOT_FOUND,
        "Space not found",
      );
    }
    if (project.backingKind === "files") {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.FILES_EXECUTION_UNAVAILABLE,
        FILES_RUNS_UNAVAILABLE,
      );
    }
  }
}
