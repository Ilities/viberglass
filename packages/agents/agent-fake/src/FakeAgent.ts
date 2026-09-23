import * as path from "path";
import { BaseAgent } from "@viberglass/agent-core";
import type {
  AgentCLIResult,
  ExecutionContext,
  IAgentGitService,
} from "@viberglass/agent-core";
import { Logger } from "winston";
import type { FakeConfig } from "./config";
import { FakeTurnRunner } from "./FakeTurnRunner";

/**
 * Deterministic agent for end-to-end tests. One-shot runs execute the fake
 * turn in-process; live sessions spawn the bundled fake ACP server.
 */
export class FakeAgent extends BaseAgent<FakeConfig> {
  constructor(
    config: FakeConfig,
    logger: Logger,
    gitService?: IAgentGitService,
    private readonly turnRunner: FakeTurnRunner = new FakeTurnRunner(),
  ) {
    super(config, logger, gitService);
  }

  protected requiresApiKey(): boolean {
    return false;
  }

  public getAcpServerCommand(): string[] {
    return [process.execPath, path.join(__dirname, "fakeAcpServerMain.js")];
  }

  protected async executeAgentCLI(
    prompt: string,
    context: ExecutionContext,
    workDir: string,
  ): Promise<AgentCLIResult> {
    await this.cloneRepository(context.repoUrl, context.branch, workDir);
    const message = await this.turnRunner.run(
      prompt,
      path.join(workDir, "repo"),
    );
    this.logger.info(message);
    return { success: true };
  }
}
