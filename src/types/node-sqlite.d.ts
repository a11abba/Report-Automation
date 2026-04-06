declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(filename: string);
    exec(sql: string): void;
    close(): void;
    prepare(sql: string): {
      run(...params: unknown[]): { changes: number; lastInsertRowid?: number | bigint };
      get<T = Record<string, unknown>>(...params: unknown[]): T | undefined;
      all<T = Record<string, unknown>>(...params: unknown[]): T[];
    };
  }
}
