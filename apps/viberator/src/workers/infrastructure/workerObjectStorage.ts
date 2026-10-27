export interface WorkerObjectStorage {
  download(storageUrl: string): Promise<Buffer>;
  upload(archive: Buffer, sessionId: string): Promise<string>;
}
