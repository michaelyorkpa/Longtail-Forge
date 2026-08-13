declare module "better-sqlite3" {
  export interface Statement {
    readonly reader: boolean;
    all(...bindings: unknown[]): Record<string, unknown>[];
    get(...bindings: unknown[]): Record<string, unknown> | undefined;
    run(...bindings: unknown[]): unknown;
  }

  export default class BetterSqliteDatabase {
    constructor(filename: string, options?: Readonly<{ fileMustExist?: boolean; readonly?: boolean; timeout?: number; verbose?: (message?: unknown) => void }>);
    readonly open: boolean;
    backup(filename: string): Promise<unknown>;
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    pragma(sql: string): unknown;
  }
}