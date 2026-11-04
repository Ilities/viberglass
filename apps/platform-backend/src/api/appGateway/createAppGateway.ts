import http, { type IncomingMessage, type ServerResponse } from "http";
import type { Duplex } from "stream";
import httpProxy from "http-proxy";
import { APP_USER_HEADERS } from "@viberglass/types";
import { createChildLogger } from "../../config/logger";
import type { AppSessionUser } from "../../persistence/apps/AppSignInDAO";
import type { AppGatewayResolver, AppGatewayRoute } from "../../services/apps/AppGatewayResolver";
import type { AppOrigins } from "../../services/apps/AppOrigins";
import { APP_CALLBACK_PATH, type AppSignInService } from "../../services/apps/AppSignInService";
import { gatewayCookieName, gatewaySetCookie, readGatewayCookies, withoutGatewayCookie, withoutGatewaySetCookie } from "./gatewayCookie";
import { refusedAsCrossOrigin } from "./sameOriginOnly";
import { appForbiddenPage, appNotFoundPage, appOffPage, appUnreachablePage, signInFailedPage } from "./gatewayPages";

const logger = createChildLogger({ server: "app-gateway" });

export interface AppGatewayDeps {
  origins: Pick<AppOrigins, "slugFromHost" | "secure">;
  resolver: Pick<AppGatewayResolver, "resolve">;
  signIn: Pick<AppSignInService, "redeem">;
  /** Where people sign in to Viberglass, such as https://viberglass.example.com. */
  frontendUrl: string;
}

const IDENTITY_PREFIX = "x-viberglass-";

/**
 * Every request to an app goes through here: it signs the person in, refuses
 * anyone without access, and passes the rest on with who they are. The app
 * never sees the gateway's cookie or identity headers it didn't set.
 */
export function createAppGateway(deps: AppGatewayDeps): http.Server {
  const cookieName = gatewayCookieName(deps.origins.secure);
  const frontendUrl = deps.frontendUrl.replace(/\/+$/, "");
  const openUrl = (slug: string, path: string) => `${frontendUrl}/apps/${encodeURIComponent(slug)}/open?return=${encodeURIComponent(path)}`;

  const proxy = httpProxy.createProxyServer({ xfwd: true });
  proxy.on("proxyRes", (proxyRes) => {
    proxyRes.headers["set-cookie"] = withoutGatewaySetCookie(proxyRes.headers["set-cookie"], cookieName);
  });
  proxy.on("error", (error, _req, res) => {
    logger.warn("An app didn't answer", { error: error.message });
    if (res instanceof http.ServerResponse) {
      if (!res.headersSent) appUnreachablePage(res);
      else res.end();
    } else {
      res.destroy();
    }
  });

  const routeOf = async (req: IncomingMessage): Promise<{ slug: string; route: AppGatewayRoute } | null> => {
    const slug = deps.origins.slugFromHost(req.headers.host);
    if (!slug) return null;
    // A stale cookie can sit next to a fresh one; the first that works wins.
    const tokens = readGatewayCookies(req.headers.cookie, cookieName);
    for (const token of tokens) {
      const route = await deps.resolver.resolve(slug, token);
      if (route.kind !== "sign-in") return { slug, route };
    }
    return { slug, route: await deps.resolver.resolve(slug, null) };
  };

  const passIdentity = (req: IncomingMessage, user: AppSessionUser) => {
    for (const name of Object.keys(req.headers)) {
      if (name.startsWith(IDENTITY_PREFIX)) delete req.headers[name];
    }
    const cookie = withoutGatewayCookie(req.headers.cookie, cookieName);
    if (cookie) req.headers.cookie = cookie;
    else delete req.headers.cookie;
    req.headers[APP_USER_HEADERS.id.toLowerCase()] = user.id;
    req.headers[APP_USER_HEADERS.email.toLowerCase()] = user.email;
    // Header values are Latin-1, and names can be in any script.
    req.headers[APP_USER_HEADERS.name.toLowerCase()] = encodeURIComponent(user.name);
  };

  const callback = async (slug: string, url: URL, res: ServerResponse) => {
    const redeemed = await deps.signIn.redeem(slug, url.searchParams.get("code") ?? "");
    if (!redeemed) return signInFailedPage(res, openUrl(slug, "/"));
    res.writeHead(302, {
      Location: redeemed.returnPath,
      "Set-Cookie": gatewaySetCookie(cookieName, redeemed.token, redeemed.expiresAt, deps.origins.secure),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    res.end();
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://gateway");
    const slug = deps.origins.slugFromHost(req.headers.host);
    if (slug && url.pathname === APP_CALLBACK_PATH) return callback(slug, url, res);

    if (refusedAsCrossOrigin(req, false)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return res.end("This app only accepts changes from its own pages.");
    }

    const resolved = await routeOf(req);
    if (!resolved) return appNotFoundPage(res);
    const { route } = resolved;
    switch (route.kind) {
      case "unknown":
        return appNotFoundPage(res);
      case "sign-in":
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
          return res.end("Sign in to use this app.");
        }
        res.writeHead(302, { Location: openUrl(resolved.slug, req.url ?? "/"), "Cache-Control": "no-store" });
        return res.end();
      case "forbidden":
        return appForbiddenPage(res);
      case "off":
        return appOffPage(res, route.appName, route.maintainers);
      case "proxy":
        passIdentity(req, route.user);
        return proxy.web(req, res, { target: route.target });
    }
  };

  const upgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const resolved = refusedAsCrossOrigin(req, true) ? null : await routeOf(req);
    if (resolved?.route.kind !== "proxy") {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    passIdentity(req, resolved.route.user);
    proxy.ws(req, socket, head, { target: resolved.route.target });
  };

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      logger.error("App gateway request failed", { error: error instanceof Error ? error.message : String(error) });
      if (!res.headersSent) appUnreachablePage(res);
      else res.end();
    });
  });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    upgrade(req, socket, head).catch((error: unknown) => {
      logger.error("App gateway upgrade failed", { error: error instanceof Error ? error.message : String(error) });
      socket.destroy();
    });
  });
  return server;
}
