import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/** The port the backend serves artifact previews on, next to its API port. */
export const PREVIEW_PORT = 8890;

export interface PreviewOriginOptions {
  environment: string;
  vpcId: pulumi.Input<string>;
  /** Hostname browsers load previews from; never the app's or the API's host. */
  previewDomain: string;
  route53ZoneId: pulumi.Input<string>;
  /** The ALB's HTTPS listener, which gets the preview host as a second certificate and rule. */
  httpsListenerArn: pulumi.Input<string>;
  albDnsName: pulumi.Input<string>;
  albZoneId: pulumi.Input<string>;
  /** The backend's API port: previews have no health route of their own, and both run in one process. */
  backendHealthPort: number;
  healthCheckPath: string;
  tags: { [key: string]: string };
}

export interface PreviewOriginOutputs {
  /** Target group the backend service registers its preview port in. */
  targetGroupArn: pulumi.Output<string>;
  publicUrl: pulumi.Output<string>;
}

/**
 * Artifact previews on their own host, through the backend's load balancer:
 * a certificate and DNS name for the host, and a listener rule sending its
 * requests to the backend's preview port.
 */
export function createPreviewOrigin(
  options: PreviewOriginOptions,
): PreviewOriginOutputs {
  const name = `${options.environment}-viberglass-preview`;

  const certificate = new aws.acm.Certificate(`${name}-cert`, {
    domainName: options.previewDomain,
    validationMethod: "DNS",
    tags: { Name: `${name}-cert`, ...options.tags },
  });
  const validationOption = certificate.domainValidationOptions[0];
  const validationRecord = new aws.route53.Record(`${name}-cert-validation`, {
    zoneId: options.route53ZoneId,
    name: validationOption.resourceRecordName,
    type: validationOption.resourceRecordType,
    records: [validationOption.resourceRecordValue],
    ttl: 60,
  });
  const validation = new aws.acm.CertificateValidation(
    `${name}-cert-validation`,
    {
      certificateArn: certificate.arn,
      validationRecordFqdns: [validationRecord.fqdn],
    },
  );
  new aws.lb.ListenerCertificate(`${name}-listener-cert`, {
    listenerArn: options.httpsListenerArn,
    certificateArn: validation.certificateArn,
  });

  const targetGroup = new aws.lb.TargetGroup(`${name}-tg`, {
    name: `viberglass-${options.environment}-preview-tg`,
    port: PREVIEW_PORT,
    protocol: "HTTP",
    vpcId: options.vpcId,
    targetType: "ip",
    healthCheck: {
      enabled: true,
      path: options.healthCheckPath,
      port: String(options.backendHealthPort),
      protocol: "HTTP",
      matcher: "200",
      interval: 30,
      timeout: 5,
      healthyThreshold: 3,
      unhealthyThreshold: 3,
    },
    tags: { Name: `${name}-tg`, ...options.tags },
  });

  const rule = new aws.lb.ListenerRule(`${name}-rule`, {
    listenerArn: options.httpsListenerArn,
    priority: 10,
    conditions: [{ hostHeader: { values: [options.previewDomain] } }],
    actions: [{ type: "forward", targetGroupArn: targetGroup.arn }],
    tags: options.tags,
  });

  new aws.route53.Record(
    `${name}-alias`,
    {
      zoneId: options.route53ZoneId,
      name: options.previewDomain,
      type: "A",
      aliases: [
        {
          name: options.albDnsName,
          zoneId: options.albZoneId,
          evaluateTargetHealth: true,
        },
      ],
    },
    { dependsOn: [rule] },
  );

  return {
    // ECS refuses a target group that no listener uses yet, so the service waits for the rule.
    targetGroupArn: pulumi
      .all([targetGroup.arn, rule.arn])
      .apply(([arn]) => arn),
    publicUrl: pulumi.output(`https://${options.previewDomain}`),
  };
}
