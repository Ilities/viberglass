import { spawn, type ChildProcess } from "child_process";
import { withWorkingDirectory } from "../workingDirectoryEnvironment";

/** Starts the harness's ACP server, passing on each line it writes to stdout and what it writes to stderr. */
export function spawnAcpProcess(
  command: string[],
  workDir: string,
  env: NodeJS.ProcessEnv,
  onLine: (line: string) => void,
  onStderr: (chunk: string) => void,
): ChildProcess {
  const [cmd, ...args] = command;
  if (!cmd) throw new Error("ACP command is empty");

  const child = spawn(cmd, args, {
    cwd: workDir,
    env: withWorkingDirectory(env, workDir),
    stdio: ["pipe", "pipe", "pipe"],
    // Its own group, so stopping it reaches the processes it starts (codex app-server).
    detached: true,
  });

  let buf = "";
  child.stdout?.on("data", (data: Buffer) => {
    buf += data.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (t) onLine(t);
    }
  });

  child.stderr?.on("data", (data: Buffer) => onStderr(data.toString().trim()));

  return child;
}
