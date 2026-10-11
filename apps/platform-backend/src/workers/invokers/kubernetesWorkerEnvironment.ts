const environmentKeys = [
  "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_SDK_DISABLED", "VIBERGLASS_DEPLOYMENT_ENV", "VIBERGLASS_OTEL_CONSOLE",
];

export function kubernetesWorkerEnvironment(env: NodeJS.ProcessEnv): Record<string, string> {
  const values: Record<string, string> = {};
  for (const name of environmentKeys) {
    const value = env[name];
    if (value) values[name] = value;
  }
  return values;
}
