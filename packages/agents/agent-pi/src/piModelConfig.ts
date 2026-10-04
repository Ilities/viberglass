import * as fs from "fs";
import * as path from "path";
import { isObjectRecord } from "@viberglass/types";

function readConfig(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  const value: unknown = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (!isObjectRecord(value))
    throw new Error("Pi configuration must be an object");
  return value;
}

export function writePiModelConfig(piDir: string): void {
  if (!process.env.PI_CUSTOM_MODELS || !process.env.PI_CUSTOM_MODEL) return;
  const generated: unknown = JSON.parse(process.env.PI_CUSTOM_MODELS);
  if (!isObjectRecord(generated) || !isObjectRecord(generated.providers))
    throw new Error("Invalid Pi model configuration");
  fs.mkdirSync(piDir, { recursive: true });
  const modelsPath = path.join(piDir, "models.json");
  const models = readConfig(modelsPath);
  const providers = isObjectRecord(models.providers) ? models.providers : {};
  fs.writeFileSync(
    modelsPath,
    JSON.stringify({
      ...models,
      providers: { ...providers, ...generated.providers },
    }),
    { mode: 0o600 },
  );
  const settingsPath = path.join(piDir, "settings.json");
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({
      ...readConfig(settingsPath),
      defaultProvider: "viberglass",
      defaultModel: process.env.PI_CUSTOM_MODEL,
    }),
    { mode: 0o600 },
  );
}
