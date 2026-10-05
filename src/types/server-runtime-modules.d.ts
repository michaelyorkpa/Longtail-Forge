declare module "express" {
  type AsyncRouteHandler = import("./route-contracts.js").AsyncRouteHandler;
  type RouterContract = import("./route-contracts.js").RouterContract;

  export type Request = import("./route-contracts.js").RouteRequest;
  export type Response = import("./route-contracts.js").RouteResponse;
  export interface Router extends RouterContract {}

  export interface Application extends Router {
    // An express application is itself a Node request listener, which is how
    // `http.createServer(app)` works. The declaration omitted that, so a caller
    // mounting the app that way had to cast. Declared rather than cast.
    (request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse): void;
    all(path: string | string[], ...handlers: unknown[]): this;
    disable(name: string): this;
    listen(port: number, host: string, callback?: () => void): import("node:http").Server;
    set(name: string, value: unknown): this;
  }

  export function Router(options?: { mergeParams?: boolean }): Router;

  interface ExpressFactory {
    (): Application;
    json(options?: Record<string, unknown>): AsyncRouteHandler;
    static(root: string): AsyncRouteHandler;
  }

  const express: ExpressFactory;
  export default express;
}

declare module "compression" {
  const compression: () => import("./route-contracts.js").AsyncRouteHandler;
  export default compression;
}

declare module "cookie-parser" {
  const cookieParser: () => import("./route-contracts.js").AsyncRouteHandler;
  export default cookieParser;
}

declare module "busboy" {
  type BusboyWritable = import("node:stream").Writable;
  type BusboyReadable = import("node:stream").Readable;

  interface BusboyOptions {
    headers: Record<string, string | string[] | undefined>;
    limits?: {
      fields?: number;
      fieldSize?: number;
      files?: number;
    };
  }

  interface BusboyFieldInfo {
    encoding: string;
    mimeType: string;
    nameTruncated: boolean;
    valueTruncated: boolean;
  }

  interface BusboyFileInfo {
    encoding: string;
    filename: string;
    mimeType: string;
  }

  // The parser is a Writable the request is piped into, but its event
  // payloads are the whole point of using it. Declaring only Writable left
  // every multipart handler parameter contextually `any` — no diagnostic, no
  // explicit annotation, and no way for a busboy change to be noticed.
  // Only the events this repository consumes are declared.
  export interface BusboyParser extends BusboyWritable {
    on(event: "field", listener: (name: string, value: string, info: BusboyFieldInfo) => void): this;
    on(event: "file", listener: (name: string, stream: BusboyReadable, info: BusboyFileInfo) => void): this;
    on(event: "fieldsLimit" | "filesLimit" | "partsLimit", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "close" | "finish", listener: () => void): this;
  }

  const Busboy: (options: BusboyOptions) => BusboyParser;
  export default Busboy;
}