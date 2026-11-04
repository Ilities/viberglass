import http, { type IncomingHttpHeaders } from "http";
import type { AddressInfo } from "net";
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

  beforeAll(async () => {
    const app = http.createServer((req, res) => {
      res.setHeader("Set-Cookie", ["viberglass_app=forged; Path=/", "theme=dark; Path=/"]);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers }));
    });
    app.on("upgrade", (req, socket) => {
      socket.end(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nX-Seen-User: ${req.headers["x-viberglass-user-id"]}\r\n\r\n`);
    });
    servers.push(app);
    appPort = await listen(app);

    const gateway = createAppGateway({
      origins: new AppOrigins({ APPS_DOMAIN: "apps.example.com", APPS_PUBLIC_URL: "http://apps.example.com" }),
      resolver: { resolve: async (slug, token) => (slug !== "laptops" ? { kind: "unknown" } : token === "good" ? route : { kind: "sign-in" }) },
      signIn: { redeem },
      frontendUrl: "https://viberglass.example.com/",
    });
    servers.push(gateway);
    gatewayPort = await listen(gateway);
  });

  beforeEach(() => {
    route = { kind: "proxy", target: `http://127.0.0.1:${appPort}`, user: ADA };
    redeem.mockReset();
  });

  afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  });

  it("knows no app on a host outside the apps domain or under an unknown name", async () => {
    expect((await send(gatewayPort, { headers: { host: "viberglass.example.com" } })).status).toBe(404);
    expect((await send(gatewayPort, { headers: { host: "payroll.apps.example.com" } })).status).toBe(404);
  });

  it("sends someone who isn't signed in to Viberglass to open the app, keeping where they were going", async () => {
    const reply = await send(gatewayPort, { path: "/laptops?status=lent" });

    expect(reply.status).toBe(302);
    expect(reply.headers.location).toBe("https://viberglass.example.com/apps/laptops/open?return=%2Flaptops%3Fstatus%3Dlent");
    expect((await send(gatewayPort, { method: "POST", headers: { cookie: "viberglass_app=stale" } })).status).toBe(401);
  });

  it("trades a code for its cookie and lands on the return path", async () => {
    redeem.mockResolvedValue({ token: "good", returnPath: "/laptops", expiresAt: new Date(Date.now() + 3_600_000) });

    const reply = await send(gatewayPort, { path: "/_viberglass/callback?code=abc" });

    expect(redeem).toHaveBeenCalledWith("laptops", "abc");
    expect(reply.status).toBe(302);
    expect(reply.headers.location).toBe("/laptops");
    expect(reply.headers["set-cookie"]?.[0]).toMatch(/^viberglass_app=good; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax$/);
  });

  it("offers to open the app again when a code can't be used", async () => {
    redeem.mockResolvedValue(null);

    const reply = await send(gatewayPort, { path: "/_viberglass/callback?code=used" });

    expect(reply.status).toBe(400);
    expect(reply.body).toContain('href="https://viberglass.example.com/apps/laptops/open?return=%2F"');
    expect(reply.headers["set-cookie"]).toBeUndefined();
  });

  it("passes the person's identity to the app in place of any sent along, without the gateway cookie", async () => {
    const reply = await send(gatewayPort, {
      path: "/laptops",
      headers: {
        cookie: "viberglass_app=stale; theme=light; viberglass_app=good",
        "x-viberglass-user-id": "someone-else",
        "x-viberglass-user-role": "admin",
      },
    });

    expect(reply.status).toBe(200);
    const seen = JSON.parse(reply.body);
    expect(seen.url).toBe("/laptops");
    expect(seen.headers["x-viberglass-user-id"]).toBe("user-1");
    expect(seen.headers["x-viberglass-user-email"]).toBe("ada@example.com");
    expect(decodeURIComponent(seen.headers["x-viberglass-user-name"])).toBe("Ada Lövelace");
    expect(seen.headers["x-viberglass-user-role"]).toBeUndefined();
    expect(seen.headers.cookie).toBe("theme=light");
    expect(seen.headers["x-forwarded-host"]).toBe(HOST);
    expect(reply.headers["set-cookie"]).toEqual(["theme=dark; Path=/"]);
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
    route = { kind: "proxy", target: "http://127.0.0.1:1", user: ADA };

    expect((await send(gatewayPort, { headers: { cookie: "viberglass_app=good" } })).status).toBe(502);
  });

  it("passes websockets on with the person's identity, only from the app's own origin", async () => {
    const own = await upgrade(gatewayPort, { cookie: "viberglass_app=good", origin: `http://${HOST}` });
    const sibling = await upgrade(gatewayPort, { cookie: "viberglass_app=good", origin: "http://payroll.apps.example.com" });
    const signedOut = await upgrade(gatewayPort, { origin: `http://${HOST}` });

    expect(own.status).toBe(101);
    expect(own.headers["x-seen-user"]).toBe("user-1");
    expect(sibling.status).toBe(401);
    expect(signedOut.status).toBe(401);
  });
});
