import type { TicketMetadata } from "@viberglass/types";
import { formatBrowserCapture } from "../../../../services/taskTurns/formatBrowserCapture";

const CAPTURED: TicketMetadata = {
  capturedBy: "browser-extension",
  pageUrl: "http://localhost:5173/checkout",
  browser: { name: "Chrome", version: "145.0.0.0" },
  os: { name: "Macintosh", version: "Intel Mac OS X 10_15_7" },
  screen: { width: 375, height: 740, viewportWidth: 375, viewportHeight: 740, pixelRatio: 3 },
  console: [
    { level: "error", message: "Payment failed <card_declined>", timestamp: "2026-11-11T17:00:00Z" },
    { level: "info", message: "Loaded", timestamp: "2026-11-11T17:00:00Z" },
  ],
  errors: [{ message: "TypeError: total is undefined", filename: "http://localhost:5173/src/Checkout.tsx", lineno: 42, timestamp: "2026-11-11T17:00:00Z" }],
  failedRequests: [
    { method: "POST", url: "http://localhost:5173/api/billing/checkout", status: 402, timestamp: "2026-11-11T17:00:00Z" },
    { method: "GET", url: "http://localhost:5173/fonts/inter.woff2", error: "net::ERR_CONNECTION_REFUSED", timestamp: "2026-11-11T17:00:00Z" },
  ],
  timestamp: "2026-11-11T17:00:00Z",
  timezone: "Europe/Helsinki",
};

describe("formatBrowserCapture", () => {
  it("lists the page, browser, window, console errors and failed requests", () => {
    expect(formatBrowserCapture(CAPTURED)).toBe(
      [
        "Page: http://localhost:5173/checkout",
        "Browser: Chrome 145.0.0.0 on Macintosh",
        "Viewport: 375 × 740 at pixel ratio 3",
        "Screen: 375 × 740",
        "Console errors and warnings:",
        "  - error: Payment failed &lt;card_declined&gt;",
        "Uncaught errors:",
        "  - TypeError: total is undefined (http://localhost:5173/src/Checkout.tsx:42)",
        "Failed requests:",
        "  - POST http://localhost:5173/api/billing/checkout → 402",
        "  - GET http://localhost:5173/fonts/inter.woff2 failed: net::ERR_CONNECTION_REFUSED",
      ].join("\n"),
    );
  });

  it("shows the first twenty of a long list and counts the rest", () => {
    const failedRequests = Array.from({ length: 25 }, (_, i) => ({ method: "GET", url: `http://x/${i}`, status: 500, timestamp: "t" }));
    const text = formatBrowserCapture({ ...CAPTURED, console: [], errors: [], failedRequests }) ?? "";

    expect(text).toContain("  - GET http://x/19 → 500");
    expect(text).not.toContain("http://x/20 ");
    expect(text).toContain("  - and 5 more");
  });

  it("gives nothing for a task the extension didn't create", () => {
    expect(formatBrowserCapture({ browser: { name: "Manual Entry", version: "1.0" }, timestamp: "t", timezone: "UTC" })).toBeNull();
  });
});
