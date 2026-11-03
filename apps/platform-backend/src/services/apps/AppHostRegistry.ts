import type { AppHost, AppHostTarget } from "@viberglass/types";

/** The app hosts this installation has, one per target. */
export class AppHostRegistry {
  private readonly hosts = new Map<AppHostTarget, AppHost>();

  constructor(hosts: AppHost[]) {
    for (const host of hosts) this.hosts.set(host.target, host);
  }

  get(target: AppHostTarget): AppHost | null {
    return this.hosts.get(target) ?? null;
  }
}
