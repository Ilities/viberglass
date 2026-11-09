import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from "@aws-sdk/client-s3";

/** Deletes every object in a bucket. */
export class BucketWipe {
  constructor(
    private readonly s3: Pick<S3Client, "send">,
    private readonly bucket: string,
  ) {}

  async run(): Promise<number> {
    let deleted = 0;
    for (;;) {
      // Listing from the start each time: the previous page is gone.
      const page = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, MaxKeys: 1000 }));
      const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [{ Key: object.Key }] : []));
      if (keys.length === 0) return deleted;
      const result = await this.s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }));
      if (result.Errors && result.Errors.length > 0) {
        throw new Error(`Could not delete ${result.Errors.length} objects, the first ${result.Errors[0].Key}: ${result.Errors[0].Message}`);
      }
      deleted += keys.length;
    }
  }
}
