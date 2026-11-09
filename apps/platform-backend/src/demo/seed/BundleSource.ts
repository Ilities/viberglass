import { promises as fs } from "fs";
import path from "path";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";

/** Where a seed reads its bundle from. */
export interface BundleSource {
  read(relative: string): Promise<Buffer>;
  describe(): string;
}

function checked(relative: string): string[] {
  const segments = relative.split("/");
  if (segments.some((segment) => segment === ".." || segment === "")) throw new Error(`Refusing the bundle path ${relative}`);
  return segments;
}

export class LocalBundleSource implements BundleSource {
  constructor(private readonly directory: string) {}

  read(relative: string): Promise<Buffer> {
    return fs.readFile(path.join(this.directory, ...checked(relative)));
  }

  describe(): string {
    return this.directory;
  }
}

export class S3BundleSource implements BundleSource {
  private readonly prefix: string;

  constructor(
    private readonly s3: Pick<S3Client, "send">,
    private readonly bucket: string,
    prefix: string,
  ) {
    this.prefix = prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
  }

  async read(relative: string): Promise<Buffer> {
    const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: `${this.prefix}${checked(relative).join("/")}` }));
    if (!object.Body) throw new Error(`s3://${this.bucket}/${this.prefix}${relative} is empty`);
    return Buffer.from(await object.Body.transformToByteArray());
  }

  describe(): string {
    return `s3://${this.bucket}/${this.prefix}`;
  }
}
