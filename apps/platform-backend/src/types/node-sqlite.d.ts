// The installed @types/node predates node:sqlite; this is the part the backend uses.
declare module "node:sqlite" {
  export interface StatementSync {
    all(...parameters: unknown[]): unknown[];
  }

  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
