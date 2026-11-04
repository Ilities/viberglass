import { PREVIEW_ADDRESS_PREFIX } from "@viberglass/types";
import { appsDomain } from "./appSpaceAvailability";

type Env = Record<string, string | undefined>;

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const APP_NAME_RULE =
  "An App space's name becomes its app's web address. Use letters, numbers, spaces and hyphens, up to 63 characters, and don't start it with \"preview\".";

/** Whether a label can be a host name under the apps domain, for an app or a preview. */
export function isAppHostLabel(label: string): boolean {
  return HOST_LABEL.test(label);
}

/** Whether a space slug can be an app's host name; preview addresses are kept apart. */
export function isAppSpaceSlug(slug: string): boolean {
  return isAppHostLabel(slug) && !slug.startsWith(PREVIEW_ADDRESS_PREFIX);
}

/**
 * Where apps are served: `<slug>.<apps domain>`, with the scheme and port of
 * APPS_PUBLIC_URL (https and the default port when it's unset).
 */
export class AppOrigins {
  /** The apps domain, such as apps.example.com. */
  readonly domain: string | null;
  private readonly base: URL | null;

  constructor(env: Env = process.env) {
    this.domain = appsDomain(env);
    const configured = env.APPS_PUBLIC_URL?.trim();
    this.base = configured ? new URL(configured) : this.domain ? new URL(`https://${this.domain}`) : null;
  }

  get secure(): boolean {
    return this.base?.protocol === "https:";
  }

  /** The browser origin of one app, or null when apps aren't served here. */
  originFor(slug: string): string | null {
    if (!this.base || !this.domain || !isAppHostLabel(slug)) return null;
    const port = this.base.port ? `:${this.base.port}` : "";
    return `${this.base.protocol}//${slug}.${this.domain}${port}`;
  }

  /** The slug a request's Host header names, or null when it isn't one app's host. */
  slugFromHost(host: string | undefined): string | null {
    if (!host || !this.domain) return null;
    const name = host.toLowerCase().replace(/:\d+$/, "");
    const suffix = `.${this.domain}`;
    if (!name.endsWith(suffix)) return null;
    const label = name.slice(0, -suffix.length);
    return isAppHostLabel(label) ? label : null;
  }
}
