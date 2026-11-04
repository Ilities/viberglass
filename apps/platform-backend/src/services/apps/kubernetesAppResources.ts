import type { V1Deployment, V1PersistentVolumeClaim, V1Secret, V1Service } from "@kubernetes/client-node";
import type { AppInstanceSpec } from "@viberglass/types";

export const APP_PORT = 3000;
export const INSTANCE_LABEL = "viberglass.dev/app-instance";
const PROJECT_LABEL = "viberglass.dev/app-project";
// The runtime image's `node` user.
const APP_UID = 1000;

export interface KubernetesAppNames {
  deployment: string;
  service: string;
  secret: string;
  data: string;
  release: string;
}

export function kubernetesAppNames(instance: string): KubernetesAppNames {
  const name = `viberglass-${instance}`;
  return { deployment: name, service: name, secret: `${name}-env`, data: `${name}-data`, release: `${name}-release` };
}

export interface KubernetesAppLimits {
  memoryMb: number;
  cpus: number;
  stopGraceSeconds: number;
  imagePullSecrets: string[];
}

function labels(spec: Pick<AppInstanceSpec, "instance" | "projectId">): Record<string, string> {
  return {
    "app.kubernetes.io/name": "viberglass-app",
    "app.kubernetes.io/managed-by": "viberglass",
    [INSTANCE_LABEL]: spec.instance,
    [PROJECT_LABEL]: spec.projectId,
  };
}

/** The instance's env, kept in a Secret since it carries the app's storage credentials. */
export function appEnvSecret(spec: AppInstanceSpec, names: KubernetesAppNames): V1Secret {
  return { apiVersion: "v1", kind: "Secret", type: "Opaque", metadata: { name: names.secret, labels: labels(spec) }, stringData: spec.env };
}

export function appService(spec: AppInstanceSpec, names: KubernetesAppNames): V1Service {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: { name: names.service, labels: labels(spec) },
    spec: { selector: { [INSTANCE_LABEL]: spec.instance }, ports: [{ name: "http", port: APP_PORT, targetPort: "http" }] },
  };
}

export function appClaim(spec: AppInstanceSpec, name: string, size: string, storageClass: string | null): V1PersistentVolumeClaim {
  return {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata: { name, labels: labels(spec) },
    spec: {
      accessModes: ["ReadWriteOnce"],
      ...(storageClass ? { storageClassName: storageClass } : {}),
      resources: { requests: { storage: size } },
    },
  };
}

/**
 * One app's pod, created with no replicas: its data and unpacked release on
 * their own volumes, a read-only root, and limits on memory, CPU and scratch
 * space. One replica at most, replaced rather than rolled, since an app has
 * one SQLite writer.
 */
export function appDeployment(spec: AppInstanceSpec, names: KubernetesAppNames, limits: KubernetesAppLimits): V1Deployment {
  const memory = `${limits.memoryMb}Mi`;
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: names.deployment, labels: labels(spec) },
    spec: {
      replicas: 0,
      strategy: { type: "Recreate" },
      revisionHistoryLimit: 1,
      selector: { matchLabels: { [INSTANCE_LABEL]: spec.instance } },
      template: {
        metadata: { labels: labels(spec) },
        spec: {
          automountServiceAccountToken: false,
          enableServiceLinks: false,
          terminationGracePeriodSeconds: limits.stopGraceSeconds,
          ...(limits.imagePullSecrets.length ? { imagePullSecrets: limits.imagePullSecrets.map((name) => ({ name })) } : {}),
          securityContext: {
            runAsNonRoot: true,
            runAsUser: APP_UID,
            runAsGroup: APP_UID,
            fsGroup: APP_UID,
            seccompProfile: { type: "RuntimeDefault" },
          },
          containers: [{
            name: "app",
            image: spec.image,
            envFrom: [{ secretRef: { name: names.secret } }],
            // The root filesystem is read-only, so caches that tools keep under HOME go to /tmp.
            env: [{ name: "PORT", value: String(APP_PORT) }, { name: "HOME", value: "/tmp" }],
            ports: [{ name: "http", containerPort: APP_PORT }],
            securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } },
            resources: {
              // Apps idle most of the time, so they reserve little CPU; memory isn't shared, so it's all reserved.
              requests: { cpu: "100m", memory, "ephemeral-storage": "256Mi" },
              limits: { cpu: String(limits.cpus), memory, "ephemeral-storage": "1Gi" },
            },
            volumeMounts: [
              { name: "data", mountPath: "/data" },
              { name: "release", mountPath: "/app" },
              { name: "tmp", mountPath: "/tmp" },
            ],
          }],
          volumes: [
            { name: "data", persistentVolumeClaim: { claimName: names.data } },
            // Keeps the unpacked bundle, so a replaced pod doesn't need the bundle's link, which expires.
            { name: "release", persistentVolumeClaim: { claimName: names.release } },
            // start-release.sh runs the app's start script from here.
            { name: "tmp", emptyDir: { sizeLimit: "512Mi" } },
          ],
        },
      },
    },
  };
}
