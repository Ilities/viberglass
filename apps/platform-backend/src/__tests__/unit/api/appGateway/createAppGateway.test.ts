import http, { type IncomingHttpHeaders } from "http";
import type { AddressInfo } from "net";
import type { Duplex } from "stream";
import { createAppGateway } from "../../../../api/appGateway/createAppGateway";
import type { AppGatewayRoute } from "../../../../services/apps/AppGatewayResolver";
import { AppOrigins } from "../../../../services/apps/AppOrigins";

jest.mock("../../../../persistence/config/database", () => ({ __esModule: true, default: {} }));

const HOST = "laptops.apps.example.com";
const ADA = { id: "user-1", email: "ada@example.com", name: "Ada Lövelace", role: "member" as const };

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

function send(port: number, options: { method?: string; path?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { port, host: "127.0.0.1", method: options.method ?? "GET", path: options.path ?? "/", headers: { host: HOST, ...options.headers } },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function upgrade(port: number, headers: Record<string, string> = {}): Promise<{ status: number; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      port,
      host: "127.0.0.1",
      headers: { host: HOST, connection: "Upgrade", upgrade: "websocket", ...headers },
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve({ status: res.statusCode ?? 0, headers: res.headers });
    });
    req.on("response", (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
    req.on("error", reject);
    req.end();
  });
}

describe("the app gateway", () => {
  let appPort: number;
  let gatewayPort: number;
  let route: AppGatewayRoute;
  const servers: http.Server[] = [];
  const redeem = jest.fn();
  const appSockets: Duplex[] = [];

  beforeAll(async () => {
    const app = http.createServer((req, res) => {
      res.setHeader("Set-Cookie", ["viberglass_app=forged; Path=/", "=viberglass_app=nameless", "viberglass_app_state=forged", "theme=dark; Path=/"]);
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/cors") {
        res.setHeader("Access-Control-Allow-Origin", req.headers["x-allow"] ?? "");
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Content-Security-Policy", "default-src 'self'");
      }
      res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers }));
    });
    app.on("upgrade", (req, socket) => {
      if (req.url === "/live") {
        appSockets.push(socket);
        return void socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
      }
      socket.end(
        `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Seen-User: ${req.headers["x-viberglass-user-id"]}\r\nSet-Cookie: viberglass_app=forged; Domain=apps.example.com\r\nSet-Cookie: theme=dark\r\n\r\n`,
      );
    });
    servers.push(app);
    appPort = await listen(app);

    const gateway = createAppGateway({
      origins: new AppOrigins({ APPS_DOMAIN: "apps.example.com", APPS_PUBLIC_URL: "http://apps.example.com" }),
      resolver: { resolve: async (slug, token) => (slug !== "laptops" ? { kind: "unknown" } : token === "good" ? route : { kind: "sign-in" }) },
      signIn: { redeem },
      frontendUrl: "https://viberglass.example.com/",
      socketCheckMs: 20,
      certificateAllowed: async (host) => host === HOST,
    });
    servers.push(gateway);
    gatewayPort = await listen(gateway);
  });

  beforeEach(() => {
    route = { kind: "proxy", target: `http://127.0.0.1:${appPort}`, user: ADA, previewId: null };
    redeem.mockReset();
  });

  afterAll(async () => {
    appSockets.forEach((socket) => socket.destroy());
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  });

  it("knows no app on a host outside the apps domain or under an unknown name", async () => {
    expect((await send(gatewayPort, { headers: { host: "viberglass.example.com" } })).status).toBe(404);
    expect((await send(gatewayPort, { headers: { host: "payroll.apps.example.com" } })).status).toBe(404);
  });

  it("sends someone who isn't signed in to Viberglass to open the app, keeping where they were going and tying it to this browser", async () => {
    const reply = await send(gatewayPort, { path: "/laptops?status=lent" });

    expect(reply.status).toBe(302);
    const location = new URL(reply.headers.location ?? "");
    expect(`${location.origin}${location.pathname}`).toBe("https://viberglass.example.com/apps/laptops/open");
    expect(location.searchParams.get("return")).toBe("/laptops?status=lent");
    const state = location.searchParams.get("state") ?? "";
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(reply.headers["set-cookie"]).toEqual([expect.stringMatching(new RegExp(`^viberglass_app_state=${state}; Path=/; Max-Age=900; HttpOnly; SameSite=Lax$`))]);
    expect((await send(gatewayPort, { method: "POST", headers: { cookie: "viberglass_app=stale" } })).status).toBe(401);
  });

  it("keeps the sign-in another tab already started", async () => {
    const reply = await send(gatewayPort, { headers: { cookie: "viberglass_app_state=started-in-another-tab" } });

    expect(new URL(reply.headers.location ?? "").searchParams.get("state")).toBe("started-in-another-tab");
  });

  it("trades a code for its cookie in the browser that started signing in, and lands on the return path", async () => {
    redeem.mockResolvedValue({ token: "good", returnPath: "/laptops", expiresAt: new Date(Date.now() + 3_600_000) });

    const reply = await send(gatewayPort, { path: "/_viberglass/callback?code=abc", headers: { cookie: "viberglass_app_state=s1" } });

    expect(redeem).toHaveBeenCalledWith("laptops", "abc", "s1");
    expect(reply.status).toBe(302);
    expect(reply.headers.location).toBe("/laptops");
    expect(reply.headers["set-cookie"]?.[0]).toMatch(/^viberglass_app=good; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax$/);
    expect(reply.headers["set-cookie"]?.[1]).toBe("viberglass_app_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
  });

  it("won't redeem a code in a browser that didn't ask for it", async () => {
    const without = await send(gatewayPort, { path: "/_viberglass/callback?code=abc" });
    const tossed = await send(gatewayPort, { path: "/_viberglass/callback?code=abc", headers: { cookie: "viberglass_app_state=a; viberglass_app_state=b" } });

    expect(without.status).toBe(400);
    expect(tossed.status).toBe(400);
    expect(redeem).not.toHaveBeenCalled();
  });

  it("offers to open the app again when a code can't be used", async () => {
    redeem.mockResolvedValue(null);

    const reply = await send(gatewayPort, { path: "/_viberglass/callback?code=used", headers: { cookie: "viberglass_app_state=s1" } });

    expect(reply.status).toBe(400);
    expect(reply.body).toContain('<a href="/">Open the app again</a>');
    expect(reply.headers["set-cookie"]).toBeUndefined();
  });

  it("trusts no session when more than one arrives, and clears them here and on the apps domain", async () => {
    const reply = await send(gatewayPort, { headers: { cookie: "viberglass_app=planted; viberglass_app=good" } });

    expect(reply.status).toBe(302);
    expect(new URL(reply.headers.location ?? "").pathname).toBe("/apps/laptops/open");
    expect(reply.headers["set-cookie"]).toEqual([
      "viberglass_app=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
      "viberglass_app=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Domain=apps.example.com",
      expect.stringMatching(/^viberglass_app_state=/),
    ]);
  });

  it("tells a proxy issuing certificates which names are apps, but only when asked outside the apps", async () => {
    const ask = (domain: string, host = "backend:8891") => send(gatewayPort, { path: `/_viberglass/tls?domain=${domain}`, headers: { host } });

    expect((await ask(HOST)).status).toBe(200);
    expect((await ask("payroll.apps.example.com")).status).toBe(404);
    expect((await ask("")).status).toBe(404);
    route = { kind: "sign-in" };
    expect((await ask(HOST, HOST)).status).toBe(302);
  });

  it("takes the person's address from the proxy in front of it, ignoring what the client added", async () => {
    const behindProxy = createAppGateway({
      origins: new AppOrigins({ APPS_DOMAIN: "apps.example.com", APPS_PUBLIC_URL: "https://apps.example.com" }),
      resolver: { resolve: async () => route },
      signIn: { redeem },
      frontendUrl: "https://viberglass.example.com/",
      trustProxy: true,
    });
    servers.push(behindProxy);
    const port = await listen(behindProxy);

    const seen = JSON.parse((await send(port, { headers: { cookie: "__Host-viberglass_app=good", "x-forwarded-for": "6.6.6.6, 203.0.113.7" } })).body);
    expect(seen.headers["x-forwarded-for"]).toBe("203.0.113.7");
    expect(seen.headers["x-forwarded-proto"]).toBe("https");

    const direct = JSON.parse((await send(port, { headers: { cookie: "__Host-viberglass_app=good" } })).body);
    expect(direct.headers["x-forwarded-for"]).toBe("127.0.0.1");
  });

  it("passes the person's identity to the app in place of any sent along, without the gateway cookie", async () => {
    const reply = await send(gatewayPort, {
      path: "/laptops",
      headers: {
        cookie: "theme=light; viberglass_app=good; viberglass_app_state=s1",
        "x-viberglass-user-id": "someone-else",
        "x-viberglass-user-role": "admin",
        "x_viberglass_user_id": "someone-else",
        "x-forwarded-for": "6.6.6.6",
        "x-forwarded-host": "evil.example.com",
        "x-forwarded-port": "1",
        forwarded: "for=6.6.6.6",
      },
    });

    expect(reply.status).toBe(200);
    const seen = JSON.parse(reply.body);
    expect(seen.url).toBe("/laptops");
    expect(seen.headers["x-viberglass-user-id"]).toBe("user-1");
    expect(seen.headers["x-viberglass-user-email"]).toBe("ada@example.com");
    expect(decodeURIComponent(seen.headers["x-viberglass-user-name"])).toBe("Ada Lövelace");
    expect(seen.headers["x-viberglass-user-role"]).toBeUndefined();
    expect(seen.headers.x_viberglass_user_id).toBeUndefined();
    expect(seen.headers.cookie).toBe("theme=light");
    expect(seen.headers["x-forwarded-for"]).toBe("127.0.0.1");
    expect(seen.headers["x-forwarded-host"]).toBe(HOST);
    expect(seen.headers["x-forwarded-proto"]).toBe("http");
    expect(seen.headers["x-forwarded-port"]).toBeUndefined();
    expect(seen.headers.forwarded).toBeUndefined();
    expect(reply.headers["set-cookie"]).toEqual(["theme=dark; Path=/"]);
    expect(reply.headers["content-security-policy"]).toBe("frame-ancestors 'self'");
  });

  it("drops CORS grants to other origins and keeps the app from being framed elsewhere", async () => {
    const cookie = "viberglass_app=good";
    const toSibling = await send(gatewayPort, { path: "/cors", headers: { cookie, "x-allow": "http://payroll.apps.example.com" } });
    const toItself = await send(gatewayPort, { path: "/cors", headers: { cookie, "x-allow": `http://${HOST}` } });

    expect(toSibling.headers["access-control-allow-origin"]).toBeUndefined();
    expect(toSibling.headers["access-control-allow-credentials"]).toBeUndefined();
    expect(toItself.headers["access-control-allow-origin"]).toBe(`http://${HOST}`);
    expect(toItself.headers["content-security-policy"]).toBe("default-src 'self', frame-ancestors 'self'");
  });

  it("lets other sites open the app in a tab, but not fetch or frame it", async () => {
    const cookie = "viberglass_app=good";
    const linked = await send(gatewayPort, { headers: { cookie, "sec-fetch-site": "same-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" } });
    const fetched = await send(gatewayPort, { headers: { cookie, "sec-fetch-site": "same-site", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" } });
    const framed = await send(gatewayPort, { headers: { cookie, "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" } });
    const own = await send(gatewayPort, { headers: { cookie, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors" } });

    expect(linked.status).toBe(200);
    expect(fetched.status).toBe(403);
    expect(framed.status).toBe(403);
    expect(own.status).toBe(200);
  });

  it("refuses changes sent from another origin, sibling apps included", async () => {
    const cookie = "viberglass_app=good";
    const fromSibling = await send(gatewayPort, { method: "POST", headers: { cookie, origin: "http://payroll.apps.example.com" } });
    const fetchedCrossSite = await send(gatewayPort, { method: "POST", headers: { cookie, "sec-fetch-site": "same-site" } });
    const fromItself = await send(gatewayPort, { method: "POST", headers: { cookie, origin: `http://${HOST}`, "sec-fetch-site": "same-origin" } });

    expect(fromSibling.status).toBe(403);
    expect(fetchedCrossSite.status).toBe(403);
    expect(fromItself.status).toBe(200);
  });

  it("says who can turn the app on when it's off", async () => {
    route = { kind: "off", appName: "Laptops", maintainers: ["<Grace>", "Ada"] };

    const reply = await send(gatewayPort, { headers: { cookie: "viberglass_app=good" } });

    expect(reply.status).toBe(503);
    expect(reply.body).toContain("Ask &#60;Grace&#62; or Ada or a workspace admin to turn it on.");
    expect(reply.headers["content-security-policy"]).toContain("default-src 'none'");
  });

  it("refuses people who lost access", async () => {
    route = { kind: "forbidden" };

    expect((await send(gatewayPort, { headers: { cookie: "viberglass_app=good" } })).status).toBe(403);
  });

  it("says so when the app doesn't answer", async () => {
    route = { kind: "proxy", target: "http://127.0.0.1:1", user: ADA, previewId: null };

    expect((await send(gatewayPort, { headers: { cookie: "viberglass_app=good" } })).status).toBe(502);
  });

  it("passes websockets on with the person's identity, only from the app's own origin", async () => {
    const own = await upgrade(gatewayPort, { cookie: "viberglass_app=good", origin: `http://${HOST}` });
    const sibling = await upgrade(gatewayPort, { cookie: "viberglass_app=good", origin: "http://payroll.apps.example.com" });
    const signedOut = await upgrade(gatewayPort, { origin: `http://${HOST}` });

    expect(own.status).toBe(101);
    expect(own.headers["x-seen-user"]).toBe("user-1");
    expect(own.headers["set-cookie"]).toEqual(["theme=dark"]);
    expect(sibling.status).toBe(401);
    expect(signedOut.status).toBe(401);
  });

  it("closes an open websocket once the person loses access", async () => {
    const socket = await new Promise<Duplex>((resolve, reject) => {
      const req = http.request({
        port: gatewayPort,
        host: "127.0.0.1",
        path: "/live",
        headers: { host: HOST, connection: "Upgrade", upgrade: "websocket", cookie: "viberglass_app=good", origin: `http://${HOST}` },
      });
      req.on("upgrade", (_res, upgraded) => resolve(upgraded));
      req.on("error", reject);
      req.end();
    });
    const closed = new Promise<void>((resolve) => socket.on("close", () => resolve()));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(socket.destroyed).toBe(false);

    route = { kind: "forbidden" };
    socket.on("error", () => undefined);
    await closed;
  });
});
