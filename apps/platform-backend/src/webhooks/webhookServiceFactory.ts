import { ProviderRegistry } from "./ProviderRegistry";
import {
  CustomWebhookProvider,
  GitHubWebhookProvider,
  JiraWebhookProvider,
} from "./providers";
import {
  createShortcutWebhookProviderDependencies,
  ShortcutWebhookProvider,
} from "./providers/ShortcutWebhookProvider";
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
import { createDefaultInboundEventProcessorResolver } from "./InboundEventProcessorResolver";
import { WebhookConfigResolver } from "./WebhookConfigResolver";
import { createDefaultProviderWebhookPolicyResolver } from "./ProviderWebhookPolicyResolver";
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
    const registry = new ProviderRegistry();

    const githubProvider = new GitHubWebhookProvider({
      type: "github",
      secretLocation: "database",
      algorithm: "sha256",
      allowedEvents: ["issues.opened", "issues.edited", "issues.labeled", "issue_comment.created"],
    });
    registry.register(githubProvider);

    const jiraProvider = new JiraWebhookProvider({
      type: "jira",
      secretLocation: "database",
      algorithm: "sha256",
      allowedEvents: ["issue_created", "issue_updated", "comment_created"],
    });
    registry.register(jiraProvider);

    const shortcutProvider = new ShortcutWebhookProvider(
      {
        type: "shortcut",
        secretLocation: "database",
        algorithm: "sha256",
        allowedEvents: ["story_created", "story_updated", "comment_created"],
      },
      createShortcutWebhookProviderDependencies(),
    );
    registry.register(shortcutProvider);

    const customProvider = new CustomWebhookProvider({
      type: "custom",
      secretLocation: "database",
      algorithm: "sha256",
      allowedEvents: ["ticket_created"],
    });
    registry.register(customProvider);

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
    const inboundProcessorResolver = createDefaultInboundEventProcessorResolver(
      ticketDAO,
      planner,
      issues,
    );

    const serviceConfig = {
      enableAutoExecute: true,
      defaultTenantId: process.env.DEFAULT_TENANT_ID || "default",
    };
    const configResolver = new WebhookConfigResolver(configDAO);
    const providerPolicyResolver = createDefaultProviderWebhookPolicyResolver();
    const deliveryLifecycle = new InboundWebhookDeliveryLifecycle(
      deduplication,
      deliveryDAO,
    );
    const retryService = new WebhookRetryService(
      registry,
      configResolver,
      deliveryLifecycle,
      providerPolicyResolver,
      inboundProcessorResolver,
      deliveryDAO,
      serviceConfig,
    );

    webhookService = new WebhookService(
      registry,
      deduplication,
      secretService,
      inboundProcessorResolver,
      configResolver,
      providerPolicyResolver,
      deliveryLifecycle,
      retryService,
      serviceConfig,
    );
  }

  return webhookService;
}

export function resetWebhookServiceForTests(): void {
  webhookService = null;
}
