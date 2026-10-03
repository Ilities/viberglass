import * as os from "os";
import { agentRegistry } from "../../agents/registerPlugins";
import { SkillInstaller } from "../runtime/SkillInstaller";
import type { JobRunnerParams } from "./jobPipeline";

/** Puts the runner's skills where the selected agent's harness reads them, after any restored session state. */
export async function installSkills(params: JobRunnerParams, agentName: string): Promise<void> {
  const { data, callbackClient, logger, skills } = params;
  if (skills.length > 0) await params.sendProgress("skills", `Installing ${skills.length === 1 ? "1 skill" : `${skills.length} skills`}`);
  const installer = new SkillInstaller((skillId) => callbackClient.fetchSkill(data.id, data.tenantId, skillId), logger);
  await installer.install(skills, os.homedir(), agentRegistry().getSkillDirs(agentName));
}
