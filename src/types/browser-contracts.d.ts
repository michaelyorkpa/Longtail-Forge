import type { ApiErrorEnvelope } from "./framework-contracts.js";
import type { AppShellBootstrap } from "./framework-contracts.js";
import type { ViewSurfaceDescriptor } from "./framework-contracts.js";
import type { ViewSurfaceDataSource } from "./framework-contracts.js";

export interface BrowserAppShellBootstrapAdapter {
  normalize(value: unknown): AppShellBootstrap;
}

export interface BrowserApiErrorDetails {
  code: string;
  message: string;
  requestId: string;
}

export interface BrowserApiError extends Error {
  body: unknown;
  code: string;
  method?: string;
  requestId: string;
  status: number;
}

export interface BrowserErrorContract {
  createError(body: unknown, fallback: string, status?: number): BrowserApiError;
  read(body: unknown, fallback?: string): BrowserApiErrorDetails;
}

export interface BrowserJsonRequestOptions {
  body?: unknown;
  cache?: RequestCache;
  headers?: Record<string, string>;
  method?: string;
}

export interface BrowserApi {
  deleteJson(url: string, options?: BrowserJsonRequestOptions): Promise<unknown>;
  getJson(url: string, options?: BrowserJsonRequestOptions): Promise<unknown>;
  patchJson(url: string, body: unknown, options?: BrowserJsonRequestOptions): Promise<unknown>;
  postJson(url: string, body: unknown, options?: BrowserJsonRequestOptions): Promise<unknown>;
  putJson(url: string, body: unknown, options?: BrowserJsonRequestOptions): Promise<unknown>;
}

export interface BrowserRecord {
  clientId?: unknown;
  clientName?: unknown;
  id?: unknown;
  isWorkspaceScope?: unknown;
  name?: unknown;
  projectId?: unknown;
  projectName?: unknown;
  username?: unknown;
  [key: string]: unknown;
}

export interface BrowserRecords {
  getProjectMatchKey(project?: BrowserRecord | null): string;
  matchesClient(entry?: BrowserRecord | null, client?: BrowserRecord | null): boolean;
  matchesProject(entry?: BrowserRecord | null, project?: BrowserRecord | null): boolean;
  normalizeKey(value: unknown): string;
  sortByName<Item extends BrowserRecord>(items: Item[]): Item[];
}

export interface BrowserViewResponseRecords {
  read(body: unknown, recordsKey?: unknown): unknown[];
}

export interface BrowserViewSurfaceDescriptorAdapter {
  normalize(value: unknown): BrowserViewSurfaceDescriptor;
}

export interface BrowserViewSurfaceDescriptor extends Omit<ViewSurfaceDescriptor, "dataSource"> {
  dataSource?: ViewSurfaceDataSource | null;
  viewPath?: string;
}

export interface BrowserFormatters {
  currency(amount: unknown): string;
  dateInput(date: Date): string;
  entryStatus(status: unknown): string;
  hours(seconds: unknown): string;
  monthLabel(date: Date): string;
  name(value: unknown, fallback?: string): string;
}

export interface CachedFetchOptions {
  cacheKey?: string;
  onUpdate?: (data: unknown) => void;
}

export interface CachedFetchResult {
  data: unknown;
  fromCache: boolean;
  revalidated: Promise<unknown>;
}

export interface BrowserCachedFetch {
  clearCached(cacheKey: string): void;
  getJson(url: string, options?: CachedFetchOptions): Promise<CachedFetchResult>;
  readCached(cacheKey: string): unknown;
  writeCached(cacheKey: string, data: unknown): void;
}

export interface PageSmokeResult {
  checks?: unknown[];
  error?: string;
  ok: boolean;
  pageId: string;
  [key: string]: unknown;
}

export interface PageControllerDefinition {
  runSmoke?: () => PageSmokeResult;
  [key: string]: unknown;
}

export interface RegisteredPageController extends PageControllerDefinition {
  runSmoke: () => PageSmokeResult;
}

export interface PageControllerRegistry {
  [pageId: string]: RegisteredPageController;
}

export interface BrowserPageController {
  createOption(value: string, text: string): HTMLOptionElement;
  register(pageId: string, controller: PageControllerDefinition): RegisteredPageController;
  runSmoke(pageId: string): PageSmokeResult;
  setStatus(element: HTMLElement | null | undefined, message: string, options?: { isError?: boolean }): void;
  sortByName<Item extends BrowserRecord>(items: Item[]): Item[];
}

export interface LongtailForgeBrowserNamespace {
  api?: BrowserApi;
  appShellBootstrap?: BrowserAppShellBootstrapAdapter;
  cachedFetch?: BrowserCachedFetch;
  controllers?: PageControllerRegistry;
  errors?: BrowserErrorContract;
  formatters?: BrowserFormatters;
  pageController?: BrowserPageController;
  records?: BrowserRecords;
  viewSurfaceDescriptor?: BrowserViewSurfaceDescriptorAdapter;
  viewResponseRecords?: BrowserViewResponseRecords;
  [key: string]: unknown;
}

export type BrowserErrorEnvelope = ApiErrorEnvelope;

declare global {
  interface Window {
    LongtailForge?: LongtailForgeBrowserNamespace;
  }
}
