import type { ModelHost, ModelHostKind } from "@viberglass/types";
import { ModelHostingError } from "../errors/ModelHostingError";

/** The cloud adapters this instance can deploy to, by kind. */
export class ModelHostRegistry {
  private readonly hosts = new Map<ModelHostKind, ModelHost>();

  constructor(hosts: ModelHost[]) {
    for (const host of hosts) this.hosts.set(host.kind, host);
  }

  require(kind: ModelHostKind): ModelHost {
    const host = this.hosts.get(kind);
    if (!host)
      throw new ModelHostingError(
        "MODEL_HOST_UNAVAILABLE",
        `Deploying to ${kind} isn't available on this instance.`,
      );
    return host;
  }
}
