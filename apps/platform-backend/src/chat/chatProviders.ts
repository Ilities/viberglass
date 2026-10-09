import type { ChatProvider, IntegrationRegistry } from "@viberglass/integration-core";
import { integrationRegistry } from "../integrations/registerIntegrationPlugins";

/** A chat service the build includes, with the integration it belongs to. */
export interface ChatService {
  system: string;
  label: string;
  provider: ChatProvider;
}

export function chatServicesFrom(registry: Pick<IntegrationRegistry, "list"> = integrationRegistry): ChatService[] {
  return registry
    .list()
    .flatMap((plugin) => (plugin.chat ? [{ system: plugin.id, label: plugin.label, provider: plugin.chat }] : []));
}
