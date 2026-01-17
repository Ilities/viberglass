import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({});
const cache: Record<string, { value: string; expiry: number }> = {};
const TTL = 1000 * 60 * 5; // 5 minutes

export async function getTenantSecret(
  tenantId: string,
  key: string
): Promise<string | undefined> {
  const prefix = process.env.TENANT_CONFIG_PATH_PREFIX;
  const parameterName = `${prefix}/${tenantId}/${key}`;

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
