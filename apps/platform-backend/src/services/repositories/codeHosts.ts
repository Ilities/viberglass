import type { RepositoryHost } from "@viberglass/integration-core";

/** Finds an integration's code host; the integration registry is one. */
export interface CodeHosts {
  get(system: string): { repository?: RepositoryHost } | undefined;
}
