import { getAgentSettingFields } from "@viberglass/types";
import { isObjectRecord, toNonEmptyString, toObjectRecord } from "./parsers";

/**
 * The model a runner is set to use: its model endpoint's model, else the
 * harness setting that takes a provider's default model. Undefined when the
 * harness picks its own.
 */
export function configuredModel(clanker: unknown): string | undefined {
  if (!isObjectRecord(clanker)) return undefined;
  const endpointModel = toNonEmptyString(toObjectRecord(clanker.modelEndpoint)?.model);
  if (endpointModel) return endpointModel;

  const agent = toObjectRecord(toObjectRecord(clanker.deploymentConfig)?.agent);
  const agentType = toNonEmptyString(agent?.type) ?? toNonEmptyString(clanker.agent);
  if (!agent || !agentType) return undefined;
  const modelField = getAgentSettingFields(agentType).find((field) => field.providerDefault === "model");
  return modelField ? toNonEmptyString(agent[modelField.key]) : undefined;
}
