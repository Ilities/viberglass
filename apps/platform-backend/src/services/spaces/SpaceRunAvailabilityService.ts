import { FILES_BUILD_UNAVAILABLE, type TaskTurnAction } from "@viberglass/types";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import {
  TICKET_SERVICE_ERROR_CODE,
  TicketServiceError,
} from "../errors/TicketServiceError";

/** What a space's backing lets a turn do: Files spaces save files rather than build pull requests. */
export class SpaceRunAvailabilityService {
  constructor(
    private readonly projects: Pick<
      ProjectDAO,
      "getProject"
    > = new ProjectDAO(),
  ) {}

  async assertAvailable(projectId: string, action: TaskTurnAction): Promise<void> {
    const project = await this.projects.getProject(projectId);
    if (!project) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.SPACE_NOT_FOUND,
        "Space not found",
      );
    }
    if (project.backingKind === "files" && action === "code") {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.FILES_BUILD_UNAVAILABLE,
        FILES_BUILD_UNAVAILABLE,
      );
    }
  }
}
