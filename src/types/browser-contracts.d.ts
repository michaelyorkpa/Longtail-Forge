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

/**
 * One lazily loaded script a module action needs before it can be opened.
 *
 * `0.33.33.34` moved this vocabulary out of `public/js/workbench.js`, where the same
 * shape was expressed as a private constant whose readiness probe was a closure. A
 * closure cannot be checked, so the descriptor names the namespace member the script
 * must publish instead: `surface` alone for a script that publishes a whole helper,
 * `surface` plus `member` for one that extends a namespace object another script owns.
 */
export interface ModuleActionDependency {
  /** Member of `surface` that must exist once the script has run. */
  member?: string;
  /** Load through dynamic `import()` rather than a classic `<script>` element. */
  module?: boolean;
  /** Document-relative source path, before asset versioning is applied. */
  src: string;
  /** `LongtailForge` member the script publishes. */
  surface: string;
}

/**
 * The dependency-loading half of `LongtailForge.moduleActions`, published by
 * `public/js/shared/module-actions.js`.
 *
 * Deliberately separate from the registry's own `list`/`open`/`register`: a host page
 * loads dependencies before the registry can dispatch, so this half has to be usable
 * while the action it is loading for is still unopenable.
 */
export interface ModuleActionDependencyLoader {
  /** The declared dependencies for an action, or an empty list for an unknown one. */
  dependenciesFor(actionId: string): ModuleActionDependency[];
  /** Load an action's dependencies in declaration order, skipping satisfied ones. */
  ensureDependencies(actionId: string): Promise<void>;
}

/**
 * Published by `public/js/shared/asset-version.js`. Appends the running app version to
 * an asset URL so a lazily loaded script is cache-busted the same way a declared one is.
 * Named here by `0.33.33.34` so the shared dependency loader can apply versioning through
 * the same expression its callers used, rather than probing an unknown-typed member.
 */
export interface BrowserAssetVersion {
  url(assetUrl: string): string;
  value: string;
}

/**
 * A record a Files module action was invoked with.
 *
 * Hosts have passed the attachment under several keys over time, and the record itself is
 * also accepted, so every carrier key is optional and recursive. Published by
 * `0.33.33.34` because the unwrapping now happens in `public/js/shared/file-preview.js`
 * while `public/js/files.js` still delegates to it.
 */
export interface BrowserFileActionRecord {
  attachment?: BrowserFileActionRecord;
  attachmentId?: string;
  file?: BrowserFileActionRecord;
  fileAttachment?: BrowserFileActionRecord;
  fileName?: string;
  file_attachment_id?: string;
  record?: BrowserFileActionRecord;
  returnFocusTo?: HTMLElement | null;
  row?: BrowserFileActionRecord;
  trigger?: HTMLElement | null;
}

/**
 * The action-shaped half of `LongtailForge.filePreview`: the `files.preview` opener and
 * the record helpers both Files actions unwrap their params with.
 */
export interface BrowserFilePreviewActions {
  fileActionAttachmentId(attachmentOrRow?: BrowserFileActionRecord): string;
  normalizeFileActionRecord(params?: BrowserFileActionRecord): BrowserFileActionRecord;
  openFilePreviewAction(params?: BrowserFileActionRecord, hostContext?: unknown): unknown;
}

/**
 * `LongtailForge.viewActionSecurity`, published by `public/js/shared/view-action-security.js`.
 *
 * The security-relevant half of descriptor action dispatch, extracted from the view renderer by
 * `0.33.33.35.2`. The renderer keeps the dispatch; this decides whether an action may run and
 * what URL it runs against. Both collaborators are passed in so the module acquires nothing and
 * stays ignorant of descriptor semantics.
 */
export interface BrowserViewActionSecurity {
  /** Whether every permission the action requires is granted in the current workspace. */
  actionPermissionsAllowed(action?: BrowserSecuredAction): boolean;
  /** Throws when the action's required permissions are not granted. */
  assertActionPermissions(action: BrowserSecuredAction): void;
  /** Confirm a guarded action through the framework modal, falling back to the host confirm. */
  confirmDescriptorAction(action: BrowserSecuredAction): Promise<boolean>;
  /** Replace `{field}` route tokens using the supplied reader; unresolved tokens are left intact. */
  interpolateRoute(route: unknown, record: unknown, readValue: BrowserDescriptorValueReader): unknown;
  /** Run a descriptor route action; settling surface state is the caller's concern. */
  runRouteAction(
    action: BrowserSecuredAction,
    context: { api: BrowserApi; readValue: BrowserDescriptorValueReader; record?: unknown },
  ): Promise<void>;
}

/** The parts of a descriptor action `viewActionSecurity` reads. */
export interface BrowserSecuredAction {
  confirm?: unknown;
  id?: string;
  label?: string;
  method?: string;
  payload?: unknown;
  requiredPermissions?: unknown;
  route?: string;
}

/** Reads one descriptor field out of a record. Supplied by the caller, never resolved. */
export type BrowserDescriptorValueReader = (record: unknown, field: string, fallback?: unknown) => unknown;

/**
 * `LongtailForge.viewSearchOptions`, published by `public/js/shared/view-search-options.js`.
 *
 * Option hydration for descriptor fields: native `<select>` population and the search-suggestion
 * combobox that stands in for a select on free-text controls. Extracted by `0.33.33.35.2`. The
 * control types are structural because the renderer drives real DOM and the framework
 * regressions drive a fake one.
 */
export interface BrowserViewSearchOptions {
  /** Mount the suggestion combobox on a text control, replacing any previous mount. */
  mountSearchOptions(control: unknown, options?: unknown[], config?: BrowserSearchOptionsConfig): void;
  /** Normalize pair-array, object, and scalar option shapes into one row shape. */
  normalizeSelectOptions(options?: unknown[]): Record<string, unknown>[];
  /** Route option hydration by control type. */
  setFieldOptions(control: unknown, options?: unknown[], selectedValue?: unknown, optionsConfig?: BrowserSearchOptionsConfig): void;
  /** Put a control into its options-unavailable state without inventing option content. */
  setFieldOptionsError(control: unknown, message?: string): void;
  /** Populate a native select. */
  setSelectOptions(control: unknown, options?: unknown[], selectedValue?: unknown): void;
}

export interface BrowserSearchOptionsConfig {
  emptyMessage?: string;
  maxResults?: number;
  minChars?: number;
  selectedValue?: unknown;
  submitMode?: string;
}

/**
 * `LongtailForge.viewDataBinding`, published by `public/js/shared/view-data-binding.js`.
 *
 * Turns a descriptor's `dataSource` into records: filtered route, response envelope, field
 * bindings. Extracted by `0.33.33.35.2`. It holds no descriptor defaults and takes its API
 * client from the caller.
 */
export interface BrowserViewDataBinding {
  /** Append active filter values to a route; unset values never reach the query. */
  appendFilterQuery(route: string, filters: unknown[] | undefined, filterValues: Record<string, unknown> | null | undefined): string;
  /** Map one response row onto the descriptor's declared field bindings. */
  bindRecord(record: unknown, fieldBindings: Record<string, string>): Record<string, unknown>;
  /** Load and bind the records a descriptor's `dataSource` declares. */
  loadBoundRecords(
    descriptor: unknown,
    filterValues: Record<string, unknown> | null | undefined,
    api: BrowserApi,
  ): Promise<Record<string, unknown>[]>;
  /** Read a dotted path out of a source object. */
  readPath(source: unknown, path: unknown): unknown;
}

/**
 * `LongtailForge.viewModalStack`, published by `public/js/shared/view-modal-stack.js`.
 *
 * The modal stack extracted from the view builder by `0.33.33.35.3`: which dialogs are open,
 * which is on top, which belong to which parent, and what happens to focus when one closes.
 *
 * `view-builder.js` keeps publishing these four on the frozen `LongtailForge.view` factory and
 * delegates each here, so the public factory contract is unchanged. The modal *constructors*
 * stay in the builder, which is what lets this depend on nothing but the dialogs it is handed.
 * Entry bookkeeping and registration stay private to the module.
 */
export interface BrowserViewModalStack {
  /** Close every dialog opened from this one, deepest first. */
  closeChildModals(parent: unknown, value?: string): void;
  /** Close a dialog and everything it opened. */
  closeModal(dialog: unknown, value?: string): void;
  /** Whether this dialog is currently the top of the stack. */
  isTopModal(dialog: unknown): boolean;
  /** Open a dialog on top of the stack, honouring an explicitly passed parent even when null. */
  showModal(dialog: unknown, options?: BrowserModalStackOptions): unknown;
}

export interface BrowserModalStackOptions {
  parent?: unknown;
  returnFocus?: boolean;
  trigger?: unknown;
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
  assetVersion?: BrowserAssetVersion;
  cachedFetch?: BrowserCachedFetch;
  controllers?: PageControllerRegistry;
  errors?: BrowserErrorContract;
  formatters?: BrowserFormatters;
  pageController?: BrowserPageController;
  /**
   * Published by `public/js/login.js`. The required-password-change form is
   * only reached through a server response to a temporary password, so the
   * login end-to-end spec drives that transition directly. `0.33.33.33.2`
   * scoped the controller, which removed the implicit global the spec had
   * been reaching for; the surface is named here rather than rediscovered.
   */
  loginPage?: { showRequiredPasswordChange: (currentPassword?: string) => void };
  /**
   * Published by `public/js/navigation.js` and read by the Workspace Settings
   * controller after a rename.
   *
   * `0.33.33.33.1` scoped the navigation script and declared this on `Window`,
   * because the consumer had been resolving the read against that script's
   * top-level function through the shared global scope. `0.33.33.33.3` owns
   * that consumer and moved the surface here: every other surface navigation
   * publishes is a namespace member, and the only bare `window.*` it still
   * owns is the deliberate `fetch` patch.
   */
  applyWorkspaceName?: (value: unknown) => void;
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
