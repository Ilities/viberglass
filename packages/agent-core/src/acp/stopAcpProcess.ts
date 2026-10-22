import type { ChildProcess } from "child_process";
import * as fs from "fs";

export interface StopGrace {
  /** How long the harness gets to save its session once its input closes. */
  saveMs: number;
  /** How long it gets after SIGTERM before SIGKILL. */
  termMs: number;
}

const DEFAULT_GRACE: StopGrace = { saveMs: 15_000, termMs: 5_000 };
const POLL_MS = 100;

/** Signals the whole process group, so helpers the harness started go too. */
export function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try { child.kill(signal); } catch { /* already gone */ }
  }
}

/** A zombie counts as gone: when the worker is PID 1 nobody reaps orphans. */
function groupRunningFromProc(pgid: number): boolean | undefined {
  let entries: string[];
  try {
    entries = fs.readdirSync("/proc");
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    let stat: string;
    try {
      stat = fs.readFileSync(`/proc/${entry}/stat`, "utf8");
    } catch {
      continue;
    }
    // Fields after the parenthesised command name: state ppid pgrp ...
    const [state, , pgrp] = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    if (Number(pgrp) === pgid && state !== "Z" && state !== "X") return true;
  }
  return false;
}

function groupRunning(pgid: number): boolean {
  const fromProc = groupRunningFromProc(pgid);
  if (fromProc !== undefined) return fromProc;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pgid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (groupRunning(pgid)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return true;
}

/**
 * Stops an ACP agent spawned as its own process group and waits until every
 * process in it has gone, so its session files are complete on disk. Closing
 * stdin lets the harness shut down on its own (codex-acp stops its app-server
 * then); signals follow only if it doesn't.
 */
export async function stopAcpProcess(child: ChildProcess, grace: StopGrace = DEFAULT_GRACE): Promise<void> {
  const pgid = child.pid;
  if (pgid === undefined) return;
  try { child.stdin?.end(); } catch { /* already closed */ }
  if (await waitForExit(pgid, grace.saveMs)) return;
  signalProcessGroup(child, "SIGTERM");
  if (await waitForExit(pgid, grace.termMs)) return;
  signalProcessGroup(child, "SIGKILL");
  await waitForExit(pgid, grace.termMs);
}
