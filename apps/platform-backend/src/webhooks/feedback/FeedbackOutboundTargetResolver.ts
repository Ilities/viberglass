import { createOutboundTarget, type OutboundTarget } from '../feedbackHelpers';
import type { JobWithTicket } from './types';
import type { FeedbackProviderBehaviorResolver } from './provider-behaviors';
import {
  type FeedbackOutboundContext,
  FeedbackOutboundContextResolver,
} from './FeedbackOutboundContextResolver';
import { FeedbackOutboundConfigResolver } from './FeedbackOutboundConfigResolver';

export class FeedbackOutboundTargetResolver {
  constructor(
    private contextResolver: FeedbackOutboundContextResolver,
    private configResolver: FeedbackOutboundConfigResolver,
    private providerBehaviors: FeedbackProviderBehaviorResolver,
  ) {}

  async resolve(job: JobWithTicket): Promise<OutboundTarget | null> {
    const targets = await this.resolveAll(job);
    return targets[0] || null;
  }

  async resolveAll(job: JobWithTicket): Promise<OutboundTarget[]> {
    const context = await this.contextResolver.resolve(job);
    if (!context) {
      return [];
    }

    const resolvedConfigs = await this.configResolver.resolveAll(context);
    if (resolvedConfigs.length === 0) {
      return [];
    }

    return resolvedConfigs.map((resolvedConfig) =>
      this.createTarget(
        context,
        resolvedConfig.config,
        resolvedConfig.providerProjectCandidates,
      ),
    );
  }

  private createTarget(
    context: FeedbackOutboundContext,
    config: OutboundTarget['config'],
    providerProjectCandidates: string[],
  ): OutboundTarget {
    const behavior = this.providerBehaviors.resolve(config.provider);
    const overrides = behavior.resolveProviderConfigOverrides({
      webhookConfig: config,
      ticketExternalTicketUrl: context.externalTicketUrl,
      metadata: context.metadata,
    });

    return createOutboundTarget(
      config,
      context.externalTicketId,
      providerProjectCandidates,
      overrides,
    );
  }
}
