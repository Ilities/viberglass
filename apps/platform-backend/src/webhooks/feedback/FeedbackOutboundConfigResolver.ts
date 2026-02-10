import type { WebhookConfig, WebhookConfigDAO } from '../../persistence/webhook/WebhookConfigDAO';
import type { ProviderType } from '../WebhookProvider';
import {
  buildProviderProjectCandidates,
  filterConfigsByProvider,
  selectDeterministicConfig,
} from '../feedbackHelpers';
import type { FeedbackProviderBehaviorResolver } from './provider-behaviors';
import type { FeedbackOutboundContext } from './FeedbackOutboundContextResolver';

interface ResolvedConfig {
  config: WebhookConfig;
  providerProjectCandidates: string[];
}

export class FeedbackOutboundConfigResolver {
  constructor(
    private configDAO: WebhookConfigDAO,
    private providerBehaviors: FeedbackProviderBehaviorResolver,
  ) {}

  async resolve(context: FeedbackOutboundContext): Promise<ResolvedConfig | null> {
    if (context.inboundConfigId) {
      const inboundConfig = await this.configDAO.getConfigById(context.inboundConfigId);
      const candidates = buildProviderProjectCandidates(context.metadata, {
        jobRepository: context.jobRepository,
        inboundProviderProjectId: inboundConfig?.providerProjectId || undefined,
      });

      const inboundResolved = await this.resolveFromInboundConfig(context, inboundConfig, candidates);
      if (inboundResolved) {
        return inboundResolved;
      }
    }

    const candidates = buildProviderProjectCandidates(context.metadata, {
      jobRepository: context.jobRepository,
    });

    const providerProjectResolved = await this.resolveByProviderProject(
      context.outboundProvider,
      candidates,
    );
    if (providerProjectResolved) {
      return {
        config: providerProjectResolved,
        providerProjectCandidates: candidates,
      };
    }

    if (context.projectId) {
      const projectConfigs = await this.configDAO.listConfigsByProject(
        context.projectId,
        50,
        0,
        'outbound',
      );
      const projectConfig = selectDeterministicConfig(
        filterConfigsByProvider(projectConfigs, context.outboundProvider),
        candidates,
      );
      if (projectConfig) {
        return {
          config: projectConfig,
          providerProjectCandidates: candidates,
        };
      }
    }

    const fallbacks = await this.configDAO.listActiveConfigs(50, 0, 'outbound');
    const fallbackConfig = selectDeterministicConfig(
      filterConfigsByProvider(fallbacks, context.outboundProvider),
      candidates,
    );
    if (!fallbackConfig) {
      return null;
    }

    return {
      config: fallbackConfig,
      providerProjectCandidates: candidates,
    };
  }

  private async resolveFromInboundConfig(
    context: FeedbackOutboundContext,
    inboundConfig: WebhookConfig | null,
    providerProjectCandidates: string[],
  ): Promise<ResolvedConfig | null> {
    if (inboundConfig?.integrationId) {
      const outboundIntegrationConfigs = await this.configDAO.listByIntegrationId(
        inboundConfig.integrationId,
        {
          direction: 'outbound',
          activeOnly: true,
        },
      );

      const integrationMatch = selectDeterministicConfig(
        filterConfigsByProvider(outboundIntegrationConfigs, context.outboundProvider),
        providerProjectCandidates,
      );
      if (integrationMatch) {
        return {
          config: integrationMatch,
          providerProjectCandidates,
        };
      }

      const outboundByIntegration = await this.configDAO.getByIntegrationId(
        inboundConfig.integrationId,
        'outbound',
      );
      if (
        outboundByIntegration &&
        (!context.outboundProvider || outboundByIntegration.provider === context.outboundProvider)
      ) {
        return {
          config: outboundByIntegration,
          providerProjectCandidates,
        };
      }
    }

    const providerProjectMatch = await this.resolveByProviderProject(
      context.outboundProvider,
      providerProjectCandidates,
    );
    if (!providerProjectMatch) {
      return null;
    }

    return {
      config: providerProjectMatch,
      providerProjectCandidates,
    };
  }

  private async resolveByProviderProject(
    provider: ProviderType | undefined,
    providerProjectCandidates: string[],
  ): Promise<WebhookConfig | null> {
    if (!provider || !this.providerBehaviors.resolve(provider).supportsOutboundPosting()) {
      return null;
    }

    for (const providerProjectId of providerProjectCandidates) {
      const config = await this.configDAO.getActiveConfigByProviderProject(
        provider,
        providerProjectId,
        'outbound',
      );

      if (config) {
        return config;
      }
    }

    return null;
  }
}
