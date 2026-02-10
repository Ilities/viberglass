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
    const context = await this.contextResolver.resolve(job);
    if (!context) {
      return null;
    }

    const resolvedConfig = await this.configResolver.resolve(context);
    if (!resolvedConfig) {
      return null;
    }

    return this.createTarget(context, resolvedConfig.config, resolvedConfig.providerProjectCandidates);
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
