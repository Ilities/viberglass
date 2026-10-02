import { execFileSync } from "child_process";
import { createReadStream, mkdtempSync, rmSync, statSync, writeFileSync } from "fs";
import { createServer, Server } from "http";
import { tmpdir } from "os";
import { join, normalize } from "path";

/** Where tests find the fixture repository on disk. */
export const GIT_FIXTURE_DIR_ENV = "E2E_GIT_FIXTURE_DIR";

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
/**
 * Pushes a commit, as someone working on the task locally, to a branch of
 * the fixture repository, starting it from main if it's new.
 */
export function pushToFixture(branch: string, file: string, contents: string, message: string): void {
  const bareDir = process.env[GIT_FIXTURE_DIR_ENV];
  if (!bareDir) throw new Error(`${GIT_FIXTURE_DIR_ENV} isn't set; the fixture starts in global setup`);
  const workDir = mkdtempSync(join(tmpdir(), "viberglass-e2e-push-"));
  try {
    git(workDir, "clone", bareDir, ".");
    try {
      git(workDir, "checkout", "--track", `origin/${branch}`);
    } catch {
      git(workDir, "checkout", "-b", branch);
    }
    writeFileSync(join(workDir, file), contents);
    git(workDir, "add", file);
    git(workDir, "-c", "user.name=Dev Local", "-c", "user.email=dev@e2e.test", "commit", "-m", message);
    git(workDir, "push", "origin", branch);
    git(bareDir, "update-server-info");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

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

  /** The bare repository on disk; tests push to it directly, since the HTTP side is read-only. */
  get repositoryDir(): string {
    if (!this.root) throw new Error("The git fixture isn't started");
    return join(this.root, "fixture.git");
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (this.root) rmSync(this.root, { recursive: true, force: true });
  }
}
