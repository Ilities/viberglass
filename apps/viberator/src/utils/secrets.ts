import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
const cache: Record<string, { value: string; expiry: number }> = {};
const TTL = 1000 * 60 * 5; // 5 minutes

export async function getTenantSecret(
  tenantId: string,
  key: string
): Promise<string | undefined> {
  const tenantPrefix = process.env.SSM_PARAMETER_PREFIX;
  const legacyTenantPrefix = process.env.TENANT_CONFIG_PATH_PREFIX;
  const hasConfiguredSecretsPrefix =
    typeof process.env.SECRETS_SSM_PREFIX === "string" &&
    process.env.SECRETS_SSM_PREFIX.trim().length > 0;
  const secretsPrefix = process.env.SECRETS_SSM_PREFIX || "/viberator/secrets";
  const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_.-]/g, "-");
  const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const normalizePrefix = (prefix: string) =>
    (prefix.startsWith("/") ? prefix : `/${prefix}`).replace(/\/+$/, "");

  let parameterName: string;
  if (tenantPrefix) {
    parameterName = `${normalizePrefix(tenantPrefix)}/${safeTenantId}/${safeKey}`;
  } else if (hasConfiguredSecretsPrefix) {
    parameterName = `${normalizePrefix(secretsPrefix)}/${safeKey}`;
  } else if (legacyTenantPrefix) {
    parameterName = `${normalizePrefix(legacyTenantPrefix)}/${safeTenantId}/${safeKey}`;
  } else {
    parameterName = `${normalizePrefix(secretsPrefix)}/${safeKey}`;
  }

  if (cache[parameterName] && cache[parameterName].expiry > Date.now()) {
    return cache[parameterName].value;
  }

  const response = await ssm.send(
    new GetParameterCommand({
      Name: parameterName,
      WithDecryption: true,
    })
  );

  const value = response.Parameter?.Value;
  if (value) {
    cache[parameterName] = { value, expiry: Date.now() + TTL };
  }
  return value;
}
