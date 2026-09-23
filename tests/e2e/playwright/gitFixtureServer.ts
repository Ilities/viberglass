import { execFileSync } from "child_process";
import { createReadStream, mkdtempSync, rmSync, statSync, writeFileSync } from "fs";
import { createServer, Server } from "http";
import { tmpdir } from "os";
import { join, normalize } from "path";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

/** Creates a bare repository with one commit on `main`, ready for dumb-HTTP cloning. */
function createFixtureRepository(root: string): string {
  const bareDir = join(root, "fixture.git");
  const workDir = join(root, "work");

  git(root, "init", "--bare", "--initial-branch=main", bareDir);
  git(root, "clone", bareDir, workDir);
  writeFileSync(join(workDir, "README.md"), "# E2E fixture repository\n");
  writeFileSync(
    join(workDir, "greeting.js"),
    "export const greeting = () => 'hello';\n",
  );
  git(workDir, "add", ".");
  git(
    workDir,
    "-c", "user.name=E2E",
    "-c", "user.email=e2e@e2e.test",
    "commit", "-m", "Initial commit",
  );
  git(workDir, "push", "origin", "main");
  // Dumb HTTP clients read info/refs and objects/info/packs.
  git(bareDir, "update-server-info");
  return root;
}

/**
 * Serves a fixture git repository over plain HTTP so worker containers can
 * clone it without network access or credentials.
 */
export class GitFixtureServer {
  private server?: Server;
  private root?: string;

  async start(port: number): Promise<void> {
    const root = createFixtureRepository(
      mkdtempSync(join(tmpdir(), "viberglass-e2e-git-")),
    );
    this.root = root;

    this.server = createServer((req, res) => {
      const requestPath = normalize(decodeURIComponent(req.url?.split("?")[0] ?? "/"));
      const filePath = join(root, requestPath);
      if (!filePath.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      try {
        if (!statSync(filePath).isFile()) throw new Error("not a file");
      } catch {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      createReadStream(filePath).pipe(res);
    });

    const server = this.server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "0.0.0.0", resolve);
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (this.root) rmSync(this.root, { recursive: true, force: true });
  }
}
