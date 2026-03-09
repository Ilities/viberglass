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
import { ProjectIntegrationLinkDAO } from "../persistence/integrations";
import { JobService } from "../services/JobService";
import { FeedbackService } from "./FeedbackService";
import { FeedbackOutboundConfigResolver } from "./feedback/FeedbackOutboundConfigResolver";
import { FeedbackOutboundContextResolver } from "./feedback/FeedbackOutboundContextResolver";
import { FeedbackEventDispatcher } from "./feedback/FeedbackEventDispatcher";
import { CustomOutboundTargetDispatcher } from "./feedback/CustomOutboundTargetDispatcher";
import { FeedbackDeliveryTracker } from "./feedback/FeedbackDeliveryTracker";
import { FeedbackTargetDispatchRunner } from "./feedback/FeedbackTargetDispatchRunner";
import { FeedbackOutboundTargetResolver } from "./feedback/FeedbackOutboundTargetResolver";
import { FeedbackRetryExecutor } from "./feedback/FeedbackRetryExecutor";
import { createDefaultFeedbackProviderBehaviorResolver } from "./feedback/provider-behaviors";
import { createDefaultInboundEventProcessorResolver } from "./InboundEventProcessorResolver";
import { WebhookConfigResolver } from "./WebhookConfigResolver";
import { createDefaultProviderWebhookPolicyResolver } from "./ProviderWebhookPolicyResolver";
import { InboundWebhookDeliveryLifecycle } from "./InboundWebhookDeliveryLifecycle";
import { WebhookRetryService } from "./WebhookRetryService";
import { getCredentialFactory } from "../config/credentials";
import { WebhookService } from "./WebhookService";

let webhookService: WebhookService | null = null;
let feedbackService: FeedbackService | null = null;

function createFeedbackService(): FeedbackService {
  const registry = new ProviderRegistry();

  const githubProvider = new GitHubWebhookProvider({
    type: "github",
    secretLocation: "database",
    algorithm: "sha256",
    allowedEvents: ["issues.opened", "issue_comment.created"],
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
  const credentialProvider = getCredentialFactory();
  const secretService = new WebhookSecretService(credentialProvider);
  const ticketDAO = new TicketDAO();
  const providerBehaviorResolver =
    createDefaultFeedbackProviderBehaviorResolver();
  const outboundContextResolver = new FeedbackOutboundContextResolver(
    ticketDAO,
    providerBehaviorResolver,
  );
  const outboundConfigResolver = new FeedbackOutboundConfigResolver(
    configDAO,
    providerBehaviorResolver,
  );
  const outboundTargetResolver = new FeedbackOutboundTargetResolver(
    outboundContextResolver,
    outboundConfigResolver,
    providerBehaviorResolver,
  );
  const retryExecutor = new FeedbackRetryExecutor();
  const customDispatcher = new CustomOutboundTargetDispatcher();
  const deliveryTracker = new FeedbackDeliveryTracker(deliveryDAO);
  const targetRunner = new FeedbackTargetDispatchRunner(
    registry,
    secretService,
    retryExecutor,
    providerBehaviorResolver,
    customDispatcher,
    deliveryTracker,
  );
  const eventDispatcher = new FeedbackEventDispatcher(
    outboundTargetResolver,
    targetRunner,
  );

  return new FeedbackService(registry, configDAO, eventDispatcher);
}

export function getFeedbackService(): FeedbackService {
  if (!feedbackService) {
    feedbackService = createFeedbackService();
  }

  return feedbackService;
}

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
      allowedEvents: ["issues.opened", "issue_comment.created"],
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
    const projectScmConfigDAO = new ProjectScmConfigDAO();
    const projectIntegrationLinkDAO = new ProjectIntegrationLinkDAO();
    const jobService = new JobService(getFeedbackService());
    const inboundProcessorResolver = createDefaultInboundEventProcessorResolver(
      ticketDAO,
      jobService,
      projectScmConfigDAO,
      projectIntegrationLinkDAO,
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
  feedbackService = null;
}
