import { TrackerIssueRuleService } from "../../../../../api/services/integrations/TrackerIssueRuleService";

function setup(provider: "github" | "jira" | "custom") {
  const contextResolver = {
    getIntegrationOrThrow: jest.fn().mockResolvedValue({ id: "conn-1", system: provider, config: {} }),
    resolveContextOrThrow: jest.fn().mockResolvedValue({
      integration: { id: "conn-1", system: provider, config: {} },
      provider,
      providerPolicy: { provider, targetsOneSpace: provider === "custom" },
    }),
  };
  const rules = {
    listForSpace: jest.fn().mockResolvedValue([]),
    listForConnection: jest.fn().mockResolvedValue([]),
    replaceForSpace: jest.fn().mockResolvedValue(undefined),
  };
  return { rules, service: new TrackerIssueRuleService(contextResolver, rules) };
}

describe("TrackerIssueRuleService", () => {
  it("saves a space's labels once each, ignoring case, with their plan setting", async () => {
    const { rules, service } = setup("jira");

    await service.replaceForSpace("space-1", "conn-1", [{ label: " Frontend " }, { label: "frontend", planNewIssues: true }, { label: "ops" }]);

    expect(rules.replaceForSpace).toHaveBeenCalledWith("space-1", "conn-1", [
      { label: "frontend", planNewIssues: true },
      { label: "ops", planNewIssues: false },
    ]);
  });

  it("needs a label for Jira and Shortcut, and lets GitHub take every issue in the space's repository", async () => {
    const jira = setup("jira");
    await expect(jira.service.replaceForSpace("space-1", "conn-1", [{ label: "" }])).rejects.toMatchObject({ statusCode: 400 });
    expect(jira.rules.replaceForSpace).not.toHaveBeenCalled();

    const github = setup("github");
    await github.service.replaceForSpace("space-1", "conn-1", [{ label: null, planNewIssues: true }]);
    expect(github.rules.replaceForSpace).toHaveBeenCalledWith("space-1", "conn-1", [{ label: null, planNewIssues: true }]);
  });

  it("refuses rules for a connection whose webhooks point at a space of their own", async () => {
    const { rules, service } = setup("custom");
    await expect(service.replaceForSpace("space-1", "conn-1", [{ label: "x" }])).rejects.toMatchObject({ statusCode: 400 });
    expect(rules.replaceForSpace).not.toHaveBeenCalled();
  });
});
