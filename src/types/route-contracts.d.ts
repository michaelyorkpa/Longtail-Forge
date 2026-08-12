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
  query: Record<string, unknown>;
  get?(name: string): string | undefined;
}

export interface RouteResponse extends NodeJS.WritableStream {
  headersSent: boolean;
  statusCode: number;
  append(name: string, value: string | readonly string[]): RouteResponse;
  destroy(error?: Error): RouteResponse;
  end(contents?: unknown): RouteResponse;
  json(payload: unknown): RouteResponse;
  once(event: "finish", listener: () => void): RouteResponse;
  send(payload?: unknown): RouteResponse;
  set(name: string, value: string): RouteResponse;
  set(headers: Record<string, string>): RouteResponse;
  setHeader(name: string, value: string | readonly string[]): RouteResponse;
  status(statusCode: number): RouteResponse;
  type(contentType: string): RouteResponse;
  writeHead(statusCode: number, headers?: Record<string, string>): RouteResponse;
}

export type RouteNext = (error?: unknown) => void;

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
