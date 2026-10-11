export interface WorkerObjectStorage {
  download(storageUrl: string): Promise<Buffer>;
  upload(archive: Buffer): Promise<string>;
}
