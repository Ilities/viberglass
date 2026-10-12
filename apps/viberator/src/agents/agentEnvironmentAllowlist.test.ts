import { allowHarnessEnvironment, sanitizeAgentEnvironment } from "@viberglass/agent-core";
import { buildAgentRegistry } from "./registerPlugins";

/**
 * Agent CLIs get a deny-by-default environment, admitting what the registered
 * plugins say their harness reads. A name a plugin uses but doesn't declare is
 * stripped, and the CLI then fails with a provider error that names nothing.
 */
describe("agent environment", () => {
  const plugins = buildAgentRegistry().list();

  const cases = plugins.flatMap((plugin) =>
    [
      ...(plugin.envAliases?.apiKey ?? []),
      ...(plugin.envAliases?.endpoint ?? []),
      ...(plugin.providers ?? []).map((binding) => binding.envVar),
      ...(plugin.settings ?? []).flatMap((field) => field.env),
      ...(plugin.agentEnv ?? []),
    ].map((name) => [plugin.id, name] as [string, string]),
  );

  it("has declared names to check", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)("%s: %s reaches the CLI", (_id, name) => {
    const { env } = sanitizeAgentEnvironment({ [name]: "value" });

    expect(env[name]).toBe("value");
  });

  it("withholds what no harness declares", () => {
    const { env, removed } = sanitizeAgentEnvironment({ SOME_OTHER_TOKEN: "value", PATH: "/bin" });

    expect(env).toEqual({ PATH: "/bin" });
    expect(removed).toEqual(["SOME_OTHER_TOKEN"]);
  });

  it("withholds a platform credential even when a harness declares it", () => {
    allowHarnessEnvironment(["GITHUB_TOKEN"]);

    expect(sanitizeAgentEnvironment({ GITHUB_TOKEN: "value" }).env).toEqual({});
  });
});
