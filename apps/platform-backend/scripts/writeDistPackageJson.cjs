#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const distDir = path.resolve(__dirname, "..", "dist");
const outputPath = path.join(distDir, "package.json");

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(
  outputPath,
  `${JSON.stringify({ type: "module" }, null, 2)}\n`,
  "utf8",
);

console.log(`[build] wrote ${path.relative(process.cwd(), outputPath)}`);
