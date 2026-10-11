import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { InfrastructureConfig } from "../config";
import { emailSetupSteps, sesDkimStatus, sesProductionAccess } from "./emailSetupSteps";

/**
 * Email component outputs.
 */
export interface EmailOutputs {
  /** SES identity ARN the backend may send from */
  identityArn: pulumi.Output<string>;
  /** Sender address, e.g. "Viberglass <notifications@viberglass.io>" */
  from: string;
  /** DKIM CNAME records; created in Route 53 when the zone is configured, else add them by hand */
  dkimRecords: pulumi.Output<Array<{ name: string; value: string }>>;
  /** What's left to do by hand (DNS, SES production access); empty once email can reach anyone */
  setupSteps: pulumi.Output<string[]>;
}

/**
 * Sends invite links and notifications through Amazon SES (phase-2-3-handover
 * §2.6). Verifies the sending domain with Easy DKIM; the backend signs with its
 * task role, so no SMTP credentials exist.
 *
 * A new SES account starts in the sandbox and only delivers to verified
 * addresses until production access is requested in the SES console.
 */
export function createEmail(config: InfrastructureConfig): EmailOutputs | undefined {
  if (!config.emailDomain) return undefined;
  const domain = config.emailDomain;

  const identity = new aws.sesv2.EmailIdentity(`${config.environment}-viberglass-email`, {
    emailIdentity: domain,
    tags: config.tags,
  });

  const dkimRecords = identity.dkimSigningAttributes.apply((attributes) =>
    (attributes?.tokens ?? []).map((token) => ({
      name: `${token}._domainkey.${domain}`,
      value: `${token}.dkim.amazonses.com`,
    })),
  );

  if (config.route53ZoneId) {
    // SES always issues three DKIM tokens.
    for (let index = 0; index < 3; index++) {
      new aws.route53.Record(`${config.environment}-viberglass-email-dkim-${index}`, {
        zoneId: config.route53ZoneId,
        name: dkimRecords.apply((records) => records[index].name),
        type: "CNAME",
        ttl: 1800,
        records: [dkimRecords.apply((records) => records[index].value)],
      });
    }
  }

  // Shown on every `pulumi up` until done, so whoever runs the stack learns the manual steps.
  const setupSteps = pulumi
    .all([
      identity.dkimSigningAttributes,
      dkimRecords,
      sesProductionAccess(config.awsRegion),
      identity.emailIdentity.apply((name) => sesDkimStatus(config.awsRegion, name)),
    ])
    .apply(([attributes, records, productionAccess, liveDkimStatus]) => {
      const steps = emailSetupSteps({
        domain,
        region: config.awsRegion,
        dkimRecordsManaged: Boolean(config.route53ZoneId),
        dkimRecords: records,
        dkimStatus: liveDkimStatus ?? attributes?.status,
        productionAccess,
      });
      for (const step of steps) pulumi.log.warn(step, identity);
      return steps;
    });

  return {
    identityArn: identity.arn,
    from: config.emailFrom ?? `Viberglass <notifications@${domain}>`,
    dkimRecords,
    setupSteps,
  };
}
