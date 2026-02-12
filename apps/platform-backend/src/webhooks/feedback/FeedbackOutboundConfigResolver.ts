import type { WebhookConfig, WebhookConfigDAO } from '../../persistence/webhook/WebhookConfigDAO';
import type { ProviderType } from '../WebhookProvider';
import {
  buildProviderProjectCandidates,
  filterConfigsByProvider,
  selectDeterministicConfig,
} from '../feedbackHelpers';
import type { FeedbackProviderBehaviorResolver } from './provider-behaviors';
import type { FeedbackOutboundContext } from './FeedbackOutboundContextResolver';

export interface ResolvedConfig {
  config: WebhookConfig;
  providerProjectCandidates: string[];
}

export class FeedbackOutboundConfigResolver {
  constructor(
    private configDAO: WebhookConfigDAO,
    private providerBehaviors: FeedbackProviderBehaviorResolver,
  ) {}

  async resolve(context: FeedbackOutboundContext): Promise<ResolvedConfig | null> {
    const resolved = await this.resolveAll(context);
    return resolved[0] || null;
  }

  async resolveAll(context: FeedbackOutboundContext): Promise<ResolvedConfig[]> {
    if (context.outboundProvider === 'custom') {
      return this.resolveAllCustom(context);
    }

    const resolved = await this.resolveSingle(context);
    return resolved ? [resolved] : [];
  }

  private async resolveSingle(context: FeedbackOutboundContext): Promise<ResolvedConfig | null> {
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

  private async resolveAllCustom(context: FeedbackOutboundContext): Promise<ResolvedConfig[]> {
    const inboundConfig = context.inboundConfigId
      ? await this.configDAO.getConfigById(context.inboundConfigId)
      : null;
    const providerProjectCandidates = buildProviderProjectCandidates(context.metadata, {
      jobRepository: context.jobRepository,
      inboundProviderProjectId: inboundConfig?.providerProjectId || undefined,
    });

    if (inboundConfig?.integrationId) {
      const outboundIntegrationConfigs = await this.configDAO.listByIntegrationId(
        inboundConfig.integrationId,
        {
          direction: 'outbound',
          activeOnly: true,
        },
      );
      const integrationTargets = this.mapActiveProviderConfigs(
        outboundIntegrationConfigs,
        'custom',
        providerProjectCandidates,
      );
      if (integrationTargets.length > 0) {
        return integrationTargets;
      }
    }

    if (context.projectId) {
      const projectConfigs = await this.configDAO.listConfigsByProject(
        context.projectId,
        50,
        0,
        'outbound',
      );
      const projectTargets = this.mapActiveProviderConfigs(
        projectConfigs,
        'custom',
        providerProjectCandidates,
      );
      if (projectTargets.length > 0) {
        return projectTargets;
      }
    }

    const fallbackConfigs = await this.configDAO.listActiveConfigs(50, 0, 'outbound');
    return this.mapActiveProviderConfigs(fallbackConfigs, 'custom', providerProjectCandidates);
  }

  private mapActiveProviderConfigs(
    configs: WebhookConfig[],
    provider: ProviderType,
    providerProjectCandidates: string[],
  ): ResolvedConfig[] {
    return configs
      .filter((config) => config.provider === provider && config.active)
      .map((config) => ({
        config,
        providerProjectCandidates,
      }));
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
