import { AcpExecutor } from "@viberglass/agent-core";
import type { Logger } from "winston";
import { SessionEventForwarder } from "../../acp/SessionEventForwarder";
import { ConfigManager } from "../../config/ConfigManager";
import { AgentOrchestrator } from "../../orchestrator/AgentOrchestrator";
import GitService from "../../services/GitService";
import type { Configuration } from "../../types";
import { CallbackClient } from "../infrastructure/CallbackClient";
import type { CredentialProvider } from "../infrastructure/CredentialProvider";
import { LogForwarder } from "../runtime/LogForwarder";
import type { AgentAuthLifecycle } from "./agentAuthLifecycle";
import type { AgentAuthLifecycleFactory } from "./agentAuthLifecycleFactory";
import type { WorkerSettings } from "./workerSettings";

/** What a worker runs jobs with, once its configuration is loaded. */
export interface WorkerServices {
  config: Configuration;
  orchestrator: AgentOrchestrator;
  gitService: GitService;
  callbackClient: CallbackClient;
  logForwarder: LogForwarder;
  sessionEventForwarder: SessionEventForwarder;
  agentAuthLifecycle: AgentAuthLifecycle;
}

export interface WorkerServicesInput {
  logger: Logger;
  workDir: string;
  settings: WorkerSettings;
  callbackToken?: string;
  platformApiUrl?: string;
  credentialProvider: CredentialProvider;
  authFactory: AgentAuthLifecycleFactory;
  /** Reports progress on the job being run, whichever it is when called. */
  sendProgress: (client: CallbackClient, step: string, message: string, details?: Record<string, unknown>) => Promise<void>;
}

/** Loads the worker's configuration and builds what it runs jobs with. */
export async function createWorkerServices(input: WorkerServicesInput): Promise<WorkerServices> {
  const { logger } = input;
  const configManager = new ConfigManager(logger);
  const config = await configManager.loadConfiguration();
  logger.level = config.logging.level;

  const orchestrator = new AgentOrchestrator(configManager.getAgentConfigs(), logger, configManager, new AcpExecutor(logger));
  const callbackClient = new CallbackClient(logger, {
    platformUrl: input.platformApiUrl || process.env.PLATFORM_API_URL,
    maxRetries: 3,
    retryDelay: 1000,
    callbackToken: input.callbackToken,
  });
  return {
    config,
    orchestrator,
    gitService: new GitService(logger, config.git),
    callbackClient,
    logForwarder: new LogForwarder(logger, callbackClient),
    sessionEventForwarder: new SessionEventForwarder(callbackClient.turn, logger),
    agentAuthLifecycle: input.authFactory.create({
      requestedAgent: input.settings.requestedAgent,
      clankerConfig: input.settings.clankerConfig,
      logger,
      callbackClient,
      workDir: input.workDir,
      sendProgress: (step, message, details) => input.sendProgress(callbackClient, step, message, details),
      credentialProvider: input.credentialProvider,
    }),
  };
}
