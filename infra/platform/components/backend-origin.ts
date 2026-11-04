import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/** The port the backend serves artifact previews on, next to its API port. */
export const PREVIEW_PORT = 8890;
/** The port the backend serves apps on, as their gateway. */
export const APPS_GATEWAY_PORT = 8891;

export interface BackendOriginOptions {
  environment: string;
  /** Names the origin's resources, such as "preview". */
  key: string;
  vpcId: pulumi.Input<string>;
  /** Hostname browsers use, such as preview.example.com or *.apps.example.com; never the app's or the API's host. */
  host: string;
  /** The backend port the host's requests go to. */
  port: number;
  /** Listener rule priority; each origin needs its own. */
  priority: number;
  route53ZoneId: pulumi.Input<string>;
  /** The ALB's HTTPS listener, which gets the host as another certificate and rule. */
  httpsListenerArn: pulumi.Input<string>;
  albDnsName: pulumi.Input<string>;
  albZoneId: pulumi.Input<string>;
  /** The backend's API port: these ports have no health route of their own, and all run in one process. */
  backendHealthPort: number;
  healthCheckPath: string;
  tags: { [key: string]: string };
}

export interface BackendOriginOutputs {
  /** Target group the backend service registers its port in. */
  targetGroupArn: pulumi.Output<string>;
  port: number;
  publicUrl: pulumi.Output<string>;
}

/**
 * Another host served by the backend through its load balancer, such as
 * artifact previews or apps: a certificate and DNS name for the host, and a
 * listener rule sending its requests to one of the backend's ports.
 */
export function createBackendOrigin(
  options: BackendOriginOptions,
): BackendOriginOutputs {
  const name = `${options.environment}-viberglass-${options.key}`;

  const certificate = new aws.acm.Certificate(`${name}-cert`, {
    domainName: options.host,
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
    name: `viberglass-${options.environment}-${options.key}-tg`,
    port: options.port,
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
    priority: options.priority,
    conditions: [{ hostHeader: { values: [options.host] } }],
    actions: [{ type: "forward", targetGroupArn: targetGroup.arn }],
    tags: options.tags,
  });

  new aws.route53.Record(
    `${name}-alias`,
    {
      zoneId: options.route53ZoneId,
      name: options.host,
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
    port: options.port,
    publicUrl: pulumi.output(`https://${options.host.replace(/^\*\./, "")}`),
  };
}
