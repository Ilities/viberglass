import * as fs from "fs";
import * as http from "http";
import * as os from "os";
import * as path from "path";
import { uploadBundle } from "./releaseBundle";

describe("uploadBundle", () => {
  let root: string;
  let server: http.Server;
  let received: { headers: http.IncomingHttpHeaders; body: Buffer } | null;
  let status: number;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "upload-bundle-"));
    received = null;
    status = 200;
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        received = { headers: req.headers, body: Buffer.concat(chunks) };
        res.statusCode = status;
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });

  const url = () => {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("The server isn't listening");
    return `http://127.0.0.1:${address.port}/bucket/bundle.tar.gz?X-Amz-Signature=abc`;
  };

  it("streams the file with the length and type the signature expects", async () => {
    const file = path.join(root, "bundle.tar.gz");
    fs.writeFileSync(file, Buffer.alloc(300_000, 7));

    await uploadBundle(url(), file, 300_000);

    expect(received?.headers["content-length"]).toBe("300000");
    expect(received?.headers["content-type"]).toBe("application/gzip");
    expect(received?.body.equals(fs.readFileSync(file))).toBe(true);
  });

  it("fails when storage refuses the upload", async () => {
    const file = path.join(root, "bundle.tar.gz");
    fs.writeFileSync(file, "x");
    status = 403;

    await expect(uploadBundle(url(), file, 1)).rejects.toThrow("HTTP 403");
  });
});
