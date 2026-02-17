import {
  createDefaultIntegrationWebhookProviderPolicyResolver,
  IntegrationWebhookProviderPolicyResolver,
} from "../../../../../api/services/integrations/IntegrationWebhookProviderPolicyResolver";

describe("IntegrationWebhookProviderPolicyResolver", () => {
  it("resolves default provider policies for all supported providers", () => {
    const resolver = createDefaultIntegrationWebhookProviderPolicyResolver();

    expect(resolver.resolve("github").getProviderLabel()).toBe("GitHub");
    expect(resolver.resolve("jira").getProviderLabel()).toBe("Jira");
    expect(resolver.resolve("shortcut").getProviderLabel()).toBe("Shortcut");
    expect(resolver.resolve("custom").getProviderLabel()).toBe("Custom");
  });

  it("throws when provider policy is missing", () => {
    const resolver = new IntegrationWebhookProviderPolicyResolver([]);

    expect(() => resolver.resolve("github")).toThrow(
      "No integration webhook provider policy registered for 'github'",
    );
  });

  it("exposes provider fallback and always-on outbound flags", () => {
    const resolver = createDefaultIntegrationWebhookProviderPolicyResolver();

    expect(resolver.resolve("github").shouldRequireAlwaysOnOutboundEvents()).toBe(
      true,
    );
    expect(resolver.resolve("jira").shouldRequireAlwaysOnOutboundEvents()).toBe(
      true,
    );
    expect(
      resolver.resolve("shortcut").shouldUseIntegrationProviderProjectIdFallback(),
    ).toBe(false);
    expect(
      resolver.resolve("jira").shouldUseIntegrationProviderProjectIdFallback(),
    ).toBe(false);
    expect(
      resolver.resolve("custom").shouldUseIntegrationProviderProjectIdFallback(),
    ).toBe(true);
  });
});
