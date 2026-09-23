import { sanitizeAgentEnvironment } from "@viberglass/agent-core";
import { buildAgentRegistry } from "./registerPlugins";

/**
 * A plugin declares the variables its CLI authenticates with in `envAliases`, and
 * `sanitizeAgentEnvironment` drops anything not on its allowlist. Nothing connects
 * the two, so adding an agent — or an alias to an existing one — silently strips the
 * credential and the CLI fails at runtime with a provider error that names nothing.
 *
 * This is how OPENCODE_API_KEY, QWEN_CLI_API_KEY, MOONSHOT_API_KEY and four others
 * came to be dropped.
 */
describe("agent env aliases survive sanitization", () => {
  const plugins = buildAgentRegistry().list();

  it("registers plugins to check", () => {
    expect(plugins.length).toBeGreaterThan(0);
  });

  const cases = plugins.flatMap((plugin) =>
    Object.entries(plugin.envAliases ?? {}).flatMap(([purpose, names]) =>
      (names as string[]).map(
        (name) => [plugin.id, purpose, name] as [string, string, string],
      ),
    ),
  );

  it("declares aliases for at least one plugin", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)("%s: %s alias %s reaches the CLI", (_id, _purpose, name) => {
    const { env } = sanitizeAgentEnvironment({ [name]: "value" });

    expect(env[name]).toBe("value");
  });
});
