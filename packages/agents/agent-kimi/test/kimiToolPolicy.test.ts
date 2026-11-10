import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { writeKimiToolPolicy } from "../src/kimiToolPolicy";

describe("Kimi Code tool policy", () => {
  let home: string;
  const configFile = () => path.join(home, ".kimi-code", "config.toml");

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-home-"));
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  test("turns off Kimi's own question tool when there's no config yet", () => {
    writeKimiToolPolicy(home);
    expect(fs.readFileSync(configFile(), "utf-8")).toBe(`[tools]\ndisabled = ["AskUserQuestion"]\n`);
  });

  test("adds the tools section after the config already there", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), `default_model = "kimi-for-coding"`);
    writeKimiToolPolicy(home);
    expect(fs.readFileSync(configFile(), "utf-8")).toBe(`default_model = "kimi-for-coding"\n\n[tools]\ndisabled = ["AskUserQuestion"]\n`);
  });

  test("leaves a config with its own tools section as it is", () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), `[tools]\ndisabled = ["Bash"]\n`);
    writeKimiToolPolicy(home);
    expect(fs.readFileSync(configFile(), "utf-8")).toBe(`[tools]\ndisabled = ["Bash"]\n`);
  });
});
