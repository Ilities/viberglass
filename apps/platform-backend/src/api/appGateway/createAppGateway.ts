import { randomBytes } from "crypto";
import http, { type IncomingMessage, type ServerResponse } from "http";
import type { Duplex } from "stream";
import httpProxy from "http-proxy";
import { createChildLogger } from "../../config/logger";
import type { AppGatewayResolver, AppGatewayRoute } from "../../services/apps/AppGatewayResolver";
import type { AppOrigins } from "../../services/apps/AppOrigins";
import { APP_CALLBACK_PATH, type AppSignInService } from "../../services/apps/AppSignInService";
import { AppSocketWatch } from "./AppSocketWatch";
import { prepareAppRequest } from "./appRequestHeaders";
import { guardAppResponse } from "./appResponseHeaders";
import { gatewayClearCookie, gatewayCookieNames, gatewaySetCookie, readGatewayCookies } from "./gatewayCookie";
import { refusedAsCrossOrigin } from "./sameOriginOnly";
import { appForbiddenPage, appNotFoundPage, appOffPage, appUnreachablePage, previewOffPage, signInFailedPage } from "./gatewayPages";

const logger = createChildLogger({ server: "app-gateway" });

function onlyOne(values: string[]): string | null {
  return values.length === 1 ? (values[0] ?? null) : null;
}

// Long enough to sign in to Viberglass on the way.
const STATE_TTL_MS = 15 * 60 * 1000;

export interface AppGatewayDeps {
  origins: Pick<AppOrigins, "slugFromHost" | "originFor" | "secure" | "domain">;
  resolver: Pick<AppGatewayResolver, "resolve">;
  signIn: Pick<AppSignInService, "redeem">;
  /** Where people sign in to Viberglass, such as https://viberglass.example.com. */
  frontendUrl: string;
  /** How often open websockets are checked for access again; defaults to the resolver's cache time. */
  socketCheckMs?: number;
  /** Told about every request a preview serves, so idle previews can be turned off. */
  previewOpened?: (previewId: string) => void;
  /** The gateway's peer is a proxy, whose last `X-Forwarded-For` address is the person's. */
  trustProxy?: boolean;
  /** Whether a name under the apps domain may get a certificate; answers TLS_ASK_PATH for a proxy issuing them on demand. */
  certificateAllowed?: (host: string) => Promise<boolean>;
}

/** Asked with `?domain=` by a proxy before it gets a certificate, on a host that isn't an app's. */
export const TLS_ASK_PATH = "/_viberglass/tls";

/**
 * Every request to an app goes through here: it signs the person in, refuses
 * anyone without access, and passes the rest on with who they are. The app
 * never sees the gateway's cookies or identity headers it didn't set.
 */
export function createAppGateway(deps: AppGatewayDeps): http.Server {
  const { secure } = deps.origins;
  const cookieNames = gatewayCookieNames(secure);
  const frontendUrl = deps.frontendUrl.replace(/\/+$/, "");
  const openUrl = (slug: string, path: string, state: string) =>
    `${frontendUrl}/apps/${encodeURIComponent(slug)}/open?return=${encodeURIComponent(path)}&state=${encodeURIComponent(state)}`;
  const guardResponse = (res: IncomingMessage, req: IncomingMessage) =>
    guardAppResponse(res.headers, { cookieNames, origin: deps.origins.originFor(deps.origins.slugFromHost(req.headers.host) ?? "") });

  const proxy = httpProxy.createProxyServer({ xfwd: false });
  proxy.on("proxyRes", guardResponse);
  // Registered before http-proxy writes the app's handshake answer to the browser.
  proxy.on("proxyReqWs", (proxyReq, req) => {
    proxyReq.on("response", (res) => guardResponse(res, req));
    proxyReq.on("upgrade", (res) => guardResponse(res, req));
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

  // Over http a sibling app can set a cookie for the whole apps domain. When
  // more than one session arrives, none is trusted and they're cleared.
  const routeOf = async (req: IncomingMessage): Promise<{ slug: string; token: string | null; route: AppGatewayRoute; clear: string[] } | null> => {
    const slug = deps.origins.slugFromHost(req.headers.host);
    if (!slug) return null;
    const tokens = readGatewayCookies(req.headers.cookie, cookieNames.session);
    const token = onlyOne(tokens);
    const route = await deps.resolver.resolve(slug, token);
    const clear = tokens.length > 1 ? clearedSessions() : [];
    return { slug, token, route, clear };
  };

  const sockets = new AppSocketWatch(
    async (slug, token) => (await deps.resolver.resolve(slug, token)).kind === "proxy",
    deps.socketCheckMs ?? 15_000,
  );

  const clearedSessions = () => [
    gatewayClearCookie(cookieNames.session, secure),
    ...(!secure && deps.origins.domain ? [gatewayClearCookie(cookieNames.session, secure, deps.origins.domain)] : []),
  ];

  const signInRedirect = (req: IncomingMessage, res: ServerResponse, slug: string, clear: string[]) => {
    const state = onlyOne(readGatewayCookies(req.headers.cookie, cookieNames.state)) ?? randomBytes(32).toString("base64url");
    res.writeHead(302, {
      Location: openUrl(slug, req.url ?? "/", state),
      "Set-Cookie": [...clear, gatewaySetCookie(cookieNames.state, state, new Date(Date.now() + STATE_TTL_MS), secure)],
      "Cache-Control": "no-store",
    });
    res.end();
  };

  const callback = async (req: IncomingMessage, slug: string, url: URL, res: ServerResponse) => {
    const state = onlyOne(readGatewayCookies(req.headers.cookie, cookieNames.state));
    const redeemed = state ? await deps.signIn.redeem(slug, url.searchParams.get("code") ?? "", state) : null;
    if (!redeemed) return signInFailedPage(res);
    res.writeHead(302, {
      Location: redeemed.returnPath,
      "Set-Cookie": [
        gatewaySetCookie(cookieNames.session, redeemed.token, redeemed.expiresAt, secure),
        gatewayClearCookie(cookieNames.state, secure),
      ],
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    res.end();
  };

  const certificateAnswer = async (url: URL, res: ServerResponse) => {
    const domain = url.searchParams.get("domain") ?? "";
    const allowed = domain !== "" && (await deps.certificateAllowed?.(domain));
    res.writeHead(allowed ? 200 : 404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(allowed ? "yes" : "no");
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://gateway");
    const slug = deps.origins.slugFromHost(req.headers.host);
    if (slug && url.pathname === APP_CALLBACK_PATH) return callback(req, slug, url, res);
    if (!slug && url.pathname === TLS_ASK_PATH && deps.certificateAllowed) return certificateAnswer(url, res);

    if (refusedAsCrossOrigin(req, false)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return res.end("This app only answers its own pages. Open it in its own tab.");
    }

    const resolved = await routeOf(req);
    if (!resolved) return appNotFoundPage(res);
    const { route } = resolved;
    switch (route.kind) {
      case "unknown":
        return appNotFoundPage(res);
      case "sign-in":
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.writeHead(401, {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
            ...(resolved.clear.length > 0 ? { "Set-Cookie": resolved.clear } : {}),
          });
          return res.end("Sign in to use this app.");
        }
        return signInRedirect(req, res, resolved.slug, resolved.clear);
      case "forbidden":
        return appForbiddenPage(res);
      case "off":
        return appOffPage(res, route.appName, route.maintainers);
      case "preview_off":
        return previewOffPage(res, route.taskKey, `${frontendUrl}${route.taskPath}`);
      case "proxy":
        if (route.previewId) deps.previewOpened?.(route.previewId);
        prepareAppRequest(req, route.user, { cookieNames, secure, trustProxy: deps.trustProxy });
        return proxy.web(req, res, { target: route.target });
    }
  };

  const upgrade = async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const resolved = refusedAsCrossOrigin(req, true) ? null : await routeOf(req);
    if (resolved?.route.kind !== "proxy" || !resolved.token) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    prepareAppRequest(req, resolved.route.user, { cookieNames, secure, trustProxy: deps.trustProxy });
    sockets.add(socket, resolved.slug, resolved.token);
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
  server.on("close", () => sockets.stop());
  return server;
}
