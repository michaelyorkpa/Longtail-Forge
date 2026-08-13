import type {
  ActiveApiKey,
  ApiSession,
  HttpIdentityRequest,
  JsonBodyRequest,
  RequestSession,
  WorkspaceRequestSession,
} from "./http-contracts.js";

export interface RouteRequest extends HttpIdentityRequest, JsonBodyRequest {
  params: Record<string, string>;
  rateLimit?: { limit?: number; remaining?: number; resetTime?: Date; used?: number };
  query: Record<string, unknown>;
  get?(name: string): string | undefined;
}

export interface RouteResponse extends NodeJS.WritableStream {
  headersSent: boolean;
  statusCode: number;
  append(name: string, value: string | readonly string[]): this;
  destroy(error?: Error): this;
  end(contents?: unknown): this;
  json(payload: unknown): this;
  once(event: "finish", listener: () => void): this;
  send(payload?: unknown): this;
  set(name: string, value: string): this;
  set(headers: Record<string, string>): this;
  setHeader(name: string, value: string | readonly string[]): this;
  status(statusCode: number): this;
  type(contentType: string): this;
  writeHead(statusCode: number, headers?: Record<string, string>): this;
}

export type RouteNext = (error?: unknown) => void;

export interface RouterContract {
  delete(path: string | string[], ...handlers: unknown[]): this;
  get(path: string | string[], ...handlers: unknown[]): this;
  patch(path: string | string[], ...handlers: unknown[]): this;
  post(path: string | string[], ...handlers: unknown[]): this;
  put(path: string | string[], ...handlers: unknown[]): this;
  use(...entries: unknown[]): this;
}

export interface AuthenticatedRouteRequest extends RouteRequest {
  session: RequestSession;
}

export interface WorkspaceRouteRequest extends AuthenticatedRouteRequest {
  session: WorkspaceRequestSession;
}

export interface ApiKeyRouteRequest extends RouteRequest {
  apiKey: ActiveApiKey;
  apiSession: ApiSession;
}

export type ErrorRouteHandler = (
  error: unknown,
  request: RouteRequest,
  response: RouteResponse,
  next: RouteNext,
) => unknown;

export type AsyncRouteResult = unknown | Promise<unknown>;

export type AsyncRouteHandler<RequestType extends RouteRequest = RouteRequest> = (
  request: RequestType,
  response: RouteResponse,
  next: RouteNext,
) => AsyncRouteResult;

export type AuthenticatedAsyncRouteHandler = AsyncRouteHandler<AuthenticatedRouteRequest>;
export type WorkspaceAsyncRouteHandler = AsyncRouteHandler<WorkspaceRouteRequest>;
export type ApiKeyAsyncRouteHandler = AsyncRouteHandler<ApiKeyRouteRequest>;

export type AsyncRouteAdapter<HandlerType extends AsyncRouteHandler = AsyncRouteHandler> = (
  handler: HandlerType,
) => AsyncRouteHandler;
