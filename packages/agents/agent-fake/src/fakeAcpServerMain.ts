import * as readline from "readline";
import { FakeAcpServer } from "./FakeAcpServer";

const server = new FakeAcpServer((message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
});

readline
  .createInterface({ input: process.stdin })
  .on("line", (line) => void server.handleLine(line));
