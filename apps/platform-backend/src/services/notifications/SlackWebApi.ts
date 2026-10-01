import { isObjectRecord } from "@viberglass/types";

type Fetch = typeof fetch;

/**
 * The two Slack Web API calls notifications need, with the bot token the
 * Slack install already uses. `SLACK_API_URL` points tests at a stub.
 */
export class SlackWebApi {
  constructor(
    private readonly token: string | undefined = process.env.SLACK_BOT_TOKEN,
    private readonly baseUrl: string = process.env.SLACK_API_URL || "https://slack.com/api",
    private readonly fetchFn: Fetch = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.token && this.token !== "not-configured");
  }

  /** A DM is a message to the person's user id. */
  async postMessage(channel: string, text: string): Promise<void> {
    await this.call("chat.postMessage", { channel, text, unfurl_links: false });
  }

  async lookupUserIdByEmail(email: string): Promise<string | null> {
    const body = await this.call("users.lookupByEmail", { email }, "GET");
    return isObjectRecord(body.user) && typeof body.user.id === "string" ? body.user.id : null;
  }

  private async call(method: string, params: Record<string, unknown>, httpMethod: "GET" | "POST" = "POST") {
    const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/${method}`);
    if (httpMethod === "GET") {
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    }
    const response = await this.fetchFn(url, {
      method: httpMethod,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(httpMethod === "POST" && { "Content-Type": "application/json; charset=utf-8" }),
      },
      ...(httpMethod === "POST" && { body: JSON.stringify(params) }),
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!isObjectRecord(body) || body.ok !== true) {
      const error = isObjectRecord(body) && typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
      throw new SlackApiError(method, error);
    }
    return body;
  }
}

export class SlackApiError extends Error {
  constructor(
    readonly method: string,
    readonly slackError: string,
  ) {
    super(`Slack ${method} failed: ${slackError}`);
  }
}
