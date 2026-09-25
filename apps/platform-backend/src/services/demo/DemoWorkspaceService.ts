import type { DemoWorkspace } from "@viberglass/types";
import type { ProjectConfig } from "../../models/PMIntegration";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { DemoJobDAO } from "../../persistence/demo/DemoJobDAO";
import { DemoSeedRecordDAO, type DemoSeedRecord } from "../../persistence/demo/DemoSeedRecordDAO";
import { ProjectDAO, slugify } from "../../persistence/project/ProjectDAO";
import { UserDAO } from "../../persistence/user/UserDAO";
import { createChildLogger } from "../../config/logger";
import {
  SETUP_SERVICE_ERROR_CODE,
  SetupServiceError,
} from "../errors/SetupServiceError";
import { DEMO_SPACE_NAME } from "./demoWorkspaceContent";
import { DemoWorkspaceSeeder } from "./DemoWorkspaceSeeder";

const logger = createChildLogger({ service: "DemoWorkspaceService" });

interface Dependencies {
  records: { list(): Promise<DemoSeedRecord[]>; clear(): Promise<void> };
  projects: {
    getProject(id: string): Promise<ProjectConfig | null>;
    findByName(slug: string): Promise<ProjectConfig | null>;
    deleteProject(id: string): Promise<void>;
  };
  jobs: { deleteJobs(ids: string[]): Promise<void> };
  clankers: { deleteClanker(id: string): Promise<void> };
  users: { deleteUser(id: string): Promise<void> };
  seeder: { seed(): Promise<ProjectConfig> };
}

const defaults = (): Dependencies => ({
  records: new DemoSeedRecordDAO(),
  projects: new ProjectDAO(),
  jobs: new DemoJobDAO(),
  clankers: new ClankerDAO(),
  users: new UserDAO(),
  seeder: new DemoWorkspaceSeeder(),
});

function idsOf(records: DemoSeedRecord[], type: DemoSeedRecord["entityType"]): string[] {
  return records.filter((record) => record.entityType === type).map((record) => record.entityId);
}

/**
 * "Explore a demo workspace" (J1, ADR 0002): loads sample data beside real
 * data, and removes exactly what it loaded.
 */
export class DemoWorkspaceService {
  private readonly deps: Dependencies;

  constructor(deps: Partial<Dependencies> = {}) {
    this.deps = { ...defaults(), ...deps };
  }

  async getDemo(): Promise<DemoWorkspace | null> {
    const [projectId] = idsOf(await this.deps.records.list(), "project");
    const project = projectId ? await this.deps.projects.getProject(projectId) : null;
    return project ? { projectId: project.id, name: project.name, slug: project.slug } : null;
  }

  async load(): Promise<DemoWorkspace> {
    const existing = await this.getDemo();
    if (existing) return existing;

    if (await this.deps.projects.findByName(slugify(DEMO_SPACE_NAME))) {
      throw new SetupServiceError(
        SETUP_SERVICE_ERROR_CODE.SPACE_EXISTS,
        `There's already a space called "${DEMO_SPACE_NAME}", so the demo can't be loaded.`,
      );
    }

    try {
      const project = await this.deps.seeder.seed();
      return { projectId: project.id, name: project.name, slug: project.slug };
    } catch (error) {
      logger.error("Loading the demo workspace failed; removing what was written", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.remove();
      throw error;
    }
  }

  async remove(): Promise<void> {
    const records = await this.deps.records.list();
    // Jobs first: deleting a space only unlinks its runs from their tasks.
    await this.deps.jobs.deleteJobs(idsOf(records, "job"));
    for (const id of idsOf(records, "project")) await this.deps.projects.deleteProject(id);
    for (const id of idsOf(records, "clanker")) await this.deps.clankers.deleteClanker(id);
    for (const id of idsOf(records, "user")) await this.deps.users.deleteUser(id);
    await this.deps.records.clear();
  }
}
