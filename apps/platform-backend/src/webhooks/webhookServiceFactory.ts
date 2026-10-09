import { integrationRegistry } from "../integrations/registerIntegrationPlugins";
import { webhookReceiversFrom } from "./webhookReceivers";
import { WebhookConfigDAO } from "../persistence/webhook/WebhookConfigDAO";
import { WebhookDeliveryDAO } from "../persistence/webhook/WebhookDeliveryDAO";
import { DeduplicationService } from "./DeduplicationService";
import { WebhookSecretService } from "./WebhookSecretService";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { ProjectScmConfigDAO } from "../persistence/project/ProjectScmConfigDAO";
import { TaskIssueLinkDAO } from "../persistence/ticketing/TaskIssueLinkDAO";
import { TrackerIssueRuleDAO } from "../persistence/trackers/TrackerIssueRuleDAO";
import { UserDAO } from "../persistence/user/UserDAO";
import { TrackerIssueRouter } from "../services/trackers/TrackerIssueRouter";
import { TrackerIssueTaskOpener } from "../services/trackers/TrackerIssueTaskOpener";
import { TaskTurnService } from "../services/taskTurns/TaskTurnService";
import { WebhookPlanRequester } from "./WebhookPlanRequester";
import { TrackerIssueInbound } from "../services/trackers/TrackerIssueInbound";
import { AgentQuestionAnswerService } from "../services/questions/AgentQuestionAnswerService";
import { InboundEventHandler } from "./InboundEventHandler";
import { WebhookTaskCreator } from "./WebhookTaskCreator";
import { WebhookConfigResolver } from "./WebhookConfigResolver";
import { InboundWebhookDeliveryLifecycle } from "./InboundWebhookDeliveryLifecycle";
import { WebhookRetryService } from "./WebhookRetryService";
import { getCredentialFactory } from "../config/credentials";
import { WebhookService } from "./WebhookService";

let webhookService: WebhookService | null = null;

/**
 * Build a singleton webhook service used by both provider webhook routes and
 * integration-scoped retry endpoints.
 */
export function getWebhookService(): WebhookService {
  if (!webhookService) {
    const receivers = webhookReceiversFrom(integrationRegistry);
    const configDAO = new WebhookConfigDAO();
    const deliveryDAO = new WebhookDeliveryDAO();
    const deduplication = new DeduplicationService(deliveryDAO);
    const credentialProvider = getCredentialFactory();
    const secretService = new WebhookSecretService(credentialProvider);
    const ticketDAO = new TicketDAO();
    const taskTurns = new TaskTurnService();
    const planner = new WebhookPlanRequester(taskTurns);
    const issues = new TrackerIssueInbound({
      router: new TrackerIssueRouter({ rules: new TrackerIssueRuleDAO(), repositories: new ProjectScmConfigDAO() }),
      opener: new TrackerIssueTaskOpener({ tickets: ticketDAO, links: new TaskIssueLinkDAO(), users: new UserDAO(), planner }),
      turns: taskTurns,
      answers: new AgentQuestionAnswerService({ asker: taskTurns }),
    });
    const handler = new InboundEventHandler(issues, new WebhookTaskCreator(ticketDAO, planner));

    const serviceConfig = {
      enableAutoExecute: true,
      defaultTenantId: process.env.DEFAULT_TENANT_ID || "default",
    };
    const configResolver = new WebhookConfigResolver(configDAO);
    const deliveryLifecycle = new InboundWebhookDeliveryLifecycle(
      deduplication,
      deliveryDAO,
    );
    const retryService = new WebhookRetryService(
      receivers,
      configResolver,
      deliveryLifecycle,
      handler,
      deliveryDAO,
      serviceConfig,
    );

    webhookService = new WebhookService(
      receivers,
      deduplication,
      secretService,
      handler,
      configResolver,
      deliveryLifecycle,
      retryService,
      serviceConfig,
    );
  }

  return webhookService;
}
