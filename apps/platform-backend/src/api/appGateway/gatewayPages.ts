import type { ServerResponse } from "http";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function listOf(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** Pages the gateway answers itself, never the app. Plain HTML with no scripts. */
export function sendGatewayPage(res: ServerResponse, status: number, title: string, body: string): void {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#1f2328;line-height:1.5}h1{font-size:1.25rem}a{color:inherit}</style>
</head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`);
}

export function appOffPage(res: ServerResponse, appName: string, maintainers: string[]): void {
  const ask = maintainers.length > 0
    ? `Ask ${escapeHtml(listOf(maintainers))} or a workspace admin to turn it on.`
    : "Ask a workspace admin to turn it on.";
  sendGatewayPage(res, 503, `${appName} is off`, `<p>${ask}</p>`);
}

export function appNotFoundPage(res: ServerResponse): void {
  sendGatewayPage(res, 404, "No app here", "<p>Check the address, or open the app from Viberglass.</p>");
}

export function appForbiddenPage(res: ServerResponse): void {
  sendGatewayPage(res, 403, "You don't have access to this app", "<p>Ask one of its space's maintainers to give you access.</p>");
}

export function appUnreachablePage(res: ServerResponse): void {
  sendGatewayPage(res, 502, "The app isn't answering", "<p>It may be starting or restarting. Try again in a minute.</p>");
}

export function signInFailedPage(res: ServerResponse, openUrl: string): void {
  sendGatewayPage(
    res,
    400,
    "This sign-in link has already been used",
    `<p><a href="${escapeHtml(openUrl)}">Open the app again</a> to sign in.</p>`,
  );
}
