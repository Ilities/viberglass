import type { SpaceBackingKind } from "@viberglass/types";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import {
  TICKET_SERVICE_ERROR_CODE,
  TicketServiceError,
} from "../errors/TicketServiceError";

/** What a turn may do depends on the space's backing: in a Files space a build makes an artifact, not a pull request. */
export class SpaceRunAvailabilityService {
  constructor(
    private readonly projects: Pick<
      ProjectDAO,
      "getProject"
    > = new ProjectDAO(),
  ) {}

  async backingOf(projectId: string): Promise<SpaceBackingKind> {
    const project = await this.projects.getProject(projectId);
    if (!project) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.SPACE_NOT_FOUND,
        "Space not found",
      );
    }
    return project.backingKind;
  }
}
