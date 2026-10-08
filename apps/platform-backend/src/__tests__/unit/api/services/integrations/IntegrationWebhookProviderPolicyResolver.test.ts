import {
  createDefaultIntegrationWebhookProviderPolicyResolver,
  IntegrationWebhookProviderPolicyResolver,
} from "../../../../../api/services/integrations/IntegrationWebhookProviderPolicyResolver";

describe("IntegrationWebhookProviderPolicyResolver", () => {
  it("has trackers' webhooks route by the spaces' rules, and custom webhooks point at a space", () => {
    const resolver = createDefaultIntegrationWebhookProviderPolicyResolver();

    expect(resolver.resolve("github").targetsOneSpace).toBe(false);
    expect(resolver.resolve("jira").targetsOneSpace).toBe(false);
    expect(resolver.resolve("shortcut").targetsOneSpace).toBe(false);
    expect(resolver.resolve("custom").targetsOneSpace).toBe(true);
  });

  it("throws when provider policy is missing", () => {
    const resolver = new IntegrationWebhookProviderPolicyResolver([]);

    expect(() => resolver.resolve("github")).toThrow(
      "No integration webhook provider policy registered for 'github'",
    );
  });
});
