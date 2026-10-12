import fs from "fs";
import path from "path";

/**
 * A harness or integration is a plugin package, and nothing outside it names it:
 * code that does has to change for every plugin added or left out of a build.
 * This reads each plugin package's id and looks for it, as a string literal, in
 * the source of every other app and package.
 */
const ROOT = path.resolve(__dirname, "../../../../../..");
const PLUGIN_KINDS = [
  { dir: "packages/agents", idFile: "src/plugin.ts" },
  { dir: "packages/integrations", idFile: "src/manifest.ts" },
];
const SOURCE_ROOTS = ["apps", "packages"];

/** Reviewed: the id appears here meaning something else. */
const ALLOWED: Array<{ file: string; id: string; why: string }> = [
  { file: "packages/types/src/modelProviders.ts", id: "*", why: "model provider ids are their own namespace; some share a harness's name" },
  { file: "*", id: "custom", why: "the custom webhook's id is an everyday word: custom schedules, endpoints and models" },
  { file: "apps/platform-frontend/src/pages/mcp-servers/mcp-server-dialog.tsx", id: "linear", why: "an example MCP server name" },
];

function isIgnored(file: string): boolean {
  return (
    /(^|\/)(node_modules|dist|migrations|__tests__|test|tests)\//.test(file) ||
    /\.test\.tsx?$|Smoke\.ts$/.test(file) ||
    // Generated from the build config: the one place every plugin is named.
    /configured\w*Plugins\.ts$/.test(file)
  );
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return isIgnored(`${relative}/`) ? [] : sourceFiles(relative);
    return /\.tsx?$/.test(entry.name) && !isIgnored(relative) ? [relative] : [];
  });
}

function pluginPackages(): Array<{ dir: string; id: string }> {
  return PLUGIN_KINDS.flatMap(({ dir, idFile }) =>
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(ROOT, dir, entry.name, idFile);
      if (!entry.isDirectory() || entry.name.startsWith("_") || !fs.existsSync(file)) return [];
      const id = /\bid:\s*["']([a-z0-9-]+)["']/.exec(fs.readFileSync(file, "utf8"))?.[1];
      return id ? [{ dir: `${dir}/${entry.name}/`, id }] : [];
    }),
  );
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function isAllowed(file: string, id: string): boolean {
  return ALLOWED.some((allowed) => (allowed.file === "*" || allowed.file === file) && (allowed.id === "*" || allowed.id === id));
}

describe("plugin ids", () => {
  const plugins = pluginPackages();

  it("finds the plugin packages", () => {
    expect(plugins.map((plugin) => plugin.id)).toEqual(expect.arrayContaining(["claude-code", "github"]));
  });

  it("appear only in their own package", () => {
    const files = SOURCE_ROOTS.flatMap(sourceFiles).map((file) => ({ file, source: withoutComments(fs.readFileSync(path.join(ROOT, file), "utf8")) }));
    const found = plugins.flatMap(({ dir, id }) => {
      const literal = new RegExp(`["'\`]${id}["'\`]`);
      return files
        .filter(({ file, source }) => !file.startsWith(dir) && !isAllowed(file, id) && literal.test(source))
        .map(({ file }) => `${file} names '${id}'`);
    });

    expect(found).toEqual([]);
  });
});
