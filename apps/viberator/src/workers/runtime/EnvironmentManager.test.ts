import { AGENT_ENV_PASSTHROUGH_VAR } from "@viberglass/agent-core";
import { createLogger } from "winston";
import { EnvironmentManager } from "./EnvironmentManager";

const logger = createLogger({ silent: true });

describe("EnvironmentManager", () => {
  afterEach(() => {
    delete process.env.NOTION_TOKEN;
    delete process.env.VIBERGLASS_SCM_TOKEN;
    delete process.env.MY_SETTING;
    delete process.env[AGENT_ENV_PASSTHROUGH_VAR];
  });

  it("passes bound secrets and clanker-config variables through to the agent", () => {
    const manager = new EnvironmentManager(logger);

    manager.inject({ NOTION_TOKEN: "n", VIBERGLASS_SCM_TOKEN: "s" }, { MY_SETTING: "1" }, ["NOTION_TOKEN"]);

    expect(process.env.NOTION_TOKEN).toBe("n");
    expect(process.env.VIBERGLASS_SCM_TOKEN).toBe("s");
    expect(process.env[AGENT_ENV_PASSTHROUGH_VAR]).toBe("MY_SETTING,NOTION_TOKEN");
  });

  it("removes what it injected", () => {
    const manager = new EnvironmentManager(logger);
    manager.inject({ NOTION_TOKEN: "n" }, undefined, ["NOTION_TOKEN"]);

    manager.cleanup({ NOTION_TOKEN: "n" });

    expect(process.env.NOTION_TOKEN).toBeUndefined();
    expect(process.env[AGENT_ENV_PASSTHROUGH_VAR]).toBeUndefined();
  });
});
