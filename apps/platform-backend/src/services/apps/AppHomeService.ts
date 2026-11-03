import type { AppHome, AppHomeStatus } from "@viberglass/types";
import type { WorkspaceSettingsDAO } from "../../persistence/workspace/WorkspaceSettingsDAO";
import type { ConnectionRepositoryCreator } from "../repositories/ConnectionRepositoryCreator";
import { appSpaceAvailability } from "./appSpaceAvailability";
import { AppSpaceError } from "./AppSpaceError";

/** The App home an admin sets, and whether App spaces can be offered. */
export class AppHomeService {
  constructor(
    private readonly settings: Pick<WorkspaceSettingsDAO, "getAppHome" | "setAppHome">,
    private readonly creator: Pick<ConnectionRepositoryCreator, "listOwners">,
    private readonly env: () => Record<string, string | undefined> = () => process.env,
  ) {}

  async status(): Promise<AppHomeStatus> {
    const home = await this.settings.getAppHome();
    return { home, availability: appSpaceAvailability(this.env(), home) };
  }

  /** Checks the token can create repositories under the owner before saving. */
  async set(home: AppHome, updatedBy: string | null): Promise<AppHomeStatus> {
    const owners = await this.creator.listOwners(home.integrationId, home.credentialId);
    const owner = owners.find((candidate) => candidate.name.toLowerCase() === home.owner.trim().toLowerCase());
    if (!owner) {
      throw new AppSpaceError(
        "OWNER_UNAVAILABLE",
        owners.length > 0
          ? `This token can't create repositories under ${home.owner.trim()}. Choose one of: ${owners.map((o) => o.name).join(", ")}.`
          : "This token can't create repositories. Choose another token.",
      );
    }
    await this.settings.setAppHome({ ...home, owner: owner.name }, updatedBy);
    return this.status();
  }

  async clear(updatedBy: string | null): Promise<AppHomeStatus> {
    await this.settings.setAppHome(null, updatedBy);
    return this.status();
  }
}
