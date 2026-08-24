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
  interface BusboyOptions {
    headers: Record<string, string | string[] | undefined>;
    limits?: {
      fields?: number;
      fieldSize?: number;
      files?: number;
    };
  }

  const Busboy: (options: BusboyOptions) => import("node:stream").Writable;
  export default Busboy;
}