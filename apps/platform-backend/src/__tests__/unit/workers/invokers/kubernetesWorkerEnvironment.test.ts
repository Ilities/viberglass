import { kubernetesWorkerEnvironment } from "../../../../workers/invokers/kubernetesWorkerEnvironment";
import { buildKubernetesJob } from "../../../../workers/invokers/kubernetesJob";

it("keeps storage settings and shared credentials out of workers", () => {
  expect(kubernetesWorkerEnvironment({ S3_ENDPOINT: "http://minio:9000", S3_BUCKET: "files", S3_PUBLIC_ENDPOINT: "http://localhost:39000", S3_SECRET_ACCESS_KEY: "secret", DB_PASSWORD: "password", OPENAI_API_KEY: "model-key", OTEL_EXPORTER_OTLP_HEADERS: "authorization=secret" })).toEqual({});
});

it("uses registry credentials from the worker namespace", () => {
  const job = buildKubernetesJob({ jobId: "id", tenantId: "tenant", image: "private/worker:1", callbackSecret: "run-auth", platformApiUrl: "http://backend", config: { type: "kubernetes" }, imagePullSecrets: ["registry"] });
  expect(job.spec?.template.spec?.imagePullSecrets).toEqual([{ name: "registry" }]);
});

it("reads only telemetry headers from an optional environment Secret", () => {
  const job = buildKubernetesJob({ jobId: "id", tenantId: "tenant", image: "worker:1", callbackSecret: "run-auth",
    platformApiUrl: "http://backend", config: { type: "kubernetes" }, environmentSecret: "telemetry" });
  const worker = job.spec?.template.spec?.containers[0];
  expect(worker?.envFrom).toBeUndefined();
  expect(worker?.env).toContainEqual({ name: "OTEL_EXPORTER_OTLP_HEADERS", valueFrom: {
    secretKeyRef: { name: "telemetry", key: "OTEL_EXPORTER_OTLP_HEADERS", optional: true },
  } });
});
