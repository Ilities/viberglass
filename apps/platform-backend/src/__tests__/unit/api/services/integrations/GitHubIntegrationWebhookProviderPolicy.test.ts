import { IntegrationRouteServiceError } from "../../../../../api/services/integrations";
import { GitHubIntegrationWebhookProviderPolicy } from "../../../../../api/services/integrations/GitHubIntegrationWebhookProviderPolicy";

describe("GitHubIntegrationWebhookProviderPolicy", () => {
  const policy = new GitHubIntegrationWebhookProviderPolicy();

  it("validates owner/repo provider project mapping", () => {
    expect(() => policy.validateProviderProjectId("acme/repo")).not.toThrow();
    expect(() => policy.validateProviderProjectId("bad-format")).toThrow(
      IntegrationRouteServiceError,
    );
  });

  it("normalizes matching-events inbound mapping", () => {
    expect(
      policy.normalizeInboundLabelMappings({
        mode: "MATCHING_EVENTS",
      }),
    ).toEqual({
      github: {
        autoExecuteMode: "matching_events",
      },
    });
  });

  it("normalizes label-gated inbound labels", () => {
    expect(
      policy.normalizeInboundLabelMappings({
        github: {
          autoExecuteMode: "label_gated",
          requiredLabels: ["Autofix", "AI-FIX", "autofix"],
        },
      }),
    ).toEqual({
      github: {
        autoExecuteMode: "label_gated",
        requiredLabels: ["autofix", "ai-fix"],
      },
    });
  });

  it("throws for label-gated mode without labels", () => {
    expect(() =>
      policy.normalizeInboundLabelMappings({
        autoExecuteMode: "label_gated",
        labels: [],
      }),
    ).toThrow(IntegrationRouteServiceError);
  });
});
