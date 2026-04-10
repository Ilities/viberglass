import { BaseAgent } from "@viberglass/agent-core";
import type { BaseAgentConfig } from "@viberglass/agent-core";
import { Logger } from "winston";
import GitService from "../services/GitService";

/**
 * Extends the framework's BaseAgent with the viberator GitService implementation.
 * All concrete agent classes in this package extend ViberatorBaseAgent so they
 * get real git operations (clone, getChangedFiles) injected automatically.
 */
export abstract class ViberatorBaseAgent<
  C extends BaseAgentConfig = BaseAgentConfig,
> extends BaseAgent<C> {
  constructor(config: C, logger: Logger) {
    super(
      config,
      logger,
      new GitService(logger, {
        userName: process.env.GIT_USER_NAME || "Vibes Viber",
        userEmail:
          process.env.GIT_USER_EMAIL || "viberator@viberglass.io",
      }),
    );
  }
}
