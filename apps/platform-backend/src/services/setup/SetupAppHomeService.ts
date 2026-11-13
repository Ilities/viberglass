import type { AppHomeStatus } from "@viberglass/types";
import type { AppHomeService } from "../apps/AppHomeService";
import { createAppHomeService } from "../apps/createAppSpaceServices";
import { SetupRepositoryService } from "./SetupRepositoryService";

/** Setup's App choice: saves a token that can create repositories as the App home, so App spaces are offered. */
export class SetupAppHomeService {
  constructor(
    private readonly repositories: Pick<SetupRepositoryService, "saveCreatingToken"> = new SetupRepositoryService(),
    private readonly appHome: Pick<AppHomeService, "set"> = createAppHomeService(),
  ) {}

  async saveAppHome(owner: string, token: string, updatedBy: string | null): Promise<AppHomeStatus> {
    const saved = await this.repositories.saveCreatingToken(owner, token);
    return this.appHome.set(saved, updatedBy);
  }
}
