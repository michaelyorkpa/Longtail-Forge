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

/**
 * One failure a bulk action reports inside an otherwise successful response.
 *
 * **Four producers, one failure record, and that was measured rather than assumed.**
 * `POST /api/notes/bulk`, `POST /api/tags/bulk-assignments`,
 * `POST /api/notes/settings/catalogs/bulk` and `POST /api/tasks/bulk` each loop over their targets
 * and push a constructed object into an `errors` array when one target fails. **What they do not
 * share is the success half**: the four envelopes carry `notes`, `changed`, `catalogs` and `tasks`
 * respectively, and only one of them carries `affectedCount`. `0.33.33.38.4.11`'s planning called
 * this a `{ affectedCount, changed, errors }` envelope; **no producer emits that shape**, and the
 * contract below is the part that is genuinely shared.
 *
 * **`message` is required because all four construct it with a fallback**, so a failure always
 * carries text. `status` is optional because three producers set it from the caught error and the
 * catalog producer does not.
 *
 * **The identity keys are optional across producers, not within one.** Each producer sets exactly
 * one - `note_id`, `target_id`, `catalogId`, `task_id` - and this is one contract rather than four
 * because **the consumer already treats them as one type**: `notes.js` flattens the note and tag
 * producers' failures into a single list and reads `error.note_id || error.target_id` off the
 * result. Splitting the record would describe a distinction its only merging consumer does not make.
 */
export interface BrowserBulkActionFailure {
  /** Always constructed with a fallback, so never absent and never empty. */
  message: string;
  /** Set by the note, tag and task producers; the catalog producer omits it. */
  status?: number;
  /** The catalog producer's identity key. */
  catalogId?: string;
  /** The note producer's identity key. */
  note_id?: string;
  /** The tag producer's identity key. */
  target_id?: string;
  /** Set alongside `target_id` by the tag producer. */
  target_type?: string;
  /** The task producer's identity key. */
  task_id?: string;
}

/** What a bulk tag assignment did to each target, closed by the normaliser that throws otherwise. */
export type BrowserTagBulkAction = "add" | "remove" | "replace";

/**
 * What `POST /api/tags/bulk-assignments` resolves to.
 *
 * **Six members from one literal, and the failure half was already published.** `bulkAssign`
 * ends in a single `return`, so this is one exact contract; its `errors` reuse
 * `BrowserBulkActionFailure`, which `0.33.33.38.4.11` named after tracing this very route
 * alongside three others. That child typed the failures every bulk producer shares and left
 * each producer's own success payload to its owner - this is the tag producer's.
 *
 * The two counts are `results.length` and `errors.length`, so they are always finite
 * non-negative integers and never absent; the consumer's `Number(...) || 0` guarded a body it
 * had no other reason to distrust.
 *
 * `changed` stays `unknown[]`: its elements are what `applyBulkTagAction` answers per target,
 * a vocabulary belonging to the tag-assignment producer rather than to this envelope, and no
 * browser consumer reads into them.
 */
export interface BrowserTagBulkAssignmentResult {
  action: BrowserTagBulkAction;
  /** One entry per target that changed; the tag-assignment producer owns their shape. */
  changed: unknown[];
  /** `changed.length`, so always a finite count. */
  changed_count: number;
  errors: BrowserBulkActionFailure[];
  /** `errors.length`, so always a finite count. */
  skipped_count: number;
  /** The caller's own target vocabulary, trimmed and required non-empty by the service. */
  target_type: string;
}

export interface BrowserErrorContract {
  /**
   * The failures a *successful* bulk-action body reports.
   *
   * **Not `read`, and the difference is the point.** `read` interprets an error envelope from a
   * response that failed; this reads the `errors` array a bulk action carries when it succeeded
   * for some targets and not others. **Element validation, not container validation**: an entry
   * without a string `message` is not a failure this contract can describe, so it is dropped
   * rather than counted.
   */
  readBulkFailures(body: unknown): BrowserBulkActionFailure[];
  /**
   * Narrow a caught value to the message it carries, falling back when it carries none.
   *
   * **This is the narrowing contract for the caught-value boundary**, published by
   * `0.33.33.38.4.1`. A `catch` binding is `unknown` for a reason no declaration can remove:
   * anything can be thrown. The estate's 131 `error.message || "..."` sites were reading through
   * that boundary rather than across it.
   */
  caughtMessage(value: unknown, fallback: string): string;
  /**
   * Narrow a caught value to the HTTP status it carries, or `null` when it carries none.
   *
   * `null` rather than `0`: `createError` stores `0` for a producer that supplied no status, so
   * zero is a status a `BrowserApiError` can genuinely hold and absence needs its own value.
   */
  caughtStatus(value: unknown): number | null;
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
 * The five preview states the Files preview boundary answers.
 *
 * Four come from `previewAvailabilityForAttachment`, which reports `unavailable` for a file
 * that is not available or has not passed scanning, `download_only` for a supported-but-not-
 * previewable type, `too_large_for_preview` past the 512 KiB text cap, and `previewable`
 * otherwise. The fifth, `unauthorized`, is produced one level up by the shared access gate
 * when `files.download` is refused for the preview operation - the browser is told the file
 * cannot be previewed without being told anything more about it.
 */
export type BrowserFilePreviewState =
  | "download_only"
  | "previewable"
  | "too_large_for_preview"
  | "unauthorized"
  | "unavailable";

/** The four kinds `previewKindForAttachment` maps an extension to, and nothing else. */
export type BrowserFilePreviewKind = "image" | "markdown" | "text" | "unsupported";

/**
 * The kinds a **previewable** descriptor can carry.
 *
 * `unsupported` is missing because it cannot occur: the availability function answers
 * `download_only` for that kind before it can reach the `previewable` return.
 */
export type BrowserPreviewableFileKind = "image" | "markdown" | "text";

/**
 * The members `shapeAttachmentPreviewDescriptor` writes for every descriptor it builds.
 *
 * The paired camelCase and snake_case spellings are the producer's own compatibility pairs,
 * not a choice made here; it names both, so both are declared.
 */
export interface BrowserFilePreviewDescriptorCommon {
  extension: string;
  fileAttachmentId: string;
  file_attachment_id: string;
  fileId: string;
  file_id: string;
  fileName: string;
  file_name: string;
  fileSizeBytes: number;
  file_size_bytes: number;
  fileType: string;
  file_type: string;
  filename: string;
  mimeType: string;
  mime_type: string;
  moduleId: string;
  module_id: string;
  /** Why the file is not previewable; the empty string when it is. */
  reason: string;
  scanStatus: string;
  scan_status: string;
  status: string;
  targetId: string;
  target_id: string;
  targetType: string;
  target_type: string;
}

/**
 * A descriptor whose file may actually be previewed.
 *
 * The producer sets `contentAvailable` from `state === "previewable"` and adds the content
 * URL **only** under that flag, so the state, the flag and the URL's presence are one fact
 * written three times rather than three independent members. This variant says so, which is
 * why the browser may read `contentUrl` here without a further test.
 */
export interface BrowserPreviewableFileDescriptor extends BrowserFilePreviewDescriptorCommon {
  contentAvailable: true;
  content_available: true;
  /**
   * The preview content route for this attachment, and deliberately nothing else.
   *
   * `previewContentUrlForAttachment` builds `/api/files/attachments/:id/preview/content`
   * from the attachment id alone. It is never a storage key, a filesystem path or a signed
   * cloud-storage URL, so following it re-enters the same access gate rather than reaching
   * an object store directly.
   */
  contentUrl: string;
  content_url: string;
  kind: BrowserPreviewableFileKind;
  previewKind: BrowserPreviewableFileKind;
  preview_kind: BrowserPreviewableFileKind;
  previewState: "previewable";
  preview_state: "previewable";
  state: "previewable";
}

/**
 * A descriptor the browser must render as a state message rather than as content.
 *
 * The content URL is declared absent rather than optional: this producer does not write it
 * outside the previewable branch, and a body that carried one here did not come from it.
 */
export interface BrowserUnpreviewableFileDescriptor extends BrowserFilePreviewDescriptorCommon {
  contentAvailable: false;
  content_available: false;
  contentUrl?: undefined;
  content_url?: undefined;
  kind: BrowserFilePreviewKind;
  previewKind: BrowserFilePreviewKind;
  preview_kind: BrowserFilePreviewKind;
  previewState: Exclude<BrowserFilePreviewState, "previewable">;
  preview_state: Exclude<BrowserFilePreviewState, "previewable">;
  state: Exclude<BrowserFilePreviewState, "previewable">;
}

/** The descriptor `shapeDescriptor` returns, discriminated on the state it was built from. */
export type BrowserFilePreviewDescriptor =
  | BrowserPreviewableFileDescriptor
  | BrowserUnpreviewableFileDescriptor;

/**
 * `GET /api/files/attachments/:fileAttachmentId/preview`.
 *
 * The metadata half of the Files preview boundary: it answers whether and how a file may be
 * previewed, after the shared access gate has proved the attachment exists, is not removed,
 * resolves to a target the caller may read, and carries the `files.download` right. The route
 * wraps the descriptor by name, so this envelope is exact at one member.
 */
export interface BrowserFilePreviewDescriptorEnvelope {
  preview: BrowserFilePreviewDescriptor;
}

/** Text preview content, read from the file's own bytes and never interpreted as markup. */
export interface BrowserFilePreviewTextContent {
  encoding: "utf-8";
  kind: "text";
  text: string;
}

/**
 * Markdown preview content.
 *
 * `bodyHtml` is assigned to `innerHTML`, and it is safe to do that **because
 * `renderMarkdownToHtml` produced it**: that renderer parses with `html: false`, so raw
 * markup in the uploaded file is escaped rather than passed through; it strips
 * `javascript:`, `vbscript:` and `data:` link targets before parsing and validates every
 * surviving URL; and, because the Files preview passes no `allowImages`, it renders images
 * as escaped text rather than as `<img>`. The bytes are attacker-controlled - anyone who can
 * upload a `.md` file chooses them - so the browser must not treat this member as trusted
 * markup on the strength of its name. It is trusted because of the call that made it.
 */
export interface BrowserFilePreviewMarkdownContent {
  bodyFormat: "markdown";
  bodyHtml: string;
  bodyHtmlFormat: "html";
  bodyMarkdown: string;
  kind: "markdown";
}

/**
 * The two content records the JSON preview branch answers.
 *
 * Images are absent on purpose. The content route streams image bytes to the response with
 * its own headers, so the browser reaches them through `<img src>` and never through
 * `getJson`; a JSON body claiming `kind: "image"` is not something this producer sends.
 */
export type BrowserFilePreviewContent =
  | BrowserFilePreviewTextContent
  | BrowserFilePreviewMarkdownContent;

/**
 * `GET /api/files/attachments/:fileAttachmentId/preview/content`, in its JSON form.
 *
 * The delivery half of the boundary. It re-runs the same access gate rather than trusting the
 * descriptor the browser was handed, then additionally requires that the content is
 * available, that the backing file row exists, and that the stored object can be read.
 *
 * The embedded descriptor is the previewable variant because `assertContentAvailable` throws
 * for every other state, and its kind equals the content's kind because both are built from
 * the one availability record this request resolved.
 */
export interface BrowserFilePreviewContentEnvelope {
  content: BrowserFilePreviewContent;
  preview: BrowserPreviewableFileDescriptor;
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

/**
 * `LongtailForge.taskLifecycleLegality`, published by
 * `public/js/shared/task-lifecycle-legality.js`.
 *
 * Given a status, and a timer where one applies, which lifecycle transitions are legal.
 * Extracted by `0.33.33.37` from the three task surfaces, which had the same rule written eleven
 * times in two spellings. The primitives are deliberately small: Tasks, Workbench, and Task
 * Dialog compose them differently on purpose, and this module holds no permission rule, no
 * message copy, and no descriptor structure.
 */
export interface BrowserTaskLifecycleLegality {
  /** The statuses from which a task is still actionable. */
  activeStatuses(): BrowserTaskLifecycleStatus[];
  /** Whether a task in this status may still be completed. */
  canCompleteStatus(status: unknown): boolean;
  /** Whether a task has reached an end state. */
  isTerminalStatus(status: unknown): boolean;
  /** Whether a timer satisfies an action's declared timer visibility. */
  timerMatchesVisibility(timer: { timer_status?: string } | null | undefined, visibility: unknown): boolean;
}

/**
 * The browser-facing task lifecycle vocabulary.
 *
 * Declared separately from `TaskLifecycleStatus` in `task-block-recovery-contracts.d.ts`, whose
 * trailing `string` member collapses that union to `string`. Narrowing the server type belongs to
 * its own consumer; `0.33.33.37` did not reach into it.
 */
export type BrowserTaskLifecycleStatus = "open" | "in_progress" | "blocked" | "complete" | "archived";

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

/**
 * The `LongtailForge.view` factory, declared by `0.33.33.38.1`.
 *
 * **This is a declaration of what already exists, not a redesign.** The factory is written by
 * exactly two files and `0.33.33.38.1` changed neither: `public/js/shared/view-builder.js`
 * publishes 30 members and `public/js/shared/view-renderer.js` spreads the existing object and
 * adds 10. No member moved, no writer was added or removed, publication order is unchanged, and
 * nothing here alters a runtime value.
 *
 * **The renderer half is optional because the estate makes it optional.** Of the 18 page
 * templates that load `view-builder.js`, only 8 also load `view-renderer.js`; no page loads the
 * renderer without the builder. `window.LongtailForge` has one global type across all of them, so
 * a member present on 8 pages and absent on 10 is genuinely optional *at this declaration's
 * scope*. That is measured, not defensive: the primitives are required because they are present
 * wherever the factory exists at all.
 *
 * **Option members are `unknown` where the implementation coerces.** `createElement` reads
 * `options.text` through `String(...)` and `options.hidden` for truthiness, so `unknown` is the
 * accurate input type rather than a permissive one - the same reason `BrowserApi` returns
 * `Promise<unknown>`. Where the implementation requires a real type it is named.
 */
export interface BrowserViewFactory extends BrowserViewPrimitives, Partial<BrowserViewDescriptorRenderers> {}

/** Class names: a string, an array of them, or any falsy value; flattened and split on whitespace. */
export type BrowserViewClassNames = unknown;
/** Text content: coerced with `String(...)` unless it is null or undefined. */
export type BrowserViewTextValue = unknown;
/** Appended children: a node, a string, an array of either, or null/undefined. */
export type BrowserViewChildren = unknown;
/** A flag read for truthiness rather than for a boolean type. */
export type BrowserViewFlag = unknown;
/**
 * An attribute or dataset bag. `false`, `null`, and `undefined` are skipped, `true` becomes the
 * empty string, and every other value is coerced with `String(...)`.
 */
export type BrowserViewAttributeBag = Record<string, unknown>;
/** An action: an existing node is used as-is, anything else is passed to `createActionButton`. */
export type BrowserViewAction = Node | BrowserViewActionButtonOptions;
/** One action, an array of them, or nothing. `normalizeActions` accepts all three. */
export type BrowserViewActionInput = BrowserViewAction | readonly BrowserViewAction[] | null | undefined;

/**
 * An element the factory returns with a frozen, non-enumerable `viewParts` record attached.
 *
 * `assignViewParts` uses `Object.defineProperty`, so the parts hang off `viewParts` rather than
 * off the element itself - `field.viewParts.control`, which is how every consumer already reads
 * them. Before this declaration none of that was visible to the compiler.
 */
export type BrowserViewElementWithParts<Parts> = HTMLElement & { readonly viewParts: Parts };

export interface BrowserViewFieldMessageOptions {
  invalid?: BrowserViewFlag;
  tone?: BrowserViewTextValue;
}

/**
 * What `createFieldControl` builds. A select for select and multi-select, a textarea for
 * textarea, and an input for everything else including the radio group members - so `.value`
 * is available on all of them, which a flat `HTMLElement` would have hidden.
 */
export type BrowserViewFieldControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export interface BrowserViewFieldParts {
  /**
   * The first control. Null only on the radio path, where a field descriptor carrying no
   * options renders a legend and no inputs.
   */
  control: BrowserViewFieldControl | null;
  /** Every control the field rendered; a radio group has more than one. */
  controls: BrowserViewFieldControl[];
  /** A `legend` for a radio group and a `span` otherwise; always built. */
  label: HTMLElement;
  message: HTMLElement;
  setMessage(value: unknown, options?: BrowserViewFieldMessageOptions): void;
}

export interface BrowserViewFieldGridParts {
  collectValues(options?: BrowserViewCollectFieldValuesOptions): Record<string, unknown>;
  controls: BrowserViewFieldControl[];
  fields: BrowserViewFieldElement[];
}

export interface BrowserViewBulkActionToolbarParts {
  body: HTMLElement;
  count: HTMLElement;
  label: HTMLElement;
  summary: HTMLElement;
}

export interface BrowserViewListShellParts {
  status: HTMLElement;
}

export interface BrowserViewModalParts {
  body: HTMLElement;
  footer: HTMLElement;
  title: HTMLElement;
}

export interface BrowserViewModalFormParts extends BrowserViewModalParts {
  form: HTMLFormElement;
}

export interface BrowserViewLinkedContextListParts<Item = unknown> {
  empty: HTMLElement;
  setLinkedItems(items?: readonly Item[]): void;
}

/** Every part below is built unconditionally, so none of them is nullable. */
export interface BrowserViewLinkedContextPickerParts {
  clientContextSelect: HTMLSelectElement;
  controls: BrowserViewFieldGridElement;
  empty: HTMLElement;
  recordSelect: HTMLSelectElement;
  rows: HTMLElement;
  searchInput: HTMLInputElement;
  setClientContexts(contexts?: readonly unknown[]): void;
  setLinkedItems(items?: readonly unknown[]): void;
  setReadonly(value?: unknown): void;
  setRecords(records?: readonly unknown[]): void;
  setTargets(targets?: readonly unknown[]): void;
  targetSelect: HTMLSelectElement;
  useTargetButton: HTMLButtonElement;
}

export type BrowserViewFieldElement = BrowserViewElementWithParts<BrowserViewFieldParts>;
export type BrowserViewFieldGridElement = BrowserViewElementWithParts<BrowserViewFieldGridParts>;
export type BrowserViewBulkActionToolbarElement = BrowserViewElementWithParts<BrowserViewBulkActionToolbarParts>;
export type BrowserViewListShellElement = BrowserViewElementWithParts<BrowserViewListShellParts>;
/** `createModal` builds a `<dialog>`, so consumers legitimately call `.close()` on it. */
export type BrowserViewModalElement = HTMLDialogElement & { readonly viewParts: BrowserViewModalParts };
export type BrowserViewModalFormElement = HTMLDialogElement & { readonly viewParts: BrowserViewModalFormParts };
export type BrowserViewLinkedContextListElement<Item = unknown> = BrowserViewElementWithParts<BrowserViewLinkedContextListParts<Item>>;
export type BrowserViewLinkedContextPickerElement = BrowserViewElementWithParts<BrowserViewLinkedContextPickerParts>;

/**
 * A rendered descriptor surface. `renderSurface` attaches `openModal` and `viewState` with
 * `Object.defineProperty`, so both are non-enumerable properties of the returned element.
 */
export type BrowserViewSurfaceElement = HTMLElement & {
  readonly openModal: (modalId: unknown, record?: unknown) => unknown;
  /** Re-runs the descriptor's data source and repaints the surface. */
  readonly refresh: () => Promise<unknown>;
  readonly viewState: Record<string, unknown>;
};

export interface BrowserViewElementOptions {
  attrs?: BrowserViewAttributeBag;
  children?: BrowserViewChildren;
  className?: BrowserViewClassNames;
  dataset?: BrowserViewAttributeBag;
  hidden?: BrowserViewFlag;
  /** Assigned straight to `element.id`, so this one is a real string. */
  id?: string;
  text?: BrowserViewTextValue;
}

export interface BrowserViewFieldOptions extends BrowserViewFieldMessageOptions {
  className?: BrowserViewClassNames;
  controlAttrs?: BrowserViewAttributeBag;
  controlClassName?: BrowserViewClassNames;
  controlDataset?: BrowserViewAttributeBag;
  controlId?: BrowserViewTextValue;
  dataset?: BrowserViewAttributeBag;
  disabled?: BrowserViewFlag;
  message?: BrowserViewTextValue;
  messageClassName?: BrowserViewClassNames;
  messageTone?: BrowserViewTextValue;
  value?: unknown;
}

export interface BrowserViewCollectFieldValuesOptions {
  includeDisabled?: BrowserViewFlag;
}

export interface BrowserViewPageHeaderOptions {
  actions?: BrowserViewActionInput;
  ariaLabel?: BrowserViewTextValue;
  className?: BrowserViewClassNames;
  headingLevel?: BrowserViewTextValue;
  subtitle?: BrowserViewTextValue;
  title?: BrowserViewTextValue;
}

export interface BrowserViewStatusMessageOptions {
  className?: BrowserViewClassNames;
  hidden?: BrowserViewFlag;
  live?: BrowserViewTextValue;
  message?: BrowserViewTextValue;
  role?: BrowserViewTextValue;
  tagName?: string;
  tone?: BrowserViewTextValue;
}

export interface BrowserViewEmptyStateOptions {
  actions?: BrowserViewActionInput;
  className?: BrowserViewClassNames;
  headingLevel?: BrowserViewTextValue;
  live?: BrowserViewTextValue;
  message?: BrowserViewTextValue;
  role?: BrowserViewTextValue;
  title?: BrowserViewTextValue;
}

export interface BrowserViewFilterPanelOptions {
  actions?: BrowserViewActionInput;
  ariaLabel?: BrowserViewTextValue;
  className?: BrowserViewClassNames;
  fields?: BrowserViewChildren;
  open?: BrowserViewFlag;
  title?: BrowserViewTextValue;
}

export interface BrowserViewBulkActionToolbarOptions {
  ariaLabel?: BrowserViewTextValue;
  attrs?: BrowserViewAttributeBag;
  body?: BrowserViewChildren;
  bodyClassName?: BrowserViewClassNames;
  className?: BrowserViewClassNames;
  dataset?: BrowserViewAttributeBag;
  label?: BrowserViewTextValue;
  open?: BrowserViewFlag;
  selectedCount?: number;
}

export interface BrowserViewListShellOptions {
  after?: BrowserViewChildren;
  ariaLabel?: BrowserViewTextValue;
  attrs?: BrowserViewAttributeBag;
  before?: BrowserViewChildren;
  children?: BrowserViewChildren;
  className?: BrowserViewClassNames;
  dataset?: BrowserViewAttributeBag;
  status?: BrowserViewFlag;
  statusAttrs?: BrowserViewAttributeBag;
  statusClassName?: BrowserViewClassNames;
  statusDataset?: BrowserViewAttributeBag;
  statusHidden?: BrowserViewFlag;
  statusLive?: BrowserViewTextValue;
  statusMessage?: BrowserViewTextValue;
  statusRole?: BrowserViewTextValue;
  statusTagName?: string;
  tagName?: string;
  toolbar?: BrowserViewChildren;
}

export interface BrowserViewCollapsibleIndexPanelOptions {
  ariaLabel?: BrowserViewTextValue;
  body?: BrowserViewChildren;
  children?: BrowserViewChildren;
  className?: BrowserViewClassNames;
  footer?: BrowserViewChildren;
  footerClassName?: BrowserViewClassNames;
  open?: BrowserViewFlag;
  summaryActions?: BrowserViewActionInput;
  title?: BrowserViewTextValue;
}

export interface BrowserViewIndexListOptions {
  ariaLabel?: BrowserViewTextValue;
  className?: BrowserViewClassNames;
  items?: readonly unknown[];
}

export interface BrowserViewSplitListDetailOptions {
  className?: BrowserViewClassNames;
  detail?: BrowserViewChildren;
  detailLabel?: BrowserViewTextValue;
  list?: BrowserViewChildren;
  listLabel?: BrowserViewTextValue;
}

export interface BrowserViewDataTableOptions {
  caption?: BrowserViewTextValue;
  className?: BrowserViewClassNames;
  columns?: readonly unknown[];
  emptyMessage?: BrowserViewTextValue;
  hierarchy?: unknown;
  rows?: readonly unknown[];
  secondaryRows?: readonly unknown[];
  tableClassName?: BrowserViewClassNames;
}

export interface BrowserViewDetailBadgeRowOptions {
  ariaLabel?: BrowserViewTextValue;
  attrs?: BrowserViewAttributeBag;
  badges?: readonly unknown[];
  className?: BrowserViewClassNames;
  dataset?: BrowserViewAttributeBag;
  items?: readonly unknown[];
}

export interface BrowserViewDetailHeaderOptions {
  badges?: readonly unknown[];
  className?: BrowserViewClassNames;
  headingLevel?: BrowserViewTextValue;
  meta?: BrowserViewChildren;
  title?: BrowserViewTextValue;
}

export interface BrowserViewDetailActionStripOptions {
  actions?: BrowserViewActionInput;
  ariaLabel?: BrowserViewTextValue;
  className?: BrowserViewClassNames;
}

export interface BrowserViewDetailActionMenuOptions extends BrowserViewDetailActionStripOptions {
  floating?: BrowserViewFlag;
  summaryLabel?: BrowserViewTextValue;
  title?: BrowserViewTextValue;
}

export interface BrowserViewInfoPanelOptions {
  actions?: BrowserViewActionInput;
  ariaLabel?: BrowserViewTextValue;
  className?: BrowserViewClassNames;
  collapsible?: BrowserViewFlag;
  headingLevel?: BrowserViewTextValue;
  items?: readonly unknown[];
  message?: BrowserViewTextValue;
  open?: BrowserViewFlag;
  title?: BrowserViewTextValue;
}

export interface BrowserViewModalOptions {
  actions?: BrowserViewActionInput;
  body?: BrowserViewChildren;
  className?: BrowserViewClassNames;
  footer?: BrowserViewChildren;
  headingLevel?: BrowserViewTextValue;
  size?: BrowserViewTextValue;
  title?: BrowserViewTextValue;
  titleId?: BrowserViewTextValue;
}

export interface BrowserViewModalFormOptions extends BrowserViewModalOptions {
  fields?: BrowserViewChildren;
  formClassName?: BrowserViewClassNames;
  method?: BrowserViewTextValue;
  utilityActions?: BrowserViewActionInput;
}

export interface BrowserViewFieldGridOptions {
  children?: BrowserViewChildren;
  className?: BrowserViewClassNames;
  dataset?: BrowserViewAttributeBag;
  editable?: BrowserViewFlag;
  fields?: readonly unknown[];
  surface?: BrowserViewTextValue;
}

export interface BrowserViewInlineActionRowOptions {
  actions?: BrowserViewActionInput;
  ariaLabel?: BrowserViewTextValue;
  children?: BrowserViewChildren;
  className?: BrowserViewClassNames;
}

/**
 * The item type is the caller's own: the factory hands each entry of `items` straight back
 * to `onRemove` and `setLinkedItems`, so a consumer that supplies typed rows gets them back
 * typed rather than as `unknown`.
 */
export interface BrowserViewLinkedContextListOptions<Item = unknown> {
  ariaLabel?: BrowserViewTextValue;
  className?: BrowserViewClassNames;
  disabled?: BrowserViewFlag;
  emptyMessage?: BrowserViewTextValue;
  items?: readonly Item[];
  linkedItems?: readonly Item[];
  onRemove?: (item: Item, event?: unknown) => unknown;
  permissionDisabled?: BrowserViewFlag;
  readonly?: BrowserViewFlag;
  records?: readonly unknown[];
  removeAction?: unknown;
  removeLabel?: BrowserViewTextValue;
  rows?: readonly unknown[];
  rowsLabel?: BrowserViewTextValue;
}

export interface BrowserViewLinkedContextPickerOptions<Item = unknown>
  extends BrowserViewLinkedContextListOptions<Item> {
  clientContextLabel?: BrowserViewTextValue;
  clientContextName?: BrowserViewTextValue;
  clientContextOptions?: readonly unknown[];
  clientContexts?: readonly unknown[];
  noRecordsLabel?: BrowserViewTextValue;
  onClientContextChange?: (value: unknown, event?: unknown) => unknown;
  onRecordChange?: (value: unknown, event?: unknown) => unknown;
  onSearchInput?: (value: unknown, event?: unknown) => unknown;
  onTargetChange?: (value: unknown, event?: unknown) => unknown;
  onUseTarget?: (value: unknown, event?: unknown) => unknown;
  permissionMessage?: BrowserViewTextValue;
  providers?: readonly unknown[];
  readonlyMessage?: BrowserViewTextValue;
  recordLabel?: BrowserViewTextValue;
  recordName?: BrowserViewTextValue;
  recordOptions?: readonly unknown[];
  searchLabel?: BrowserViewTextValue;
  searchName?: BrowserViewTextValue;
  searchPlaceholder?: BrowserViewTextValue;
  showClientContext?: BrowserViewFlag;
  targetLabel?: BrowserViewTextValue;
  targetName?: BrowserViewTextValue;
  targets?: readonly unknown[];
  useTargetAction?: unknown;
  useTargetDisabled?: BrowserViewFlag;
  useTargetLabel?: BrowserViewTextValue;
}

export interface BrowserViewActionButtonOptions {
  action?: unknown;
  actionRole?: BrowserViewTextValue;
  ariaLabel?: BrowserViewTextValue;
  className?: BrowserViewClassNames;
  disabled?: BrowserViewFlag;
  icon?: unknown;
  iconOnly?: BrowserViewFlag;
  label?: BrowserViewTextValue;
  onClick?: (event: Event) => unknown;
  role?: BrowserViewTextValue;
  text?: BrowserViewTextValue;
  title?: BrowserViewTextValue;
  type?: BrowserViewTextValue;
  variant?: BrowserViewTextValue;
}

/**
 * The 30 members `public/js/shared/view-builder.js` publishes.
 *
 * These are required rather than optional: every page template that loads any part of the
 * factory loads the builder, and the renderer refuses to run without it.
 */
export interface BrowserViewPrimitives {
  /** Close every dialog opened from this one, deepest first. Delegates to `viewModalStack`. */
  closeChildModals(parent: unknown, value?: string): void;
  /** Close a dialog and everything it opened. Delegates to `viewModalStack`. */
  closeModal(dialog: unknown, value?: string): void;
  /** Read the current values out of every bound control inside a scope. */
  collectFieldValues(scope: unknown, options?: BrowserViewCollectFieldValuesOptions): Record<string, unknown>;
  /**
   * Always a `button`: the icon path delegates to `icons.createIconButton` and the plain path
   * builds one directly, and the shared tail assigns `button.type` to whichever came back.
   */
  createActionButton(options?: BrowserViewActionButtonOptions): HTMLButtonElement;
  createBulkActionToolbar(options?: BrowserViewBulkActionToolbarOptions): BrowserViewBulkActionToolbarElement;
  createCollapsibleIndexPanel(options?: BrowserViewCollapsibleIndexPanelOptions): HTMLElement;
  createDataTable(options?: BrowserViewDataTableOptions): HTMLElement;
  createDetailActionMenu(options?: BrowserViewDetailActionMenuOptions): HTMLElement;
  createDetailActionStrip(options?: BrowserViewDetailActionStripOptions): HTMLElement;
  createDetailBadgeRow(options?: BrowserViewDetailBadgeRowOptions): HTMLElement;
  createDetailHeader(options?: BrowserViewDetailHeaderOptions): HTMLElement;
  /**
   * The element factory. Overloaded exactly as `document.createElement` is, because the body
   * is `document.createElement(tagName)` - a known tag name really does produce its own
   * subtype, and declaring a flat `HTMLElement` would have been weaker than the runtime.
   */
  createElement<TagName extends keyof HTMLElementTagNameMap>(
    tagName: TagName,
    options?: BrowserViewElementOptions,
  ): HTMLElementTagNameMap[TagName];
  createElement(tagName: string, options?: BrowserViewElementOptions): HTMLElement;
  createEmptyState(options?: BrowserViewEmptyStateOptions): HTMLElement;
  /** A labelled control with its own message channel, reachable through `viewParts`. */
  createField(field?: unknown, options?: BrowserViewFieldOptions): BrowserViewFieldElement;
  createFieldGrid(options?: BrowserViewFieldGridOptions): BrowserViewFieldGridElement;
  createFilterPanel(options?: BrowserViewFilterPanelOptions): HTMLElement;
  createIndexList(options?: BrowserViewIndexListOptions): HTMLElement;
  createInfoPanel(options?: BrowserViewInfoPanelOptions): HTMLElement;
  createInlineActionRow(options?: BrowserViewInlineActionRowOptions): HTMLElement;
  createLinkedContextList<Item = unknown>(
    options?: BrowserViewLinkedContextListOptions<Item>,
  ): BrowserViewLinkedContextListElement<Item>;
  createLinkedContextPicker<Item = unknown>(
    options?: BrowserViewLinkedContextPickerOptions<Item>,
  ): BrowserViewLinkedContextPickerElement;
  createListShell(options?: BrowserViewListShellOptions): BrowserViewListShellElement;
  createModal(options?: BrowserViewModalOptions): BrowserViewModalElement;
  createModalForm(options?: BrowserViewModalFormOptions): BrowserViewModalFormElement;
  createPageHeader(options?: BrowserViewPageHeaderOptions): HTMLElement;
  createSplitListDetail(options?: BrowserViewSplitListDetailOptions): HTMLElement;
  createStatusMessage(options?: BrowserViewStatusMessageOptions): HTMLElement;
  /** Whether this dialog is currently the top of the stack. Delegates to `viewModalStack`. */
  isTopModal(dialog: unknown): boolean;
  /** Delegates to `viewSurfaceDescriptor.normalize`. */
  normalizeSurfaceDescriptor(descriptor: unknown): BrowserViewSurfaceDescriptor;
  /** Open a dialog on top of the stack. Delegates to `viewModalStack`. */
  showModal(dialog: unknown, options?: BrowserModalStackOptions): unknown;
}

export interface BrowserViewSlideOutSidebarElements {
  backdrop?: unknown;
  closeButton?: unknown;
  drawer?: unknown;
  trigger?: unknown;
}

export interface BrowserViewSlideOutSidebarOptions {
  open?: BrowserViewFlag;
  state?: Record<string, unknown>;
}

export interface BrowserViewSlideOutSidebarSyncOptions {
  focus?: BrowserViewFlag;
}

export interface BrowserViewSlideOutSidebarController {
  close(options?: BrowserViewSlideOutSidebarSyncOptions): void;
  readonly isOpen: boolean;
  open(options?: BrowserViewSlideOutSidebarSyncOptions): void;
  sync(options?: BrowserViewSlideOutSidebarSyncOptions): void;
  toggle(options?: BrowserViewSlideOutSidebarSyncOptions): void;
}

export interface BrowserViewDescriptorFieldGridOptions extends BrowserViewFieldGridOptions {
  fieldOptions?: BrowserViewFieldOptions;
  values?: Record<string, unknown>;
}

export interface BrowserViewDescriptorLinkedRecordsOptions {
  ariaLabel?: BrowserViewTextValue;
  className?: BrowserViewClassNames;
  collapsible?: BrowserViewFlag;
  emptyClassName?: BrowserViewClassNames;
  formActions?: BrowserViewActionInput;
  formClassName?: BrowserViewClassNames;
  formDataset?: BrowserViewAttributeBag;
  formFields?: BrowserViewChildren;
  hidden?: BrowserViewFlag;
  locked?: BrowserViewFlag;
  open?: BrowserViewFlag;
  recordNodes?: BrowserViewChildren;
  recordsClassName?: BrowserViewClassNames;
  title?: BrowserViewTextValue;
}

/**
 * The 10 members `public/js/shared/view-renderer.js` adds to the same object.
 *
 * Optional on the factory because only 8 of the 18 builder pages load the renderer. A controller
 * that knows its own page loads it narrows before use, the way `0.33.33.37` established.
 */
export interface BrowserViewDescriptorRenderers {
  createSlideOutSidebarController(
    elements?: BrowserViewSlideOutSidebarElements,
    options?: BrowserViewSlideOutSidebarOptions,
  ): BrowserViewSlideOutSidebarController;
  /** Register a named behaviour; the returned function unregisters it. */
  registerBehavior(id: unknown, handler: unknown): () => void;
  renderDescriptorActionMenu(
    actions?: readonly unknown[],
    options?: BrowserViewDetailActionMenuOptions,
  ): HTMLElement;
  renderDescriptorActionStrip(
    actions?: readonly unknown[],
    options?: BrowserViewDetailActionStripOptions,
  ): HTMLElement;
  renderDescriptorDataTable(
    tableDescriptor?: unknown,
    options?: BrowserViewDataTableOptions,
  ): HTMLElement;
  renderDescriptorFieldGrid(
    fieldDescriptor?: unknown,
    options?: BrowserViewDescriptorFieldGridOptions,
  ): BrowserViewFieldGridElement;
  renderDescriptorInlineActions(
    actions?: readonly unknown[],
    options?: BrowserViewInlineActionRowOptions,
  ): HTMLElement;
  renderDescriptorLinkedRecordsPanel(
    linkedRecords?: unknown,
    options?: BrowserViewDescriptorLinkedRecordsOptions,
  ): HTMLElement;
  renderDescriptorModalForm(
    modal?: unknown,
    options?: BrowserViewModalFormOptions,
  ): BrowserViewModalFormElement;
  /** Render a delivered descriptor into a host and return the mounted surface. */
  renderSurface(deliveredDescriptor: unknown, host: unknown): BrowserViewSurfaceElement;
}

/**
 * Whether a module is on for this workspace, as `workspaceModuleStatus` answers it.
 *
 * Two functions close this together: the status map coerces every stored row to `enabled` or
 * `disabled`, and the resolver returns `enabled` for a module that cannot be disabled and the
 * mapped value or `disabled` otherwise. Neither can answer a third word.
 *
 * `BrowserWorkbenchModuleStatus` carries the same two words for the same reason - the Workbench
 * bootstrap builds its map from this same module context. The two are **proved consistent**
 * rather than merged, because unifying them belongs to whoever owns both surfaces.
 */
export type BrowserWorkspaceModuleStatus = "disabled" | "enabled";

/**
 * One module as the shared settings body carries it.
 *
 * **A deliberate stable minimum over a much richer producer record, not a description of it.**
 * `loadWorkspaceModuleContext` reconstructs each module from its registry manifest with more
 * than twenty members, most of them contribution-owned collections - navigation, view surfaces,
 * settings, permissions, resource definitions, API scopes, event types and more. Those are the
 * extensibility carrier: they are *meant* to grow as modules are added and as the registry
 * gains contribution kinds.
 *
 * An exact browser declaration would turn every such internal expansion into a browser contract
 * change even where no browser consumer depends on the new member. So this contract promises
 * only the stable framework-owned projection this boundary relies on - the module's identity and
 * whether it is on - and the reader accepts records that carry anything else beside them.
 *
 * `id` is validated as non-empty text because the manifest contract requires it as a
 * pattern-matched string before the catalog is ever exposed, not because an empty one would be
 * inconvenient.
 */
export interface BrowserWorkspaceSettingsModule {
  /** Required and pattern-checked by the manifest contract, so never empty. */
  id: string;
  status: BrowserWorkspaceModuleStatus;
}

/**
 * The shared workspace settings body, as `readInternal` answers it.
 *
 * **A structural minimum, because `decorateWorkspaceSettings` spreads the persisted settings**
 * before naming its own five members. Anything a workspace has persisted rides along, so the
 * browser cannot claim the body is closed - and `modules` is one of the members named *after*
 * that spread, which is what makes it claimable.
 *
 * Nothing else is promised here. `moduleSettings` is registry-owned and stays with its own
 * boundary; `enabledModules` is read only through the pages' own normalisers, which already
 * check it. Adding either because it happens to be present would freeze vocabulary this
 * boundary has not earned.
 */
export interface BrowserWorkspaceSettings {
  modules: BrowserWorkspaceSettingsModule[];
}

/**
 * What `PUT /api/settings` resolves to.
 *
 * **One member, and its value is the GET body.** `save` ends in
 * `return { data: await readInternal(session) }` - the same function `GET /api/settings` answers
 * directly - so there is one settings contract wrapped in a one-member envelope rather than two
 * body contracts that would be free to drift apart.
 */
export interface BrowserWorkspaceSettingsSaveResult {
  data: BrowserWorkspaceSettings;
}

/**
 * `LongtailForge.settingsHost`, published by `public/js/shared/settings-host.js`.
 *
 * Mounts the settings host a page declares through `data-settings-host`, and reads the
 * attachment sections a delivered catalog carries. The module **self-mounts at load** when the
 * page has a host element, so both members are also reachable for the placements that mount
 * themselves.
 */
export interface BrowserSettingsHost {
  /**
   * The attachment sections a catalog carries for a placement.
   *
   * The catalog is the body of `GET /api/settings/catalog` and is read defensively - a missing
   * `attachments`, a missing placement, and a non-array entry all yield an empty array - so it
   * stays `unknown` here. Validating what the returned entries contain is `0.33.33.38.4`'s
   * work, not this contract's.
   */
  attachmentSections(catalog: unknown, placement: string, moduleId?: string): unknown[];
  /**
   * Mount the host, returning the element it was given. Mounting is idempotent through
   * `data-settings-host-mounted`, and an unrecognised placement throws.
   */
  mount<Element extends HTMLElement | null | undefined>(hostElement: Element): Element;
  /**
   * The shared workspace settings body, or `null` when it cannot be vouched for.
   *
   * Lives here because three pages read this one producer and the host is already a declared
   * surface all three acquire before use - so sharing the reader costs no new root member.
   *
   * The returned value carries the producer's other persisted settings through untouched; only
   * `modules` is promised, and only it is checked.
   */
  readWorkspaceSettings(body: unknown): BrowserWorkspaceSettings | null;
  /** The save envelope, or `null` when its settings body cannot be vouched for. */
  readWorkspaceSettingsSaveResult(body: unknown): BrowserWorkspaceSettingsSaveResult | null;
}

/**
 * `LongtailForge.settingsPageController`, published by
 * `public/js/shared/settings-page-controller.js`.
 */
export interface BrowserSettingsPageController {
  /**
   * Wire a settings page's dirty-state tracking, save and revert buttons, and unsaved-changes
   * navigation guard. Throws when neither `root` nor a `[data-settings-host]` element resolves.
   */
  create(options?: BrowserSettingsPageControllerOptions): BrowserSettingsPageControllerHandle;
}

export interface BrowserSettingsPageControllerOptions {
  /**
   * Falls back to the page's `[data-settings-host]` element. `Element` rather than
   * `HTMLElement` because the controller only ever queries it and listens on it.
   */
  root?: Element | null;
  onDirtyChange?: (dirty: boolean) => unknown;
  onRevert?: () => unknown;
  /** Returning `false` leaves the page dirty; anything else marks it clean. */
  onSave?: () => unknown;
}

/**
 * What `create` returns. All three members are published, and the contract describes the
 * surface rather than the subset consumers currently call - only `setClean` is used externally
 * today.
 */
export interface BrowserSettingsPageControllerHandle {
  isDirty(): boolean;
  setClean(): void;
  updateDirtyState(): void;
}

/**
 * Options `LongtailForge.status.set` reads. Nothing else in the bag is consulted.
 */
export interface BrowserStatusMessageOptions {
  /**
   * Milliseconds after which the message clears itself. Ignored when the message is empty, and
   * the pending timer is cancelled by the next `set` or `clear` on the same element.
   */
  clearAfter?: number;
  /** An older spelling of `type: "error"`; the writer honours both. */
  isError?: boolean;
  /**
   * `"error"` and `"success"` add their tone class. **Any other value renders neutral rather
   * than being rejected** - `role-assignments.js` passes `""` deliberately for exactly that - so
   * this is open vocabulary with two recognised members, not a closed union.
   */
  type?: string;
}

/**
 * `LongtailForge.status`, published by `public/js/shared/status.js`.
 *
 * Writes and clears the message on a status element, with an optional self-clearing timer held
 * in a `WeakMap` keyed by that element. **The runtime property is named `status`, but the
 * responsibility is a status *message* on the DOM** - it is unrelated to task lifecycle status,
 * HTTP status, or any page's own status state, and the contract is named for what it does.
 *
 * Published as a plain object rather than a frozen one, which the declaration describes but
 * does not change.
 */
export interface BrowserStatusMessage {
  /** Empty the element, hide it, drop both tone classes, and cancel any pending timer. */
  clear(element: HTMLElement | null | undefined): void;
  /**
   * Show a message. An absent element is a no-op rather than an error, and an empty message
   * hides the element.
   */
  set(
    element: HTMLElement | null | undefined,
    message?: string,
    options?: BrowserStatusMessageOptions,
  ): void;
}

export interface BrowserModalAlertOptions {
  /** Defaults to `"OK"`. */
  confirmLabel?: string;
  /** Defaults to the empty string. */
  message?: string;
  /** Defaults to `"Notice"`. */
  title?: string;
}

export interface BrowserModalConfirmOptions {
  /** Defaults to `"Cancel"`. */
  cancelLabel?: string;
  /** Defaults to `"Continue"`. */
  confirmLabel?: string;
  /** Styles the confirm button as destructive. Defaults to `false`. */
  danger?: boolean;
  /** Defaults to `"Continue?"`. */
  message?: string;
  /** Defaults to `"Confirm action"`. */
  title?: string;
}

/**
 * `LongtailForge.modal`, published by `public/js/shared/modal.js`.
 *
 * The application's alert and confirmation dialogs: each call builds its own `<dialog>`, shows
 * it modally, restores focus to whatever was active, and removes the element on close.
 *
 * **This is not `viewModalStack` and not `view.createModal`.** Those manage the lifecycle of
 * dialogs a page already owns and construct dialog elements respectively; this one answers a
 * question and disposes of everything it made.
 *
 * **Both methods resolve `boolean` and neither ever rejects.** The writer resolves exactly once,
 * from a `close` listener registered `{ once: true }`, with a value that starts at `false` and
 * is only ever set from an action's `value` - `true` for a confirm or an acknowledgement,
 * `false` for cancel, for the `cancel` event, and for Escape. There is no `reject` anywhere in
 * the file, and no path resolves `undefined` or `null`.
 *
 * Published as a plain object rather than a frozen one, which the declaration describes but
 * does not change.
 */
export interface BrowserModalDialogs {
  /**
   * Acknowledge a message. **Resolves `true` when the button is used and `false` when the
   * dialog is dismissed** - declared because the writer returns it, even though no caller
   * currently reads it.
   */
  alert(options?: BrowserModalAlertOptions): Promise<boolean>;
  /** Resolves `true` for confirm, `false` for cancel, the `cancel` event, or Escape. */
  confirm(options?: BrowserModalConfirmOptions): Promise<boolean>;
}

export interface BrowserIconOptions {
  /**
   * When `false` the icon is labelled instead of hidden, and `label` becomes required - the
   * writer throws without one. Defaults to `true`.
   */
  decorative?: boolean;
  /** The `aria-label` for a non-decorative icon. */
  label?: string;
  /** Width and height in pixels. Defaults to `20`. */
  size?: number;
  /** Defaults to `2`. */
  strokeWidth?: number;
}

export interface BrowserIconButtonOptions {
  /** A name from `names`. Passed straight to `createIcon`, which throws on an unknown one. */
  icon?: string;
  /** Defaults to `true` unless `text` is supplied. */
  iconOnly?: boolean;
  /** The accessible label. Either this or `text` is required; the writer throws without both. */
  label?: string;
  /** `"after"` puts the text before the icon. Anything else puts the icon first. */
  position?: string;
  /** Passed through to the icon. */
  size?: number;
  /** Visible button text. */
  text?: string;
  /** Defaults to `label` when the button is icon-only. */
  title?: string;
  /** `"danger"`, `"secondary"`, and `"link"` each add a class; anything else adds none. */
  variant?: string;
}

export interface BrowserIconCreateButtonOptions extends BrowserIconButtonOptions {
  /** Assigned to `button.type`. Defaults to `"button"`. */
  type?: string;
}

/**
 * `LongtailForge.icons`, published by `public/js/shared/icons.js`.
 *
 * The SVG icon registry and the button decorations built from it.
 *
 * **Every one of the 54 reads in the estate is guarded**, and that is the contract as much as
 * the signatures are: 53 fall back to a plain button or plain text when the surface is absent,
 * and the one that cannot - `task-dialog.js`'s checklist actions - throws its own error. The
 * declaration describes the shape; it does not make the surface required.
 *
 * **Nothing here is asynchronous and nothing returns `null`.** Each member either returns the
 * element it built or throws: `createIcon` on an unknown name and on a non-decorative icon with
 * no label, `createIconButton` with neither a label nor text, `decorateButton` on anything that
 * is not a `button` element.
 *
 * Published as a plain object rather than a frozen one; only `names` is frozen.
 */
export interface BrowserIcons {
  /**
   * Build one registry icon as an `<svg>`. **Throws** on a name the registry does not hold, so
   * `name` is `string` rather than a union of `names`: callers compute it, and the runtime -
   * not the type - is what rejects an unknown one.
   */
  createIcon(name: string, options?: BrowserIconOptions): SVGSVGElement;
  /** Build a new `button` around an icon. **Throws** without a label or visible text. */
  createIconButton(options?: BrowserIconCreateButtonOptions): HTMLButtonElement;
  /**
   * Rebuild an existing button's content around an icon and return **the same element**. The
   * parameter is `HTMLButtonElement` because the writer demands one and throws otherwise; the
   * runtime guard exists for callers that cannot prove it, not to widen the contract.
   */
  decorateButton(button: HTMLButtonElement, options?: BrowserIconButtonOptions): HTMLButtonElement;
  /** Every registry name, frozen at publication. */
  readonly names: readonly string[];
}

export interface BrowserCapturePromptOptions {
  /** The cancel button's label. Defaults to `"Cancel"`. */
  cancelLabel?: string;
  /** Appended to the dialog's own class list. */
  className?: string;
  /** The submit button's label. Defaults to `"Continue"`. */
  confirmLabel?: string;
  /** The field label. Defaults to `"Details"`. */
  label?: string;
  /** `false` renders a single-line `input`; anything else renders a `textarea`. */
  multiline?: boolean;
  /** Forwarded verbatim to `view.showModal`, which owns the modal stack. */
  parent?: unknown;
  /** The dialog title. Defaults to `"Add context"`. */
  prompt?: string;
  /** Rows for the multiline form. Defaults to `3`; ignored when `multiline` is `false`. */
  rows?: number;
  /** Forwarded verbatim to `view.showModal`. Defaults to `document.activeElement`. */
  trigger?: unknown;
  /** The initial field value. Defaults to the empty string. */
  value?: string;
}

/**
 * What `open` resolves with. **The writer constructs this object on every path**, so both
 * members are always present.
 */
export interface BrowserCapturePromptResult {
  /** `true` only when the form was submitted with a non-empty value. */
  confirmed: boolean;
  /**
   * The trimmed entry when `confirmed`, and the empty string otherwise. **Submitting an empty
   * field does not resolve at all** - the writer reports validity and leaves the dialog open -
   * so a confirmed result is never empty, which the type cannot say and this comment can.
   */
  value: string;
}

/**
 * `LongtailForge.capturePrompt`, published by `public/js/shared/capture-prompt.js`.
 *
 * A single-field modal that asks for one piece of text - a blocked reason, a resume note - and
 * resolves what the person entered.
 *
 * **`open` never rejects and always resolves an object.** `resolve` is called exactly once, from
 * a `close` listener registered `{ once: true }`, with a result that starts as
 * `{ confirmed: false, value: "" }` and is only replaced when the form submits a non-empty
 * trimmed value. Cancel, Escape, and any other dismissal all reach that same listener.
 *
 * **This is not `modal` and not `view.createModalForm`.** `modal` asks a yes/no question and
 * returns a boolean; `createModalForm` builds a dialog element. This one collects a value and
 * disposes of everything it made.
 *
 * The writer acquires `LongtailForge.view` through its own checked read and throws
 * `"Capture prompts require LongtailForge.view modal helpers."` when the five modal helpers it
 * needs are not all present, so **this declaration exposes no view optionality.**
 *
 * Published as a plain object rather than a frozen one, which the declaration describes but does
 * not change.
 */
export interface BrowserCapturePrompt {
  open(options?: BrowserCapturePromptOptions): Promise<BrowserCapturePromptResult>;
}

export interface BrowserTimezoneOption {
  /** `"<zone> (UTC +HH:MM)"`, built from the offset at the date the list was asked for. */
  label: string;
  /** A normalized IANA zone name. */
  value: string;
}

export interface BrowserLocalDateRange {
  /** The zone's `23:59:59` on that date, as UTC. */
  end: Date;
  /** The zone's `00:00:00` on that date, as UTC. */
  start: Date;
}

/**
 * `LongtailForge.timezones`, published by `public/js/shared/timezones.js`.
 *
 * The workspace's timezone state and the formatters built on it.
 *
 * **Every member that takes a `timezone` defaults to the module's current user timezone and
 * normalizes whatever it is given**, so a caller cannot put an invalid zone into a formatter:
 * `normalizeTimezone` coerces with `String(...)`, validates by constructing an
 * `Intl.DateTimeFormat` for it, and falls back to `"America/New_York"`. **The normalized value is
 * therefore always a non-empty valid zone name**, which is why the getters return `string` rather
 * than something nullable.
 *
 * **`loadSessionTimezone` reaches the network and still returns nothing from it.** It fetches
 * `/api/session`, and on every path - non-OK response, unparseable body, thrown error, or success
 * - it returns the module's own `userTimezone`. On success the parsed body's timezone is passed
 * *into* `setUserTimezone`, never back out. **The whole body sits inside one `try`, so it never
 * rejects.** That is why this surface has no `0.33.33.38.4` boundary despite calling `fetch`.
 *
 * Published as a plain object rather than a frozen one.
 */
export interface BrowserTimezones {
  formatDate(date: Date, timezone?: string): string;
  formatDateInput(date: Date, timezone?: string): string;
  /** Accepts what `new Date(...)` accepts; returns the empty string for an unusable value. */
  formatDateTime(value: Date | string | number, timezone?: string): string;
  formatTimeInput(date: Date, timezone?: string): string;
  /** `"UTC +HH:MM"` for that zone at that instant. */
  formatUtcOffset(date: Date, timezone: string): string;
  getUserTimezone(): string;
  /** Every zone `Intl` reports, plus `UTC`, sorted and labelled with the offset at `date`. */
  listSupportedTimezones(date?: Date): BrowserTimezoneOption[];
  /** **Resolves the module's timezone, never the session body.** Does not reject. */
  loadSessionTimezone(): Promise<string>;
  localDateRangeToUtc(dateValue: string, timezone?: string): BrowserLocalDateRange;
  /** `unknown` in because it coerces anything; a valid zone name out, always. */
  normalizeTimezone(timezone: unknown): string;
  /** Normalizes, stores to `localStorage`, and returns what it stored. */
  setUserTimezone(timezone: unknown): string;
  /** The empty string when the date and time cannot be parsed. */
  zonedDateTimeToUtcIso(dateValue: string, timeValue: string, timezone?: string): string;
}

/**
 * `LongtailForge.esModuleBridge`, published by `public/js/dashboard.entry.js`.
 *
 * The dashboard's asset loader. `dashboard.html` carries **one** script tag - the entry module -
 * and everything else the page runs, including `dashboard.js`, is loaded through these five
 * functions.
 *
 * **The bridge is frozen onto the namespace before the module's first top-level `await`**, so any
 * classic script it goes on to load observes a fully published surface. Nothing can see it half
 * built, because the only code that runs after the assignment and before the first `await` is the
 * assignment itself.
 *
 * **Every path is local-asset only.** `versionedAssetUrl` refuses any URL that leaves this origin
 * or falls outside `/css/` and `/js/`, and the script and style loaders each refuse an extension
 * that does not match. Those refusals are thrown, not returned.
 */
export interface BrowserEsModuleBridge {
  /**
   * Load one contribution list. Styles and scripts are dispatched by `type` and **anything else
   * is skipped**; a non-array argument is treated as empty.
   *
   * The parameter is `unknown` because the writer only checks that the argument is an array and
   * then reads `type` and `path` defensively off each entry. The shape it is *meant* to receive
   * is `BrowserAssetContribution` from `framework-contracts`, and naming that here instead would
   * be **stronger than the runtime** - it would reject the parsed manifest its caller actually
   * holds and push validation onto a consumer this contract does not own.
   */
  loadContributedAssets(assets?: unknown): Promise<void>;
  /**
   * Dynamically import one browser script, deduplicated by resolved URL.
   *
   * **Resolves the imported module namespace**, which is `unknown` because the specifier is
   * chosen at runtime - not because anything untrusted was parsed. Callers await it for
   * sequencing rather than reading anything off it. **Rejects** on a non-local path, on a path
   * that is not `.js`, and on an import failure.
   */
  importScript(assetPath?: unknown): Promise<unknown>;
  /** Import several scripts concurrently. **Requires an array** and rejects if any one fails. */
  importScripts(assetPaths: readonly unknown[]): Promise<void>;
  /**
   * Append one stylesheet `<link>`, deduplicated by resolved URL. **Resolves with the `load`
   * event** and rejects when the stylesheet fails or the path is not `.css`.
   */
  loadStyle(assetPath?: unknown): Promise<Event>;
  /**
   * Resolve a local asset path against the document base and stamp the current asset version.
   * **Throws** for anything off-origin or outside `/css/` and `/js/`.
   */
  versionedAssetUrl(assetPath?: unknown): string;
}

/**
 * `LongtailForge.dashboardBootstrap`, published by `public/js/dashboard.entry.js`.
 *
 * The dashboard's shared load state: the manifest request the page started before any panel
 * script existed, the route-keyed cache of in-flight panel requests, and the two functions that
 * fill and address it.
 *
 * **`dataPromises` is deliberately shared and consumers write to it.** The entry module seeds it
 * through `loadRoute`, and `dashboard.js` and `time-tracking-dashboard.js` both `set` into the
 * same map under the same route keys - so a panel that has already been requested is never
 * requested twice, whichever file asked first. **A `ReadonlyMap` would describe an architecture
 * this page does not have**, and would break three call sites that are meant to participate.
 *
 * **Every consumer falls back to a private `new Map()` when the surface is absent**, so the
 * shared cache degrades to per-file caching rather than failing.
 */
export interface BrowserDashboardBootstrap {
  /**
   * Route to in-flight request. **Values stay `Promise<unknown>`**: each is an `api.getJson`
   * result, and narrowing a wire body is `0.33.33.38.4`'s work rather than this surface's.
   */
  dataPromises: Map<string, Promise<unknown>>;
  /** Request a route once and memoize it. An empty route resolves an empty object. */
  loadRoute(routeValue?: unknown): Promise<unknown>;
  /**
   * The manifest request started during module evaluation, created **once** and never replaced.
   *
   * Resolves the same `CachedFetchResult` shape on both of its branches - the workspace-scoped
   * path returns `cachedFetch.getJson` directly and the unscoped path builds the equivalent by
   * hand - so `data` is `unknown` here for the reason it is `unknown` there. **It can reject**:
   * the API client is acquired inside it and the cached-fetch read is unguarded.
   */
  manifestPromise: Promise<CachedFetchResult>;
  /** The data route for a panel descriptor, with the calendar panel's range folded in. */
  routeForPanel(panel?: unknown): string;
}

/**
 * One registered module action as the registry describes it to a host, built by
 * `public/js/shared/module-actions.js` at two sites - the elements of `list()` and the
 * `action` a host context carries - which construct the identical shape.
 *
 * **Only the two identifiers are `string`.** `register` pins `actionId` and `id` after
 * spreading the caller's descriptor, so nothing can overwrite them. Every other field is
 * whatever the registering module supplied: the registry sets defaults, spreads the
 * descriptor over them, and **never validates what came back**. Naming those fields
 * `string` would describe the defaults rather than the runtime. The three list fields are
 * `unknown[]` for the same reason - they are `[...action.requiredModules]`, so the registry
 * copies whatever iterable it was given.
 */
export interface ModuleActionSummary {
  actionId: string;
  id: string;
  label: unknown;
  mode: unknown;
  moduleId: unknown;
  recordType: unknown;
  requiredModules: unknown[];
  requiredPermissions: unknown[];
  requiredWorkspaceCapabilities: unknown[];
  title: unknown;
}

/**
 * What `open` resolves to. **The registry owns this shape** - it is settled by the host
 * context rather than returned by the module - which is why `actionId` and `completed` are
 * precise. `detail` is not: it is whatever the dialog passed to `complete`/`cancel`, or the
 * opener's own return value.
 *
 * **Every consumer reads `completed` and nothing else.**
 */
export interface ModuleActionOutcome {
  actionId: string;
  completed: boolean;
  detail: unknown;
}

/**
 * `LongtailForge.moduleActions`, published by `public/js/shared/module-actions.js`.
 *
 * The registry through which one page opens another module's dialog without loading that
 * module's page controller. It extends `ModuleActionDependencyLoader`, which `0.33.33.34`
 * named for the loading half: those two members were always members of this one object, and
 * the split is a statement about when a host may call them, not about where they live.
 *
 * **`register` deliberately does not name the descriptor it accepts.** Eleven call sites in
 * eight module files register actions, and the fields they supply - `canOpen`, `open`,
 * `mode`, `recordType`, `requiredModules` and the rest - are **the module-contribution
 * vocabulary of this framework.** Naming it here would settle a contract that belongs to a
 * checkpoint about extensibility, on the evidence of whichever modules happen to ship today.
 * The registry itself validates only that an id and an `open` function are present, and
 * **returns `null` when either is missing**; the comment names the intended shape, the type
 * says what the runtime accepts. **No consumer reads the return value.**
 */
export interface BrowserModuleActions extends ModuleActionDependencyLoader {
  /** Registered actions the workspace can currently use, or all of them. */
  list(options?: { includeUnavailable?: boolean }): ModuleActionSummary[];
  /**
   * Open a registered action's dialog and resolve once it settles.
   *
   * **Rejects** for an unregistered action, one unavailable in this workspace, one whose
   * `canOpen` refuses, one with no opener, and any error the opener throws - which it
   * re-throws after reporting it through the host's status channel.
   *
   * `options` carries the host's `onCancel`, `onComplete`, `refresh`, `setStatus` and
   * `statusElement`, each read behind a `typeof` guard and none of them validated.
   * **Naming that shape was tried and withdrawn**, because `refresh` is supplied by the host
   * but *called by the module dialog*, with a detail value neither of them validates. Typing
   * the parameter honestly as `unknown` made a host's own refresh callback stop compiling -
   * so the declaration would have been buying consumer assistance with narrowing work that
   * belongs to `0.33.33.38.4`. The members are named here instead.
   */
  open(actionId: string, params?: unknown, options?: unknown): Promise<ModuleActionOutcome>;
  /** Register an action, or return `null` for a descriptor with no id or no opener. */
  register(action?: unknown): unknown;
}

/** A billing period a client or project overrides, or `null` where it inherits. */
export interface NormalizedBillingPeriod {
  /** 1-28, and always 1 for a calendar month. */
  startDay: number;
  type: "calendarMonth" | "custom";
}

/** A rounding rule a client or project overrides, or `null` where it inherits. */
export interface NormalizedBillingRounding {
  enabled: boolean;
  increment: "nearestHalfHour" | "nearestHour" | "nearestQuarterHour";
}

/**
 * A project as `normalizeClients` rebuilds it - **not** a project record.
 *
 * Every field here is constructed by the writer rather than passed through: the identifiers
 * are `String(...).trim()`ed and accept either casing the API uses, `status` is derived from
 * a case-insensitive `"inactive"` test, `billable` falls back to the owning client's setting,
 * money is parsed to a finite number or `null`, and the two override shapes are rebuilt field
 * by field. `displayName`, `optionLabel` and `hierarchyDepth` are added by the ordering pass,
 * which indents each label by its depth in the parent chain.
 */
export interface NormalizedProjectOption {
  billable: "no" | "yes";
  billingPeriod: NormalizedBillingPeriod | null;
  billingRate: number | null;
  billingRounding: NormalizedBillingRounding | null;
  client_id: string;
  displayName: string;
  hierarchyDepth: number;
  id: string;
  name: string;
  optionLabel: string;
  parent_project_id: string;
  status: "Active" | "Inactive";
}

/**
 * A client as `normalizeClients` rebuilds it, with its projects already ordered and labelled.
 *
 * **The writer spreads the input record before overwriting these fields**, so a normalized
 * client also carries whatever else the API sent. That is deliberately not described here:
 * no consumer in the estate reads a pass-through field, and naming today's API columns would
 * freeze a server shape this helper does not own. The fields below are the ones the writer
 * constructs and therefore the ones it can promise.
 */
export interface NormalizedClientOption {
  billable: "no" | "yes";
  billingPeriod: NormalizedBillingPeriod | null;
  billingRate: number | null;
  billingRounding: NormalizedBillingRounding | null;
  displayName: string;
  hierarchyDepth: number;
  id: string;
  /** Present only on the synthetic entry that carries workspace-scoped projects. */
  isWorkspaceScope?: boolean;
  name: string;
  optionLabel: string;
  parent_client_id: string;
  projects: NormalizedProjectOption[];
  status: "Active" | "Inactive";
}

/**
 * `LongtailForge.clientProjectOptions`, published by
 * `public/js/shared/client-project-options.js`.
 *
 * Turns a client/project API body into the ordered, labelled options six pages put in their
 * pickers. **Input and output are deliberately different vocabularies.** `data` is `unknown`
 * because it is a wire body - every consumer hands it a `response.json()` or an
 * `api.getJson` result, and the writer reads it defensively, keeping only what survives
 * `Array.isArray`. The output is named strongly because **the writer constructs every field
 * of it**, which is the same input-untrusted / output-normalized split `timezones` and the
 * link-target vocabulary already use.
 */
export interface BrowserClientProjectOptions {
  /**
   * Order and label a client/project body for a picker. **Total**: an unusable body yields an
   * empty list rather than an error. Inactive records are dropped unless `includeInactive`.
   *
   * Clients come back in parent-then-child order with orphans appended, and a synthetic
   * `isWorkspaceScope` entry is prepended **only** when the body carries workspace projects.
   */
  normalizeClients(data?: unknown, options?: { includeInactive?: boolean }): NormalizedClientOption[];
  /**
   * The label for a client **or** a project - both are passed at four sites - falling back
   * through `displayName` and `name` to `""`.
   *
   * The parameter names the three fields the implementation reads rather than either record
   * type, because that is all it touches and it is called with both.
   */
  optionLabel(record?: { displayName?: string; name?: string; optionLabel?: string }): string;
}

/** One Markdown command the notes editor can apply, as `notesEditor.commands` lists them. */
export interface NotesEditorCommand {
  placeholder: string;
  prefix: string;
  suffix: string;
}

/**
 * The controller `createPlainTextarea` returns: a plain `<textarea>` wired for Markdown
 * editing. Every member is built by the writer from the element it was given, so the shape is
 * closed - there is no extension point here and nothing is read back off the DOM untyped.
 */
export interface NotesPlainTextareaController {
  /** Apply a command by name and return the textarea's resulting value. */
  applyCommand(commandName?: unknown): string;
  /** The command names this controller accepts, from the writer's own frozen table. */
  commands: string[];
  /** Continue a list marker onto the next line; `false` when the caret is not in a list. */
  continueList(): boolean;
  element: HTMLTextAreaElement;
  getValue(): string;
  indent(): void;
  outdent(): void;
  setValue(value?: unknown): void;
}

/**
 * `LongtailForge.notesEditor`, published by `public/js/shared/notes-editor.js`.
 *
 * Markdown editing behaviour for a plain `<textarea>`, with no dialog and no network of its
 * own. **Every member is total**: a missing textarea yields `""`, `false`, or `null` rather
 * than throwing, which is why the parameters below say what the runtime accepts rather than
 * what a caller ideally passes.
 */
export interface BrowserNotesEditor {
  /** Apply a command to a textarea and return its resulting value, or `""` when it cannot. */
  applyCommand(textarea?: unknown, commandName?: unknown): string;
  /** The writer's frozen command table, keyed by command name. */
  commands: Readonly<Record<string, NotesEditorCommand>>;
  /** Continue a list marker on Enter. `false` when there is nothing to continue. */
  continueListMarker(textarea?: unknown): boolean;
  /** Wire a textarea for Markdown editing, or `null` when there is no element. */
  createPlainTextarea(element?: unknown, options?: unknown): NotesPlainTextareaController | null;
  /** Tab, Shift+Tab and Enter behaviour. Reads the event and returns nothing. */
  handleKeydown(event?: unknown, textarea?: unknown): void;
  /** Normalise Markdown text. Coerces through `String(...)`, so anything is accepted. */
  normalizeMarkdown(markdown?: unknown): string;
}

/**
 * A panel mounted into a host element, as `notesLinkedPanel.mount` returns.
 *
 * **`refresh` fetches but resolves nothing.** The panel reads its own route and renders into
 * the container it was given; no wire body is handed back to the caller, which is why this
 * surface is declarable in `0.33.33.38.2` rather than being `0.33.33.38.4`'s work. The same
 * distinction `timezones` established: reaching the network is not the boundary, returning
 * unvalidated data is.
 *
 * `fileAttachments.mount` returns the identical shape and will reuse this contract when
 * `0.33.33.40` has typed the Notes page state that currently holds its controller as `null`.
 */
export interface BrowserMountedPanel {
  /** Tear the panel down and empty its container. */
  destroy(): void;
  /** Re-read the panel's data and re-render. Resolves when the render is complete. */
  refresh(): Promise<void>;
}

/** The four sort modes `LINKED_NOTE_SORT_MODES` admits before the panel options normalise. */
export type BrowserLinkedNoteSort = "pinned" | "recent" | "title" | "updated";

/** The record `shapeLinkedNoteTarget` builds, four members named from the query's own target. */
export interface BrowserLinkedNoteTarget {
  moduleId: string;
  targetId: string;
  /** Left open text: the browser reader does not validate the full linked-target vocabulary. */
  targetType: string;
  sourceUrl: string;
}

/**
 * What `readNotesModuleState` answers: a server policy result, not a browser computation.
 *
 * `notesModuleEnabled` and `enabled` are the same `canWriteModule` answer under two names, which
 * the producer sends for compatibility rather than because they can differ.
 */
export interface BrowserNotesModuleState {
  enabled: boolean;
  historicalReadAccess: boolean;
  notesModuleEnabled: boolean;
  workspaceType: BrowserWorkspaceType;
}

/**
 * The panel's action hints.
 *
 * **Display hints, not authorization.** Every write route asserts its own permission; these say
 * what the panel should offer, and a browser that treats them as the decision would be reading a
 * suggestion as a grant.
 */
export interface BrowserLinkedNotePanelActions {
  canCreate: boolean;
  canLink: boolean;
  canUnlink: boolean;
  readonly: boolean;
}

/** The empty state the producer builds when a target has no linked notes. */
export interface BrowserLinkedNotePanelEmptyState {
  action: { href: string; label: string };
  body: string;
  title: string;
}

/**
 * What `GET /api/notes/for-target` resolves to.
 *
 * **Exact at the envelope: eight members, one literal, no top-level spread.** All eight are
 * declared even though two diagnostics named only `count` and `linkedNotes`, because the panel
 * reads `emptyState`, three of the `actions` and `moduleState.enabled` besides.
 *
 * **`notes` is deliberately opaque.** It is a compatibility projection of the same sorted notes
 * `linkedNotes` is built from, shaped by `shapeNoteForBrowser`; no browser consumer on this path
 * reads into an element. Claiming `BrowserNoteRecord[]` would make this endpoint the owner of a
 * second exhaustive note projection it does not use, so the container is checked and the element
 * shape is left to the producer that owns it.
 *
 * Three coherences are enforced because the producer guarantees them: `count` is
 * `linkedNotes.length`, `notes` and `linkedNotes` map the same sorted collection, and
 * `emptyState` is `null` exactly when there is something to show.
 */
export interface BrowserLinkedNotePanelResponse {
  actions: BrowserLinkedNotePanelActions;
  /** `linkedNotes.length`, so a finite count rather than a value to default. */
  count: number;
  /** `null` exactly when `count > 0`. */
  emptyState: BrowserLinkedNotePanelEmptyState | null;
  linkedNotes: BrowserLinkedNoteItem[];
  moduleState: BrowserNotesModuleState;
  /** The compatibility projection: container-checked, elements deliberately unpromised. */
  notes: unknown[];
  sort: BrowserLinkedNoteSort;
  target: BrowserLinkedNoteTarget;
}

/**
 * `LongtailForge.notesLinkedPanel`, published by `public/js/shared/notes-linked-panel.js`.
 *
 * The linked-notes panel the Task dialog mounts. **`mount` throws** rather than returning
 * `null` when it has no container, so the return type has no null branch.
 */
export interface BrowserNotesLinkedPanel {
  mount(container?: unknown, options?: unknown): BrowserMountedPanel;
  /**
   * What `GET /api/notes/for-target` answered, or `null` when it cannot be vouched for.
   *
   * Lives here because two pages read this producer and this surface is already declared and
   * already delivered to both - Tasks loads `shared/notes-linked-panel.js` before its own script -
   * so sharing the reader costs no new root member and no second copy of the note column tables.
   */
  readForTarget(body: unknown): BrowserLinkedNotePanelResponse | null;
}

/**
 * `LongtailForge.notesDialog`, published by `public/js/notes.js`.
 *
 * **A closed contract with one writer.** `0.33.33.38.2.4.4` removed the spread of the previous
 * value that made this look like an extension point: the file is delivered as a classic script
 * on its own page and as a `module: true` module-action dependency elsewhere, and the
 * descriptor's readiness probe stops the second load. Nothing may contribute members here.
 *
 * **Every opener rejects rather than returning a failure value** - a missing note id, an edit
 * without a record - and each resolves `hostContext.result` when a module action supplied one,
 * otherwise the dialog's own outcome. That union is genuinely `unknown`: the two branches are
 * different shapes and `0.33.33.38.4` owns narrowing what a dialog resolves.
 */
export interface BrowserNotesDialog {
  /** Open the editor in add mode. */
  openAdd(params?: unknown, hostContext?: unknown): Promise<unknown>;
  /** Open the editor in edit mode. Rejects without a note id. */
  openEdit(params?: unknown, hostContext?: unknown): Promise<unknown>;
  openNoteEditor(params?: unknown, hostContext?: unknown): Promise<unknown>;
  openNoteViewer(params?: unknown, hostContext?: unknown): Promise<unknown>;
  /** The viewer, under the name the module-action registry uses. */
  openView(params?: unknown, hostContext?: unknown): Promise<unknown>;
}

/**
 * `LongtailForge.listsDialog`, published by `public/js/lists.js`.
 *
 * The same closed single-writer shape as `notesDialog`, for the same reasons, with three
 * members instead of five.
 */
export interface BrowserListsDialog {
  openAdd(params?: unknown, hostContext?: unknown): Promise<unknown>;
  openEdit(params?: unknown, hostContext?: unknown): Promise<unknown>;
  openListEditor(params?: unknown, hostContext?: unknown): Promise<unknown>;
}

/**
 * What `taskResumeNoteCapture.consume` resolves: a locally built outcome, never a wire body.
 *
 * **The shape is constructed and the payload is not.** Every branch of the implementation
 * returns an object literal assembled here - but `reason` widens to `string` the way any
 * object-literal property does, and `task`
 * is a task record that reached this file from the network without validation, and `error` is
 * a caught value. Those two stay `unknown` because that is what they are; narrowing a task
 * record is `0.33.33.38.4`'s work.
 */
export interface TaskResumeNoteConsumeResult {
  consumed: boolean;
  /** Present only on the error branch. */
  error?: unknown;
  reason?: string;
  task?: unknown;
}

/** What `taskResumeNoteCapture.offer` resolves. Constructed on every branch, like `consume`. */
export interface TaskResumeNoteOfferResult {
  captured: boolean;
  /** Present only on the error branch. */
  error?: unknown;
  reason?: string;
  task?: unknown;
}

/**
 * `LongtailForge.taskResumeNoteCapture`, published by `public/js/task-resume-note-capture.js`.
 *
 * Offers the resume-note prompt when a task is resumed, and consumes the note the prompt
 * captured. **Both members reach the network and neither returns a wire body**: each resolves
 * an outcome this file builds, with the untrusted task record carried in one named field
 * rather than spread through the result.
 */
export interface BrowserTaskResumeNoteCapture {
  consume(options?: unknown): Promise<TaskResumeNoteConsumeResult>;
  offer(options?: unknown): Promise<TaskResumeNoteOfferResult>;
}

/**
 * `LongtailForge.timeEntryDialog`, published by `public/js/time-entry-dialog.js`.
 *
 * **The openers resolve a string, not an opaque result, and that is the finding.**
 * `0.33.33.38.2.2.6.5` declared `notesDialog` and `listsDialog` with `Promise<unknown>` because
 * those resolve `hostContext?.result || result` - two different shapes. **These dialogs do not
 * do that**: both openers delegate to one internal `openDialog`, which resolves
 * `dialog.returnValue || "closed"`, and `time-entries.js` reads it exactly that way with
 * `if (result !== "complete")`. Copying the earlier precedent would have thrown away a precise
 * type the runtime already provides.
 */
export interface BrowserTimeEntryDialog {
  /** Reset the dialog's host context. Returns the surface, so calls can chain. */
  configure(options?: unknown): BrowserTimeEntryDialog;
  openAdd(params?: unknown, hostContext?: unknown): Promise<string>;
  /** **Rejects** when the entry it was asked to edit cannot be loaded. */
  openEdit(params?: unknown, hostContext?: unknown): Promise<string>;
}

/**
 * `LongtailForge.timeTrackingTimerDialog`, published by
 * `public/js/time-tracking-timer-dialog.js`.
 *
 * One member, resolving the same `dialog.returnValue || "closed"` string its sibling dialogs do.
 */
export interface BrowserTimeTrackingTimerDialog {
  openCreate(params?: unknown, hostContext?: unknown): Promise<string>;
}

/**
 * A dashboard panel renderer, as modules register them through
 * `LongtailForge.dashboard.registerPanelRenderer`.
 *
 * **The parameters are `unknown` because the runtime hands the renderer untrusted values.**
 * `contribution` is an entry from the dashboard manifest, which arrives through
 * `dashboardBootstrap.manifestPromise` as a `CachedFetchResult` whose `data` is `unknown`;
 * narrowing it is `0.33.33.38.4`'s work. `context` is built by `dashboard.js` and carries
 * `dashboardData`, `findContribution`, `loadContributionData`, `setStatus`, `view`,
 * `createPanel` and `createDashboardPanel` - **named here rather than typed**, for the reason
 * `0.33.33.38.2.2.6.4.1` withdrew `ModuleActionHostOptions`: a host-supplied callback shape is
 * read defensively, and typing it constrains callers the runtime does not constrain.
 *
 * **The return is `unknown` because the registry accepts three shapes**: a falsy value, one
 * panel, or an array of them. `normalizeRenderedPanels` reduces all three to a list before any
 * of it reaches the DOM.
 */
export type DashboardPanelRenderer = (contribution?: unknown, context?: unknown) => unknown;

/**
 * `LongtailForge.dashboard`, published by `public/js/dashboard.js`.
 *
 * **A closed, single-member surface, and `0.33.33.38.2.4.4` is what made that statement
 * true rather than assumed.** This child was blocked on `0.33.33.38.2.4` for four checkpoints
 * because the surface was published by spread-merge - `{ ...(namespace.dashboard || {}), ... }` -
 * which reads as an invitation to other publishers, and declaring the one member that happened
 * to exist would have frozen an anticipated extension point into a closed contract. **The block
 * was correct.** What settled it was archaeology, not assumption: the spread assigned a new
 * object every time so it never preserved identity for a captured reference, the panel registry
 * it appeared to protect is a file-local closure, and the file publishes once from one call
 * behind the ES-module bridge. The spread is gone, and this is a closed contract.
 *
 * **Two consumers acquire it at load and fail differently on purpose.** `tasks-dashboard.js`
 * **throws** - the Tasks dashboard cannot render without the registry - while
 * `time-tracking-dashboard.js` **returns**, because its panels are an optional contribution to
 * a dashboard that renders fine without them. Both check `registerPanelRenderer` rather than
 * the surface, and neither is standardised into the other.
 */
export interface BrowserDashboard {
  /**
   * Register a renderer for a panel contribution id.
   *
   * **Ignores** an empty id or a non-function renderer rather than throwing, and **re-renders
   * immediately** when dashboard data has already arrived - so a late registration still shows
   * its panel. A repeat id replaces the previous renderer.
   */
  registerPanelRenderer(rendererId?: unknown, renderer?: DashboardPanelRenderer): void;
}

/**
 * The detail each attachment event carries, keyed by the event `emit` raises.
 *
 * **The eleven events do not share a detail shape, so they do not share a listener type.** A
 * single `(detail?: unknown) => void` looked tidy and was wrong: `task-dialog.js` destructures
 * `{ error }` from the upload-failure detail, and a callback that destructures cannot accept
 * `unknown`. Each listener below carries the shape its own `emit` call site supplies, which is
 * both more truthful and what lets the existing consumers compile unchanged.
 *
 * The values inside stay `unknown`: an attachment, an upload result and a caught error are all
 * unvalidated, and narrowing them is `0.33.33.38.4`'s work.
 */
export type BrowserFileAttachmentEventListener<Detail> = (detail?: Detail) => void;

/**
 * What `LongtailForge.fileAttachments.mount` accepts.
 *
 * **Every key is optional because the writer supplies a default for the ones it needs.**
 * `normalizeOptions` builds a defaulted object and spreads the caller's over it, so a caller
 * may pass none of these; what it may not do is pass something the component silently drops.
 *
 * **The `on*` members are read through a computed key**, which is why a search for them finds
 * nothing: `emit` builds `on${Name}` from the event it is raising. They are enumerable all the
 * same - the writer raises eleven named events - and each is called as `callback?.(detail)`
 * alongside a `longtailforge:file-attachments:*` DOM event carrying the same detail.
 *
 * **`emptyMessage` is accepted and never read.** `task-dialog.js` passes it, the spread carries
 * it into the component's state, and nothing consumes it - so it is declared rather than
 * omitted, because omitting it would fail an excess-property check on a call the runtime
 * accepts today. Removing it from that call site is `0.33.33.41`'s work, not this one's.
 */
export interface BrowserFileAttachmentOptions {
  /** File categories the picker offers, as `acceptedExtensions` maps them. */
  acceptedCategories?: unknown;
  /** Extra form fields appended to an upload. Sent as-is, so the value is not narrowed here. */
  attachmentMetadata?: unknown;
  canQuarantine?: boolean;
  /** Compared against `false`, so anything else leaves removal enabled. */
  canRemove?: boolean;
  canReport?: boolean;
  canUpload?: boolean;
  clientId?: unknown;
  /** Accepted and currently unread. */
  emptyMessage?: unknown;
  /** Required together with `targetType` and `targetId` before the panel will load. */
  moduleId?: unknown;
  onAttachmentAdded?: BrowserFileAttachmentEventListener<unknown>;
  onAttachmentRemoved?: BrowserFileAttachmentEventListener<{ attachment?: unknown }>;
  onFileDeleted?: BrowserFileAttachmentEventListener<{ attachment?: unknown }>;
  onFileQuarantined?: BrowserFileAttachmentEventListener<{ attachment?: unknown }>;
  onFileReported?: BrowserFileAttachmentEventListener<{ attachment?: unknown }>;
  onFileRestored?: BrowserFileAttachmentEventListener<{ attachment?: unknown }>;
  onRefresh?: BrowserFileAttachmentEventListener<{ attachments?: unknown }>;
  onStatusChanged?: BrowserFileAttachmentEventListener<{ attachment?: unknown; status?: unknown }>;
  onUploadCompleted?: BrowserFileAttachmentEventListener<unknown>;
  onUploadFailed?: BrowserFileAttachmentEventListener<{ error?: unknown }>;
  onUploadStarted?: BrowserFileAttachmentEventListener<{ files?: unknown }>;
  projectId?: unknown;
  /** Shown in place of the upload form when the record has not been saved yet. */
  saveFirstMessage?: unknown;
  targetId?: unknown;
  targetType?: unknown;
  /** The panel heading. */
  title?: unknown;
  visibility?: unknown;
}

/**
 * `LongtailForge.fileAttachments`, published by `public/js/shared/file-attachments.js`.
 *
 * The attachment panel Notes and the Task dialog mount. **One writer, one member, closed** -
 * `0.33.33.38.2.4.4` removed the preserving spread that made it look otherwise, having proved
 * it was the residue of a three-writer arrangement `0.33.33.34` retired.
 *
 * **This surface waited on Notes rather than on itself.** `notes.js` held its controller in a
 * state field that inferred as `null`, so nothing the mount returned could be assigned there;
 * `0.33.33.40.1` typed that field and the block ended.
 */
export interface BrowserFileAttachments {
  /**
   * Mount the attachment panel into a container and start loading its attachments.
   *
   * **Throws** when there is no container, so the return has no null branch - and the parameter
   * admits `null` because that is what the runtime accepts and rejects, rather than forcing a
   * caller that already guards to narrow again for the declaration's convenience. The returned
   * controller is the same `BrowserMountedPanel` the linked-notes panel returns: `refresh`
   * re-reads and re-renders without handing back a wire body, and `destroy` also unsubscribes
   * from the workspace-context event this panel listens to.
   */
  mount(container?: Element | null, options?: BrowserFileAttachmentOptions): BrowserMountedPanel;
}

/**
 * What `POST /api/notes/preview` resolves to.
 *
 * **Four members reconstructed by name, two of them constants the producer writes literally.**
 * `bodyFormat` and `bodyHtmlFormat` are not values the shaper discovers; they say which of the
 * two bodies is which, so they are declared and checked as the words they are.
 *
 * **`bodyHtml` is the reason this contract matters.** The page assigns it to `innerHTML`, and it
 * is safe to do that **because `renderMarkdownToSafeHtml` produced it** - the same call runs
 * `assertSafeMarkdown` over the input first. A browser that accepted an unvouchable body here
 * would be writing unsanitised markup into the document, so this reader refuses rather than
 * falling back to `""`, which would also have claimed the note renders to nothing.
 */
export interface BrowserNoteMarkdownPreview {
  /** A constant: the first body is always the Markdown that was sent. */
  bodyFormat: "markdown";
  /** The sanitised render, safe to assign because the server sanitised it. */
  bodyHtml: string;
  /** A constant: the second body is always HTML. */
  bodyHtmlFormat: "html";
  /** The Markdown the producer echoes back, after `assertSafeMarkdown`. */
  bodyMarkdown: string;
}

/**
 * The note columns every browser-facing Notes projection carries.
 *
 * **Derived from the producer, not from what `notes.js` reads.** `NOTE_LIST_COLUMNS` in
 * `src/modules/notes/notes.repo.js` selects exactly these twenty-seven, and `NOTE_COLUMNS` - the
 * detail select - is a strict superset, so this is the intersection every shaped note has. The
 * required/nullable split is the table's own `NOT NULL`, and nothing here is optional: these
 * columns are selected by name, so they are present even when null.
 *
 * **The vocabularies are documented rather than declared as unions, deliberately.** `note_type`,
 * `library_bucket`, `library_bucket_source`, `status`, `visibility` and `security_mode` each carry
 * a `CHECK` constraint in the schema, so the server does constrain them - but **the browser does
 * not validate them**, and `0.33.33.38.4` already recorded for `userPreferences` that a closed
 * union over an unvalidated wire field is a claim no browser code makes. The runtime vocabularies
 * are: `note_type` general/meeting/research/decision/procedure/reference/idea/log/client/project/
 * task/ticket/user; `library_bucket` active_work/ongoing_area/reference; `library_bucket_source`
 * derived/manual/imported; `status` active/pinned/archived/deleted; `visibility` internal/private/
 * workspace/client_visible/public; `security_mode` normal/secure.
 */
export interface BrowserNoteColumns {
  archived_at: string | null;
  /** Nulled by the producer for an effectively secure note, in both projections. */
  body_excerpt: string | null;
  client_id: string | null;
  created_at: string;
  created_by_user_id: string | null;
  deleted_at: string | null;
  import_source: string | null;
  import_source_id: string | null;
  imported_at: string | null;
  library_bucket: string;
  library_bucket_source: string;
  linked_user_id: string | null;
  note_collection_id: string | null;
  note_id: string;
  note_type: string;
  owner_user_id: string | null;
  project_id: string | null;
  security_mode: string;
  slug: string | null;
  status: string;
  task_id: string | null;
  ticket_id: string | null;
  title: string;
  updated_at: string;
  updated_by_user_id: string | null;
  visibility: string;
  workspace_id: string;
}

/**
 * One note as `GET /api/notes` returns it, shaped by `shapeNoteListProjection`.
 *
 * **A list note is not a detail note and this estate has to say so once.** The list select carries
 * twenty-seven columns, and the projection then deletes `body_markdown`, `body_plaintext_index`,
 * `body_html`, `metadata_json`, `metadata` and `searchDocument` - most of which the list select
 * never had. What it adds is `tags`, from the effective-tag decoration every candidate batch runs
 * through. The internal `__candidateOffset` marker is stripped before the response, so it is
 * absent here rather than optional.
 */
export interface BrowserNoteListItem extends BrowserNoteColumns {
  /** Effective tags as the tags service decorated them. **Not modelled here**: the tag record is
   * `LongtailForge.tags`' producer, and `0.33.33.38.2.2.10` owns it. */
  tags: unknown[];
}

/**
 * One note as `GET /api/notes/:id`, `POST /api/notes` and the editor refresh return it.
 *
 * **`shapeNoteForBrowser` is subtractive, which is what makes this contract derivable.** It spreads
 * the forty-seven-column detail row, deletes the eleven secure-storage columns, and then removes or
 * nulls the rest conditionally. Every member below is a column the detail select names or a field
 * `attachNoteIntegrations` adds - **no member is here because a consumer reads it.**
 *
 * **The eleven secure-storage columns are absent by design and must stay absent.**
 * `secure_payload`, `secure_payload_version`, `encrypted_data_key`, `encryption_key_version`,
 * `encryption_algorithm`, `key_wrapping_algorithm`, `encryption_nonce`, `encryption_auth_tag`,
 * `key_wrapping_nonce`, `key_wrapping_auth_tag` and `encrypted_at` are deleted by
 * `stripSecureStorageFields` before the note leaves the server. Declaring any of them would invite
 * a browser consumer to depend on an envelope the server deliberately withholds.
 */
export interface BrowserNoteRecord extends BrowserNoteColumns {
  body_markdown: string;
  /** Nulled by the producer for an effectively secure note. */
  body_plaintext_index: string | null;
  import_batch_id: string | null;
  import_source_path: string | null;
  metadata_json: string | null;
  original_notebook: string | null;
  original_page_id: string | null;
  original_section: string | null;
  original_section_group: string | null;
  /**
   * Rendered note body.
   *
   * **Optional rather than nullable, and the difference is the contract.** The producer takes
   * `includeBodyHtml`, and when it is false `shapeNoteForBrowser` **deletes the property** rather
   * than nulling it. A route that omits it sends a note with no `body_html` key at all.
   */
  body_html?: string;
  /**
   * The decrypted secure body, present only on the paths that decrypt one and **deleted again**
   * once the note is recognised as effectively secure. Optional for the same reason as
   * `body_html`: the producer deletes the key.
   */
  secure_body_decrypted?: unknown;
  /**
   * Added by the producer **only** for an effectively secure note, so its absence is meaningful.
   */
  secure_title_warning?: string;
  /** Decorated note links. **Not modelled here**: the link decorator is its own producer. */
  links: unknown[];
  /** The linked-context summary the producer builds. Its own producer, not modelled here. */
  linked_context: unknown;
  owner_display_name: string;
  /** Effective tags, owned by `0.33.33.38.2.2.10` as on the list item. */
  tags: unknown[];
}

/**
 * One note as `GET /api/notes/for-target` returns it, shaped by `shapeLinkedNotePanelItem`.
 *
 * The detail projection minus `body_markdown`, `body_plaintext_index` and `metadata_json`, plus
 * five fields the panel needs. It is declared against the shared columns rather than against
 * `BrowserNoteRecord` because `tags` is not decorated on this path.
 */
export interface BrowserLinkedNoteItem extends BrowserNoteColumns {
  /** A duplicate of `note_id`, added by the producer for the panel's list primitives. */
  id: string;
  label: string;
  /** `null` for an effectively secure note, `""` when the note has no excerpt. */
  excerpt: string | null;
  sourceUrl: string;
  links: unknown[];
}

/**
 * The pagination record `noteListResult` builds, or `null` when the caller asked for no page.
 *
 * Constructed field by field by the producer rather than passed through, so every member is
 * present and typed.
 */
export interface BrowserNotePagination {
  hasMore: boolean;
  limit: number;
  nextCursor: string;
  pageSize: number;
}

/** The `{ note }` envelope the single-note routes return. */
export interface BrowserNoteEnvelope {
  note: BrowserNoteRecord;
}

/** The `{ notes, pagination }` envelope `GET /api/notes` returns. */
export interface BrowserNoteListEnvelope {
  notes: BrowserNoteListItem[];
  pagination: BrowserNotePagination | null;
}

/**
 * The four linked-context types Lists publishes.
 *
 * A subset of the framework's linked-context types: `isListLinkTargetProvider` filters every
 * active provider through `LIST_LINK_TARGET_TYPES` before the route can answer, and each target
 * is built with the surviving provider's own type. Using the wider framework vocabulary here
 * would name types this route can never expose.
 */
export type BrowserListLinkTargetType = "client" | "note" | "project" | "task";

/**
 * One provider as the link-target route advertises it.
 *
 * **A deliberate five-member reduction of the registry's provider contribution**, not a mirror
 * of it: the service maps each active provider to exactly these five and answers no other part
 * of the contribution record.
 */
export interface BrowserListLinkTargetProvider {
  id: string;
  label: string;
  moduleId: string;
  /** The registry provider key, named `provider` on the contribution and `providerId` here. */
  providerId: string;
  targetType: BrowserListLinkTargetType;
}

/**
 * One linked-context target as Lists answers it.
 *
 * **Exact although the shaper spreads, because what it spreads is the framework's own total
 * reconstruction.** `normalizeLinkedContextTarget` names all eleven members from the raw input
 * and adds `primaryContextHints` only when the input carried it;
 * `assertLinkedContextTargetContract` then refuses the target unless every one is present and
 * typed. `shapeListLinkTarget` spreads that result and names three Lists labels.
 *
 * **Four members carry a safety guarantee the browser must not weaken.** The shared contract
 * refuses a `displayLabel` or `secondaryLabel` that looks like a raw identifier or echoes the
 * target, client, project or workspace id, so those labels are safe to render *because the
 * server refused the alternative* - not because they are strings.
 *
 * Six members are additionally guaranteed non-empty by that contract; `secondaryLabel`,
 * `sourceUrl`, `clientId` and `projectId` are reconstructed but may legitimately be `""`.
 */
export interface BrowserListLinkTarget {
  /** Lists' own label, falling back to the display label, so never empty. */
  ariaLabel: string;
  /** Reconstructed, and empty when the target has no client. */
  clientId: string;
  /** Refused by the shared contract if it looks like, or echoes, an identifier. */
  displayLabel: string;
  fullLabel: string;
  isAvailable: boolean;
  moduleId: string;
  /** Present only when the raw target carried hints; every value is text. */
  primaryContextHints?: Record<string, string>;
  /** Reconstructed, and empty when the target has no project. */
  projectId: string;
  /** Refused by the shared contract if it looks like, or echoes, an identifier. */
  secondaryLabel: string;
  sortKey: string;
  /** Reconstructed, and empty when the provider offers no link. */
  sourceUrl: string;
  targetId: string;
  targetType: BrowserListLinkTargetType;
  title: string;
  workspaceId: string;
}

/**
 * What `GET /api/lists/link-targets` resolves to.
 *
 * Two members reconstructed by name with no spread. **`providers` is never empty on a success**:
 * the service derives its target type from `activeProviders[0]` and throws before returning when
 * no active supported provider survives filtering, so an empty catalogue is not something this
 * producer can answer.
 */
export interface BrowserListLinkTargetsEnvelope {
  providers: BrowserListLinkTargetProvider[];
  targets: BrowserListLinkTarget[];
}

/**
 * One note collection as `public/js/notes.js` holds it after `normalizeCollections`.
 *
 * **This is the normalised shape, not the wire shape, and that is the point.** The collection read
 * model spreads the twenty-seven-column collection row and adds two rollup counts; the browser then
 * rebuilds seven fields with defaults and drops any entry without an id. The seven rebuilt fields
 * are typed because the normaliser guarantees them. **The fields it carries through untouched stay
 * `unknown` and optional**, because nothing on either side of the boundary establishes them: the
 * spread neither checks nor defaults them, and the wire may omit any of them.
 */
export interface BrowserNoteCollection {
  accessibleNoteCount: number;
  depth: number;
  directAccessibleNoteCount: number;
  library_bucket: string;
  note_library_collection_id: string;
  /** `""` rather than `null` for a root collection - the normaliser's own default. */
  parent_collection_id: string;
  title: string;
  /** Carried through the spread unchecked; read by the collection sort. */
  path_cache?: unknown;
  /** Carried through the spread unchecked; compared against `"archived"` and `"deleted"`. */
  status?: unknown;
}

/** The three Library buckets `note_library_collections.library_bucket` is constrained to. */
export type BrowserNoteLibraryBucket = "active_work" | "ongoing_area" | "reference";

/** The catalog lifecycle states that column is constrained to. */
export type BrowserNoteCatalogStatus = "active" | "archived" | "deleted";

/** What migration 088 constrains `security_policy` to. */
export type BrowserNoteCatalogSecurityPolicy = "normal" | "secure";

/** What the effective-security resolver answers, from its own frozen table. */
export type BrowserNoteEffectiveSecurityMode = "normal" | "secure";

/** What migration 088 constrains `security_transition_state` to. */
export type BrowserNoteCatalogTransitionState = "stable" | "securing" | "failed";

/**
 * What migration 089 constrains `security_transition_action` to.
 *
 * **Not the browser's own action vocabulary.** The page sends `enable`, `remove` and `retry` to
 * the transition routes; this is the column's record of what a transition is *doing*, where
 * `retry` is not a value because retrying resumes the action already stored.
 */
export type BrowserNoteCatalogTransitionAction = "none" | "enable" | "remove";

/**
 * One catalog as `shapeCatalogSettingsRow` builds it.
 *
 * **A reduction of the collection record, and the omissions are the security argument.** The
 * record reaching the shaper is a stored row spread together with four members
 * `projectCollectionSecurity` computes. The shaper names twenty and answers no others - so
 * `security_transition_actor_user_id` (who started a transition) and `security_source_catalog_id`
 * (which ancestor imposes security) never cross, along with the workspace id, the slug, both
 * user-id stamps and the raw metadata blob. `securityInherited` says *that* security is
 * inherited without naming *where from*.
 *
 * Every member is named by the shaper on every row, so none is optional. Six vocabularies are
 * closed because the browser compares against those exact words and the database constrains the
 * column to them; `source` is left open because nothing in the browser reads it, which is the
 * same line this estate has drawn since `userPreferences`.
 */
export interface BrowserNoteCatalogSettingsRow {
  catalogId: string;
  title: string;
  /** `""` rather than `null` for a catalog without one - the shaper's own default. */
  description: string;
  /** Nullable in the column, and the shaper passes it through without a default. */
  libraryBucket: BrowserNoteLibraryBucket | null;
  parentCatalogId: string | null;
  /** The cached path, falling back to the title, so never absent. */
  path: string;
  depth: number;
  sortOrder: number;
  /** Constrained to `manual` and `imported`, left open because no browser code reads it. */
  source: string;
  status: BrowserNoteCatalogStatus;
  securityPolicy: BrowserNoteCatalogSecurityPolicy;
  effectiveSecurityMode: BrowserNoteEffectiveSecurityMode;
  /** A comparison result, so a real boolean rather than a stored flag. */
  securityInherited: boolean;
  securityTransitionState: BrowserNoteCatalogTransitionState;
  securityTransitionAction: BrowserNoteCatalogTransitionAction;
  /** Constrained non-negative by migration 089. */
  securityTransitionVersion: number;
  securityTransitionJobId: string | null;
  securityTransitionStartedAt: string | null;
  securityTransitionErrorCode: string | null;
  updatedAt: string;
}

/**
 * What `GET /api/notes/settings/catalogs` resolves to.
 *
 * `listCatalogSettings` reconstructs all three members by name and spreads nothing, so this is
 * exact. `capabilities.manageSecurity` is the server's own answer to
 * `canInAnyScope(SECURE_MANAGE)` - the browser reports that decision and never recomputes it -
 * and `limits.bulkSelection` is the constant the bulk route enforces.
 *
 * `limits` is declared even though this page reads only the other two, because the producer
 * always sends it and an exact contract describes the producer rather than one consumer.
 */
export interface BrowserNoteCatalogSettings {
  catalogs: BrowserNoteCatalogSettingsRow[];
  capabilities: { manageSecurity: boolean };
  limits: { bulkSelection: number };
}

/** What `normalizeAction` answers before it throws; `retry` is a browser word, not a server one. */
export type BrowserNoteCatalogSecurityAction = "enable" | "remove";

/** Whether the transition runs in the request or continues as a resumable job. */
export type BrowserNoteCatalogSecurityExecution = "job" | "synchronous";

/**
 * The preview `publicPreflight` builds for a catalog security transition.
 *
 * **Fourteen members reconstructed by name, so this is exact.** `currentPolicy` and
 * `transitionState` reuse the catalog settings vocabularies because they are literally the same
 * two columns, read through the same `CHECK` constraints - reuse on producer identity rather
 * than on shape.
 *
 * The counts are all `.length` of a collected array, so they are finite and never absent.
 * `blockerCodes` is `string[]` rather than a closed union: the two codes the service raises are
 * not compared against literals anywhere in the browser, which only renders them as labels.
 */
export interface BrowserNoteCatalogSecurityPreflight {
  action: BrowserNoteCatalogSecurityAction;
  affectedNoteCount: number;
  affectedRevisionCount: number;
  /** Rendered one per entry, so the elements are checked rather than the container alone. */
  blockerCodes: string[];
  /** `blockers.length === 0`, and the only thing that enables the confirm button. */
  canProceed: boolean;
  catalogCount: number;
  catalogId: string;
  currentPolicy: BrowserNoteCatalogSecurityPolicy;
  execution: BrowserNoteCatalogSecurityExecution;
  noteTransformCount: number;
  revisionTransformCount: number;
  staleSearchDocumentCount: number;
  transitionState: BrowserNoteCatalogTransitionState;
  workRecordCount: number;
}

/** What `GET /api/notes/collections/:id/security/preflight` resolves to. */
export interface BrowserNoteCatalogSecurityPreflightEnvelope {
  preflight: BrowserNoteCatalogSecurityPreflight;
}

/**
 * What the three catalog security transition routes resolve to.
 *
 * **A structural minimum, because the producer spreads.** The synchronous branch returns
 * `{ ...result, execution, preflight }`, so only the members it names after the spread can be
 * claimed. `execution` is one of those and is the member the route itself branches on to choose
 * between `200` and `202`.
 *
 * The job branch also answers a `collection`, which is the **whole** collection record rather
 * than the reduced settings row - carrying the workspace id, both user stamps, the transition
 * actor and the inherited-security source. It is deliberately left undeclared: this contract
 * describes what the browser may trust, and blessing an over-broad member with a type would
 * make it look intended. Recorded for its own owner.
 */
export interface BrowserNoteCatalogSecurityTransition {
  execution: BrowserNoteCatalogSecurityExecution;
}

/**
 * The target a browser caller builds to identify what it wants to follow.
 *
 * **This is not the same shape the server echoes back, and the difference is load-bearing.**
 * `taskTarget` and `noteTarget` construct camelCase members that `targetParams` turns into a query
 * string; the server answers with `BrowserNotificationTarget`, which is snake_case because
 * `normalizeSubscriptionTarget` builds it from the database's own column names. Two records, two
 * names - collapsing them would let a consumer read `moduleId` off a value that carries `module_id`.
 */
export interface BrowserNotificationTargetRequest {
  moduleId: string;
  targetId: string;
  targetType: string;
}

/**
 * The target the subscription routes echo back, as `normalizeSubscriptionTarget` builds it.
 *
 * Every member is constructed by `String(...).trim()`, so all four are present and are strings;
 * `event_type` is `""` rather than absent when the caller named no event.
 */
export interface BrowserNotificationTarget {
  event_type: string;
  module_id: string;
  target_id: string;
  target_type: string;
}

/**
 * One notification subscription row as the subscription routes return it.
 *
 * **Constructed, not selected**: `subscriptionRowToAppValue` builds this object member by member
 * from the ten columns `NOTIFICATION_SUBSCRIPTION_COLUMNS` names, defaulting `event_type` to `""`
 * and `status` to `"inactive"`. That is why nothing here is optional or nullable even though
 * `event_type` is a nullable column - the shaper closes the gap before the row leaves the server.
 *
 * `status` is `"active"` or `"inactive"` at runtime, enforced by a `CHECK` constraint. It is typed
 * `string` because the browser does not validate that vocabulary, on the rule this checkpoint
 * recorded for `userPreferences`: a closed union over an unvalidated wire field is a claim no
 * browser code makes.
 */
export interface BrowserNotificationSubscription {
  created_at: string;
  event_type: string;
  module_id: string;
  notification_subscription_id: string;
  status: string;
  target_id: string;
  target_type: string;
  updated_at: string;
  user_id: string;
  workspace_id: string;
}

/**
 * What `readStatus`, `follow` and `unfollow` resolve to once the browser has narrowed the body.
 *
 * **One envelope for three operations, because the producer builds one.** `subscriptionStatus`,
 * `followTarget` and `unfollowTarget` each return `{ isFollowing, subscription, target }` - the
 * operation differs, the record does not. Three interfaces named after three routes would have
 * described the same runtime shape three times.
 *
 * `subscription` and `target` are nullable **here** rather than in the producer: the server always
 * sends both, and these are the values the browser's own narrowing produces when a body arrives
 * without them. `isFollowing` is exactly `body.isFollowing === true`, which is the comparison every
 * consumer already wrote.
 */
export interface BrowserNotificationSubscriptionResult {
  isFollowing: boolean;
  subscription: BrowserNotificationSubscription | null;
  target: BrowserNotificationTarget | null;
}

/**
 * One configurable notification event, merged with the viewer's preference layers.
 *
 * **This is the merged read model, not a stored record, and it is deliberately its own contract.**
 * The producer holds three layers - `notification_user_preferences`, `notification_workspace_defaults`
 * and the module event catalog - and `preferences()` collapses them into this one shape. The stored
 * rows are never sent: `enabled` is an `INTEGER` column on both preference tables and the server
 * converts it with `Number(row.enabled) === 1`, so **the browser receives real booleans and must not
 * model an integer flag.**
 *
 * `userEnabled` falls back to the workspace value, which falls back to the event's own default, so
 * the three booleans can disagree and each one means something different. `defaultPriority` and
 * `workspacePriority` are `low`/`normal`/`high`/`urgent` at runtime, typed `string` for the same
 * reason `status` is above.
 */
export interface BrowserNotificationEventPreference {
  defaultEnabled: boolean;
  defaultPriority: string;
  description: string;
  id: string;
  label: string;
  moduleEnabled: boolean;
  moduleId: string;
  userEnabled: boolean;
  workspaceEnabled: boolean;
  workspacePriority: string;
}

/**
 * The viewer's notification display preferences, as `shapeUserDisplayPreferences` constructs them.
 *
 * One member today, and it is normalised twice - once by the server and again by the browser's
 * `normalizeGroupingPreferences` - so it is always a string.
 */
export interface BrowserNotificationGroupingPreferences {
  groupingMode: string;
}

/**
 * What `loadPreferences` resolves to.
 *
 * **The envelope was already constructed; only its array was raw.** The browser writer has always
 * rebuilt `canManageWorkspaceDefaults` and `groupingPreferences` from the body, and it passed
 * `events` straight through once `Array.isArray` said it was an array. `0.33.33.38.4.10` checks the
 * elements, which is the difference between an array and an array of records.
 */
export interface BrowserNotificationPreferenceCatalog {
  canManageWorkspaceDefaults: boolean;
  events: BrowserNotificationEventPreference[];
  groupingPreferences: BrowserNotificationGroupingPreferences;
}

/**
 * `LongtailForge.notificationSubscriptions`, published by
 * `public/js/shared/notification-subscriptions.js`.
 *
 * **One writer, one publication, five members, closed.** The inventory reports no additive
 * publication and no second writer for this surface, so the object literal the writer assigns is
 * the whole runtime surface and this interface may be exact.
 *
 * **This surface waited on its own response bodies rather than on its shape.** Declaring it before
 * `0.33.33.38.4.10` would have handed every consumer an `unknown` to read `isFollowing` off; that
 * checkpoint narrowed the three network members inside this writer, so the contract below names a
 * checked value rather than a hope.
 *
 * **Genuinely optional at the root, and the consumers say so.** `footer.js` loads the script behind
 * a presence probe and `shared/module-actions.js` names it as a module-action dependency, so every
 * consumer already guards for absence and behaves differently without it - the Notes and Task
 * dialogs hide their follow toggle rather than failing. The optionality is a delivery fact, not
 * namespace ceremony.
 */
export interface BrowserNotificationSubscriptions {
  /**
   * Follow one target.
   *
   * `target` is `unknown` because the writer genuinely accepts either spelling:
   * `normalizeTargetPayload` reads `moduleId` or `module_id` from whatever it is given. The result
   * is the same envelope all three network members resolve to.
   */
  follow(target: unknown): Promise<BrowserNotificationSubscriptionResult>;
  /** Build the request target for one note. Constructed locally; it reaches no network. */
  noteTarget(noteId: string): BrowserNotificationTargetRequest;
  /** The viewer's follow state for one target. */
  readStatus(target: unknown): Promise<BrowserNotificationSubscriptionResult>;
  /** Build the request target for one task. Constructed locally; it reaches no network. */
  taskTarget(taskId: string): BrowserNotificationTargetRequest;
  /** Stop following one target. */
  unfollow(target: unknown): Promise<BrowserNotificationSubscriptionResult>;
}

/**
 * How the All Notifications page groups what it lists.
 *
 * **A closed union because the browser closes it, not because the schema does.**
 * `normalizeGroupingMode` answers `["client_project", "notification_type", "record_type"].includes(value)
 * ? value : "client_project"`, so every value that leaves this writer is one of the three - unlike
 * the wire vocabularies this estate leaves as `string`, which nothing on the browser side checks.
 */
export type BrowserNotificationGroupingMode = "client_project" | "notification_type" | "record_type";

/** The grouping payload `readGroupingPreferencesPayload` builds from the form. */
export interface BrowserNotificationGroupingPayload {
  groupingMode: BrowserNotificationGroupingMode;
}

/**
 * One row of the user-preference payload the form sends.
 *
 * **`id` is optional and its sibling contract's is not, and that asymmetry is the contract.**
 * This builder reads `row.dataset.notificationEventId` and neither defaults nor filters it, so a
 * row whose marker attribute is missing is sent with no id at all. `readWorkspaceDefaultsPayload`
 * defaults the same value to `""` and then drops the row. **Typing them alike would have hidden a
 * real difference between two builders that sit four lines apart.**
 */
export interface BrowserNotificationUserPreferencePayload {
  enabled: boolean;
  id: string | undefined;
}

/**
 * One row of the workspace-default payload the form sends.
 *
 * `id` is `string` because the builder defaults it with `|| ""` before filtering the empties out.
 * **The filter is not in the type**: TypeScript cannot say "non-empty string" without inventing a
 * brand, and inventing one here would claim a guarantee the estate does not otherwise keep.
 * `priority` is read straight from the select with a `"normal"` fallback and is **not** normalised
 * against a vocabulary, so it stays `string` where `groupingMode` does not.
 */
export interface BrowserNotificationWorkspaceDefaultPayload {
  enabled: boolean;
  id: string;
  priority: string;
}

/** What `renderPreferenceGroups` reads from its options. Every member is optional. */
export interface BrowserNotificationPreferenceGroupOptions {
  canManageWorkspaceDefaults?: unknown;
  emptyText?: unknown;
  headingLevel?: unknown;
  includeWorkspaceDefaults?: unknown;
  workspaceDefaultDisabled?: unknown;
}

/** What `renderGroupingPreferences` reads from its options. */
export interface BrowserNotificationGroupingOptions {
  workspaceType?: unknown;
}

/**
 * `LongtailForge.notificationPreferences`, published by
 * `public/js/shared/notification-preferences.js`.
 *
 * **One writer, one publication, eight members, closed.** The inventory reports no additive
 * publication and no second writer, so the object literal the writer assigns is the whole surface.
 *
 * **Three kinds of member, and the difference is the reason this surface took two checkpoints.**
 * `loadPreferences` crosses the network and returns the catalogue `0.33.33.38.4.10` narrowed. The
 * three `read*Payload` members cross no network at all - they read the DOM and construct outgoing
 * request bodies, which is why their contracts are published here rather than there. And the two
 * `save*` members resolve to `unknown` on purpose.
 */
export interface BrowserNotificationPreferences {
  /** The viewer's preference catalogue, narrowed by `0.33.33.38.4.10` before it is resolved. */
  loadPreferences(): Promise<BrowserNotificationPreferenceCatalog>;
  /** Build the grouping payload from the form. Reads the DOM; reaches no network. */
  readGroupingPreferencesPayload(container: Element | null): BrowserNotificationGroupingPayload;
  /** Build the user-preference payload from the form. Reads the DOM; reaches no network. */
  readUserPreferencesPayload(container: Element | null): BrowserNotificationUserPreferencePayload[];
  /** Build the workspace-default payload from the form. Reads the DOM; reaches no network. */
  readWorkspaceDefaultsPayload(container: Element | null): BrowserNotificationWorkspaceDefaultPayload[];
  /** Render the grouping control into a container. Returns nothing, and returns early without one. */
  renderGroupingPreferences(
    container: Element | null,
    groupingPreferences?: unknown,
    options?: BrowserNotificationGroupingOptions,
  ): void;
  /** Render the preference groups into a container. Returns nothing, and returns early without one. */
  renderPreferenceGroups(
    container: Element | null,
    events: unknown,
    options?: BrowserNotificationPreferenceGroupOptions,
  ): void;
  /**
   * Save the viewer's preferences.
   *
   * **`Promise<unknown>` is the contract, not an unfinished one.** `0.33.33.38.2.2.6.6.2` traced
   * both callers - `user-settings.js` and `notifications.js` - and each awaits this and discards
   * what it resolves to. Narrowing a body nobody reads would publish a promise the surface does
   * not make; `0.33.33.38.4.10` recorded the same finding from the boundary side.
   */
  saveUserPreferences(preferences: unknown, groupingPreferences?: unknown): Promise<unknown>;
  /** Save the workspace defaults. `Promise<unknown>` for the same traced reason. */
  saveWorkspaceDefaults(defaults: unknown): Promise<unknown>;
}

/**
 * One workspace a user belongs to, as `decorateUserWithMemberships` constructs it.
 *
 * Six members built by name from the membership row, so none is optional here.
 */
export interface BrowserUserWorkspaceMembership {
  createdAt: string;
  status: string;
  updatedAt: string;
  userWorkspaceId: string;
  workspaceId: string;
  workspaceName: string;
}

/**
 * What `GET /api/users` resolves to.
 *
 * **Two members reconstructed by name, and the actor identity is the session's own.**
 * `usersService.list` answers `currentUserId: session.user_id` beside the decorated list, so the
 * acting user is stated by the server rather than inferred by the browser from list membership -
 * and it is required, because a page that loses it loses every self-action restriction that
 * depends on knowing who is looking.
 *
 * `users` reuses `BrowserUserRecord`: this is the producer that record was drawn from, and it
 * already declares the `workspaceMemberships` the list paths decorate on. Reuse here is producer
 * identity, not shape similarity.
 */
export interface BrowserUserListResponse {
  /** `session.user_id`, so server-authoritative and never empty. */
  currentUserId: string;
  users: BrowserUserRecord[];
}

/**
 * One user as the user-administration routes return it.
 *
 * **Constructed, and that is what makes the omissions load-bearing.** `userRowToAppValue` in
 * `src/utils/normalizers.js` builds these fifteen members by name from the row
 * `USER_SELECT_COLUMNS` selects. That column list includes **`password`**, `home_workspace_id` and
 * `active_workspace_id`, and the shaper sends none of them. **This contract must never regain
 * them**: the select is not the response, and a browser record that named `password` would invite
 * a consumer to depend on something the server deliberately withholds.
 *
 * **Every text member has a total server-side fallback, and every one is still typed `string`.**
 * `themeMode` is light/auto/dark, `themeAutoSource` is always `system`, the two landing
 * preferences are dashboard/workbench/tasks/notes/lists, `preferredCalendarView` is day/week/month
 * or `null`, and `userStatus` is active/inactive. **The browser does not check any of them**, and
 * this estate has refused since `userPreferences` to declare a closed union over a wire field
 * nothing validates. The vocabularies are written down here instead.
 *
 * `altEmail` and `preferredCalendarView` are the two members the shaper genuinely nulls;
 * everything else is present and non-null on every path.
 */
export interface BrowserUserRecord {
  /** `null` when the account has no alternate address. */
  altEmail: string | null;
  /** Falls back to the username, so never empty. */
  displayName: string;
  openExternalLinksNewTab: boolean;
  passwordChangeRequired: boolean;
  /** `null` when the account has expressed no calendar preference. */
  preferredCalendarView: string | null;
  preferredLoginLanding: string;
  preferredWorkspaceSwitchLanding: string;
  protectedUser: boolean;
  themeAutoSource: string;
  themeMode: string;
  timezone: string;
  user_id: string;
  userStatus: string;
  username: string;
  /** Added by `decorateUserWithMemberships` on the list paths. */
  workspaceMemberships?: BrowserUserWorkspaceMembership[];
}

/**
 * What `POST /api/users` resolves to.
 *
 * **A mutation envelope, not a user record.** `usersService.create` answers four members, and
 * two of them are the halves `0.33.33.38.4.4.1` already narrowed: the account the route acted
 * on, and the workspace's list after it. This contract names all four and reuses that record for
 * both rather than describing a user twice.
 *
 * **`initialPassword` is a required member whose `""` means absent, and that is load-bearing.**
 * The service generates one **only** in the branch that creates a new account; attaching an
 * account that already existed leaves it the empty string it was initialised to. So emptiness is
 * the producer's way of saying "no credential was minted", and `accountCreated` is the flag that
 * says why - the two are read together by the consumer and must stay linked. Making the member
 * optional would turn a meaningful empty string into an absence and let a consumer treat the two
 * cases as one.
 *
 * The value is a genuine one-time credential and it is safe by construction upstream:
 * `usersRepository.create` returns a constructed record with no password or hash in it, so the
 * `user_created` audit entry stores none, and the browser writes the value to a panel it hides
 * whenever the value is empty.
 */
export interface BrowserUserCreationResult {
  /** `true` only when a new account was minted rather than an existing one attached. */
  accountCreated: boolean;
  /** The one-time credential, or `""` when no account was created. Never optional. */
  initialPassword: string;
  /** `null` when the body could not be vouched for; the route always echoes the account. */
  user: BrowserUserRecord | null;
  users: BrowserUserRecord[];
}

/**
 * One active session as `toManagedSession` reduces it for an administrator.
 *
 * **A deliberately reduced security projection, and the reduction is the point.** The row behind
 * it carries eight columns; this record answers five, and the one it never passes through is
 * `session_id` - which in this system **is the bearer credential**, the value
 * `buildSessionCookie` writes into the session cookie. So the browser is handed
 * `sessionReference` in its place, and `home_workspace_id`, `active_workspace_id`, `user_id` and
 * `updated_at` are withheld as well. **This contract must never regain any of them.**
 *
 * There is no token, hash or secret column on `sessions` to withhold: the identifier is the
 * credential, which is exactly why substituting a reference for it is the control.
 *
 * `ipAddress` is **not redacted**. The shaper coerces the nullable column to text and bounds it
 * at 128 characters, and an administrator holding `users.manage` is shown it so they can tell
 * one session from another; `""` means the column was empty, and the renderer says "IP
 * unavailable". Both timestamps are `string` because their columns are `NOT NULL`, though only
 * `createdAt` carries a defensive fallback in the shaper.
 */
export interface BrowserManagedSession {
  /** The column is `NOT NULL`; the shaper also falls back to `""`. */
  createdAt: string;
  /** The column is `NOT NULL` and the shaper passes it through unguarded. */
  expiresAt: string;
  /** Bounded to 128 characters, `""` when the column was empty. Shown, not redacted. */
  ipAddress: string;
  /** Computed by the server by comparing the stored id with the caller's own. */
  isCurrent: boolean;
  /**
   * An opaque 32-character handle for this session, suitable for sending back to the
   * revoke-one route, which resolves it server-side.
   *
   * **Not a session id, and deliberately not durable.** It is `HMAC-SHA-256` over the stored
   * identifier under a secret generated with `randomBytes(32)` at module load, base64url
   * encoded and truncated - so it is stable only for the life of the server process, and the
   * browser must treat it as a handle for the current interaction rather than a lasting id.
   */
  sessionReference: string;
}

/**
 * The account whose sessions are being managed, as `toTargetUser` reduces it.
 *
 * **Three members, and not a `BrowserUserRecord`.** That record is what the user-administration
 * list routes send; this is a header for one panel, built by its own shaper, and it carries no
 * status, preference or protection member. `displayName` falls back to the username, so it is
 * never empty.
 */
export interface BrowserManagedSessionUser {
  displayName: string;
  userId: string;
  username: string;
}

/**
 * What `GET /api/users/:userId/sessions` resolves to.
 *
 * **Both members are always sent**, so neither is optional. The list is scoped to the sessions
 * connected to the **caller's workspace** - `listForUserInWorkspace`, not every session the
 * account holds - which is what the panel's wording promises, and the contract does not widen
 * it to the account's sessions everywhere.
 */
export interface BrowserManagedSessionList {
  sessions: BrowserManagedSession[];
  user: BrowserManagedSessionUser;
}

/**
 * What both revocation routes resolve to.
 *
 * **One contract, because the two producers write the same literal.** `revokeManagedSession` and
 * `revokeManagedUserSessions` each end in `return { ok: true, revokedCount }`, so `ok` is the
 * literal `true` rather than a flag a caller has to test - a body that says anything else did not
 * come from these producers. The revoke-one route answers this too, although the browser awaits
 * that call without reading its body.
 */
export interface BrowserSessionRevocationResult {
  ok: true;
  revokedCount: number;
}

/**
 * How an attachment list was ordered, closed by the one `Set` the producer tests against and
 * falls back to.
 */
export type BrowserFileAttachmentSort = "filename" | "newest" | "oldest" | "size" | "status";

/**
 * The stored file behind an attachment, as `shapeAttachment` reconstructs it and
 * `shapeAttachmentForRead` extends.
 *
 * **Fifteen members, and the paired spellings are the producer's own.** `createdAt`/`created_at`,
 * `updatedAt`/`updated_at`, `deletedAt`/`deleted_at` and `uploadedByLabel`/`uploaded_by_label`
 * are each written twice by name, which is why both consumers may read either. This contract
 * reports that rather than choosing a favourite: dropping one spelling would break a reader the
 * producer deliberately supports.
 */
export interface BrowserFileAttachmentFile {
  /** `null` until the row records a creation time. */
  createdAt: string | null;
  /** The same value the producer also writes as `createdAt`. */
  created_at: string | null;
  /** `null` unless the file was deleted. */
  deletedAt: string | null;
  /** The same value the producer also writes as `deletedAt`. */
  deleted_at: string | null;
  displayName: string;
  extension: string;
  /** Coerced with `Number(... || 0)`, so always a number. */
  fileSizeBytes: number;
  mimeTypeDetected: string;
  originalFilename: string;
  scanStatus: string;
  status: string;
  /** `null` until the row records an update. */
  updatedAt: string | null;
  /** The same value the producer also writes as `updatedAt`. */
  updated_at: string | null;
  uploadedByLabel: string;
  /** The same value the producer also writes as `uploadedByLabel`. */
  uploaded_by_label: string;
}

/** What an attachment is attached to, resolved by label; `null` when the target is unreadable. */
export interface BrowserFileAttachmentTarget {
  id: string;
  label: string;
  type: string;
}

/**
 * The storage totals `summarizeStorageAccounting` reduces into.
 *
 * **All five always present, because they are the reduce's own seed.** The reducer starts from a
 * literal naming exactly these five at `0` and only ever adds to them, so none can be absent -
 * and a workspace with no files answers five real zeros rather than nothing.
 *
 * They are `number` and not "non-negative integer". The row shaper coerces each column with
 * `Number(column || 0)` and clamps nothing, so the honest runtime check is finiteness; the
 * external recorder does clamp its input, but this projection makes no such promise and the
 * contract describes the projection.
 */
export interface BrowserFileStorageAccountingTotals {
  externalFileCount: number;
  externalReportedBytes: number;
  /** Every entry's file count, internal and external together. */
  fileCount: number;
  internalBytes: number;
  internalFileCount: number;
}

/**
 * What `readStorageAccounting` answers, for both the settings body and the accounting route.
 *
 * **Named for the producer rather than for the page, because two routes share it exactly.**
 * `GET /api/files/storage/accounting` and the accounting member of the Files settings body are
 * the same function; only the `storageKind` filter differs, and that selects which rows are
 * summed rather than what the result looks like. Nothing in the browser reads the accounting
 * route today, so no runtime surface is published for it - only this declaration, ready.
 *
 * `entries` is the per-row breakdown, container-checked and no further: no browser consumer
 * reads into an entry, and this estate does not validate elements it does not read. A child
 * that renders the breakdown owns naming `shapeStorageAccountingRow`'s eleven members.
 */
export interface BrowserFileStorageAccounting {
  /** The per-row breakdown; `shapeStorageAccountingRow` owns its members. */
  entries: unknown[];
  totals: BrowserFileStorageAccountingTotals;
}

/**
 * What both `GET /api/files/settings` and `PUT /api/files/settings` resolve to.
 *
 * **One contract for two routes, and not because they merely share a member.** The save ends in
 * `return readWorkspaceFileSettings(session)` - it is the read, called again after the write, so
 * the two bodies cannot diverge without the read changing. Two members, reconstructed by name
 * with no spread, so the membership is exact.
 *
 * `settings` is declared present and left undescribed. It is a static nine-member reconstruction
 * that a later child can name, but **this page never reads it**: the form is built from
 * `/api/settings/catalog` and its values are collected back out of the DOM, so naming those nine
 * here would freeze a settings vocabulary this boundary has not earned.
 */
export interface BrowserWorkspaceFileSettingsResponse {
  accounting: BrowserFileStorageAccounting;
  /** `shapeWorkspaceFileSettings`'s nine members; unread by this page and unnamed here. */
  settings: unknown;
}

/**
 * One attachment as `GET /api/files/attachments` sends it.
 *
 * **Exact, although the producer spreads - because what it spreads is its own reconstruction.**
 * `shapeAttachmentForRead` spreads `shapeAttachment(attachment)`, which names every one of its
 * members by hand from the row, and then names eight more. That is the "total reconstruction"
 * case rather than the "spread of an untrusted body" case, so this contract is exact rather than
 * a structural minimum.
 *
 * The paired spellings continue here: `fileAttachmentId`/`file_attachment_id`,
 * `fileId`/`file_id`, and the three context labels are each written twice.
 */
export interface BrowserFileAttachment {
  attachmentRole: string;
  caption: string;
  clientId: string;
  clientLabel: string;
  /** The same value the producer also writes as `clientLabel`. */
  client_label: string;
  createdAt: string;
  file: BrowserFileAttachmentFile;
  fileAttachmentId: string;
  /** The same value the producer also writes as `fileAttachmentId`. */
  file_attachment_id: string;
  fileId: string;
  /** The same value the producer also writes as `fileId`. */
  file_id: string;
  moduleId: string;
  projectId: string;
  projectLabel: string;
  /** The same value the producer also writes as `projectLabel`. */
  project_label: string;
  /** `null` when the attachment is live. */
  removedAt: string | null;
  /** Coerced with `Number(... || 0)`, so always a number. */
  sortOrder: number;
  /** `null` when the target could not be resolved for this reader. */
  target: BrowserFileAttachmentTarget | null;
  targetId: string;
  targetLabel: string;
  /** The same value the producer also writes as `targetLabel`. */
  target_label: string;
  targetType: string;
  visibility: string;
}

/**
 * What `GET /api/files/attachments` resolves to.
 *
 * **Three members on both of the producer's paths.** The paginated branch and the
 * read-everything branch each answer `attachments`, `pagination` and `sort`, so there is one
 * contract rather than one per branch.
 *
 * `pagination` is `BrowserBoundedPagination` again - the **second** reuse of the contract
 * `0.33.33.38.4.8.1` named for `boundedPaginationEnvelope` rather than for one route. The Files
 * page reads only two of its seven members through a total normaliser of its own, and that
 * normaliser is left exactly as it was.
 */
export interface BrowserFileAttachmentList {
  attachments: BrowserFileAttachment[];
  pagination: BrowserBoundedPagination;
  sort: BrowserFileAttachmentSort;
}

/**
 * Where a pending workspace deletion has reached.
 *
 * Closed by the column itself: migration 077 adds
 * `CHECK (status IN ('pending_deletion', 'purging'))`, and the lifecycle summary falls back to
 * the first of those two. The browser validates it, which is what earns the union.
 */
export type BrowserWorkspaceDeletionStatus = "pending_deletion" | "purging";

/**
 * What the server decided a deletion request needs before it may proceed.
 *
 * Two words, and the producer chooses between them from **one** value: whether a backup inside
 * the recent window exists. The browser reports that decision and never re-makes it - the
 * window, the age test and the acknowledgement rule all stay server-owned.
 */
export type BrowserWorkspaceDeletionRequirement = "recent_backup" | "typed_acknowledgement_required";

/**
 * What the workspace's latest backup means for a deletion request.
 *
 * **Five members reconstructed by name, and the reduction is the point.** The backup record
 * behind it carries twelve - `backupId`, `archiveFilename`, `archiveSha256`, `createdByUserId`,
 * `appVersion`, `status`, `secureNotesRecoveryRequired` and the object counts among them - and
 * this summary passes through only the timestamp and the creator's label. **The archive name,
 * its digest, the backup identifier and the requester's id never reach the browser**, and this
 * contract must never regain them.
 *
 * `current`, `requirement` and the state's `acknowledgementPhrase` are all derived from the same
 * recency test, so they cannot disagree; the reader enforces that rather than trusting it.
 */
export interface BrowserWorkspaceDeletionBackup {
  /** `null` when the workspace has no backup at all. */
  createdAt: string | null;
  /** `null` when the workspace has no backup at all. */
  createdByName: string | null;
  /** Whether a backup inside the window exists. The server decides; the browser reports. */
  current: boolean;
  requirement: BrowserWorkspaceDeletionRequirement;
  /** The recency window in hours, a server constant. */
  windowHours: number;
}

/**
 * A pending deletion, as `toLifecycleSummary` reduces it.
 *
 * **Six members from a ten-member row, and the four it drops are the security boundary.** The
 * stored lifecycle carries `workspaceId`, `requestedByUserId`, `backupId`, `purgeStartedAt` and
 * **`purgeToken`**; the summary answers none of them. `backupProtected` is `Boolean(backupId)` -
 * the fact of a backup without its identifier - and the purge job's own state and token stay on
 * the server. **This contract must never regain any of them.**
 */
export interface BrowserWorkspaceDeletionLifecycle {
  /** Whether a backup covered the request, reported without naming which backup. */
  backupProtected: boolean;
  noCurrentBackupAcknowledged: boolean;
  /** When the grace period ends and the purge becomes eligible. */
  purgeAfter: string;
  requestedAt: string;
  requestedByName: string;
  status: BrowserWorkspaceDeletionStatus;
}

/**
 * A workspace backup package, as `toBrowserReceipt` builds it.
 *
 * **Eleven members reconstructed by name for two routes.** The read and the create both end in
 * this one shaper, so there is one receipt rather than a "latest" record and a "created" record
 * free to drift; `create` only adds the acting administrator's display name to the row first.
 *
 * `secureNotesKeyIncluded` and `status` are **constants the shaper writes literally**, not values
 * it discovers, so they are declared as the literals they are: this receipt never carries a
 * secure-notes key, and it only ever describes a package that was created.
 *
 * **The reduction is deliberate.** The stored export row also holds `backupId`, `workspaceId`,
 * `archiveFilename` and `createdByUserId`, and the shaper answers none of them. `archiveSha256`
 * *is* answered, and that is the intended contrast: the integrity digest of a package the
 * administrator just made is theirs to check, while the deletion summary that mentions the same
 * backup withholds it, because there it would name a file the reader is not being handed.
 */
export interface BrowserWorkspaceBackupReceipt {
  appVersion: string;
  /** The package's integrity digest, disclosed to the administrator who owns the package. */
  archiveSha256: string;
  createdAt: string;
  /** Falls back to "Workspace administrator", so never empty. */
  createdByName: string;
  /** `Number(...) || 0`, so a finite count rather than a stored value passed through. */
  fileObjectBytes: number;
  fileObjectCount: number;
  /** Built by the shaper from the timestamp, so never absent. */
  packageLabel: string;
  /** A constant: this receipt never carries a secure-notes key. */
  secureNotesKeyIncluded: false;
  secureNotesRecoveryRequired: boolean;
  /** A constant: a receipt only ever describes a package that was created. */
  status: "created";
  workspaceName: string;
}

/**
 * What both workspace backup routes resolve to.
 *
 * `null` is the **read's** answer for a workspace that has never been backed up. The create
 * route wraps the same member but always has a receipt to put in it, so a `null` from that
 * route would not have come from this producer.
 */
export interface BrowserWorkspaceBackupEnvelope {
  backup: BrowserWorkspaceBackupReceipt | null;
}

/**
 * The workspace's deletion state, as `toBrowserState` reconstructs it.
 *
 * **One record for three routes.** `read`, `request` and `cancel` all end in this same shaper,
 * so there is one contract rather than a read result, a request result and a cancel result with
 * identical members - and the lifecycle member, not an optional field, is what distinguishes the
 * states.
 *
 * `acknowledgementPhrase` is **required and nullable, and the null means something**: the server
 * answers `null` when a current backup already satisfies the prerequisite, and the phrase to
 * type when it does not. Making it optional would erase that distinction.
 *
 * `pending` is `Boolean(lifecycle)` from the same value the lifecycle member is built from, so
 * the two can never disagree - and the reader refuses a body where they do.
 */
export interface BrowserWorkspaceDeletionState {
  /** The phrase an administrator must type, or `null` when a current backup makes it needless. */
  acknowledgementPhrase: string | null;
  backup: BrowserWorkspaceDeletionBackup;
  /** `null` when no deletion is pending; the summary itself carries the pending state. */
  lifecycle: BrowserWorkspaceDeletionLifecycle | null;
  pending: boolean;
  /** The workspace's own name, from the workspace record. The browser never supplies it. */
  workspaceName: string;
}

/** What all three workspace-deletion routes resolve to. */
export interface BrowserWorkspaceDeletionEnvelope {
  deletion: BrowserWorkspaceDeletionState;
}

/** One scope a role may be assigned in, as `listAssignableRoleOptions` builds it. */
export interface BrowserRoleScope {
  label: string;
  scopeId: string;
}

/**
 * One assignable role as `GET /api/roles` returns it.
 *
 * **The four columns are the whole role query.** `readRoles` selects `role_id`, `role_name`,
 * `description` and `assignable_scope_type` and nothing else - **no permission storage, no
 * capability table, no override JSON** - so the browser record cannot expose any. `sort_order` is
 * selected for the `ORDER BY` and is not sent.
 *
 * `assignment_scope_type` and `scopes` are added by the service. **`scopes` is the permission
 * decision made visible**: the service asks `canAssignRole` per candidate and keeps only what the
 * caller may actually assign, so a role with no assignable scope never appears in this list at all.
 * Narrowing happens after that filtering and must never widen it.
 *
 * `assignable_scope_type` and `assignment_scope_type` both hold a scope vocabulary -
 * all/workspace/client/project - and both are typed `string`, because the browser validates
 * neither and this estate does not declare unions over unvalidated wire fields.
 */
export interface BrowserRoleOption {
  assignable_scope_type: string;
  assignment_scope_type: string;
  description: string;
  role_id: string;
  role_name: string;
  scopes: BrowserRoleScope[];
}

/**
 * One role assignment as `GET /api/users/:userId/role-assignments` returns it.
 *
 * **Constructed by `decorateAssignment`, seven members, and it is not the delegated record.**
 * The administrator view carries the assignment's identity, its client and project scoping, and
 * the parsed permission overrides. `permission_overrides` stays `unknown`: it is the override
 * storage this response deliberately parses for the assignment editor, and modelling its shape is
 * the permissions estate's work rather than this boundary's.
 *
 * `scope_id`, `client_id` and `project_id` are nullable columns the shaper passes through.
 */
export interface BrowserRoleAssignment {
  assignment_id: string;
  client_id: string | null;
  permission_overrides: unknown;
  project_id: string | null;
  role_id: string;
  scope_id: string | null;
  scope_type: string;
}

/**
 * One role assignment as the delegated paths return it.
 *
 * **Three members, and the difference from `BrowserRoleAssignment` is the contract.**
 * `decorateDelegatedAssignment` emits only `role_id`, `scope_type` and `scope_id` - no assignment
 * identity and **no permission overrides** - because a delegated manager may see which roles are
 * held in scopes they administer without seeing the assignment record behind them. Reusing the
 * administrator record here would claim four members the server withholds on purpose.
 */
export interface BrowserDelegatedRoleAssignment {
  role_id: string;
  scope_id: string | null;
  scope_type: string;
}

/**
 * What `PUT /api/users/:userId/role-assignments` resolves to.
 *
 * **`assignmentRevision` is genuinely optional, and the union is the producer's.**
 * `replaceUserAssignments` answers `{ assignments }` for a full administrator and
 * `{ assignmentRevision, assignments }` for a delegated manager, because only the delegated path
 * carries an optimistic-concurrency token. The consumer's `String(body.assignmentRevision || "")`
 * has always been reading that absence, not defending against a malformed field.
 */
export interface BrowserRoleAssignmentUpdate {
  assignmentRevision?: string;
  assignments: BrowserDelegatedRoleAssignment[];
}

/**
 * The account one `POST /api/users/lookup` matched.
 *
 * **Three members, and the omissions are the disclosure.** `lookupAddUserAccount` finds the
 * account with `usersRepository.readByUsername` - a *global* lookup, not a workspace-scoped one -
 * and then builds exactly `alreadyActive`, `displayName` and `username`. **No user identifier, no
 * account status, no workspace list, no alternate address**, so an administrator adding a user
 * learns that the address is taken and what it is called and nothing further. This contract
 * describes that permitted disclosure and must never broaden it.
 *
 * `alreadyActive` is a real boolean: the service computes `membership?.status === "active"` against
 * the *target* workspace, so it answers whether the account already belongs here rather than
 * whether the account is active anywhere. `displayName` runs through `normalizeDisplayName` with
 * the username as its fallback, so it is never empty.
 */
export interface BrowserAccountLookupMatch {
  alreadyActive: boolean;
  /** Falls back to the username, so never empty. */
  displayName: string;
  username: string;
}

/**
 * What `POST /api/users/lookup` resolves to.
 *
 * **`match` is always present and is `null` when nothing matched** - the service returns
 * `{ match: null, workspaceId }` from its no-match branch rather than omitting the member, so this
 * is a nullable member and not an optional one. `workspaceId` is the workspace the service
 * *resolved*, which is not necessarily the identifier the caller sent: `resolveAddUserWorkspace`
 * decides it, and the browser is told which one the answer is about.
 *
 * The route runs `assertPublicDemoCapabilityAllowed`, `resolveAddUserWorkspace` and
 * `assertWorkspaceCanAddUser` before any of this exists. Narrowing happens after that decision.
 */
export interface BrowserAccountLookup {
  match: BrowserAccountLookupMatch | null;
  workspaceId: string;
}

/**
 * The workspace member one `POST /api/role-assignments/lookup` matched.
 *
 * **This is not `BrowserAccountLookupMatch`, and the difference is authorization rather than
 * spelling.** `lookupDelegatedRoleAssignmentAccount` searches with
 * `readExactActiveMemberByUsername`, which joins `user_workspaces` and `workspaces` and requires
 * an *active* membership of the *caller's own* workspace - so this route can only ever identify
 * someone the caller already administers, where the account lookup searches every account in the
 * installation. Two routes, two disclosure rules, two records. The three columns that query
 * selects are `user_id`, `username` and `display_name`; there is no password, no status and no
 * verification state to leak here.
 *
 * `assignments` is reused from `BrowserDelegatedRoleAssignment` because the producer is literally
 * the same helper - `decorateDelegatedAssignment` - and the same `canAssignRole` filter runs per
 * assignment first, so a delegated manager sees only what they may administer. **The administrator
 * record must never stand in for it**, which is exactly what `0.33.33.38.4.4.3.1` established.
 *
 * `assignmentRevision` is the optimistic-concurrency token the delegated `PUT` requires: an
 * HMAC over the assignments the caller may manage, keyed by a server secret. It is a revision
 * stamp, not authentication material, and it is the same token `BrowserRoleAssignmentUpdate`
 * already carries.
 *
 * `activeMembership` is `boolean` rather than `true`. The service writes the literal, because the
 * record only exists when the membership query matched - but the browser never reads the member,
 * and this estate does not declare a type narrower than what a consumer actually validates.
 */
export interface BrowserAssignmentLookupTarget {
  /** Always `true` on the wire: the query matched an active member, or `match` is `null`. */
  activeMembership: boolean;
  assignmentRevision: string;
  assignments: BrowserDelegatedRoleAssignment[];
  /** Falls back to the username, so never empty. */
  displayName: string;
  userId: string;
  username: string;
}

/**
 * What `POST /api/role-assignments/lookup` resolves to.
 *
 * **One member, and there is no `workspaceId` beside it.** The account lookup tells the browser
 * which workspace it resolved; this route works only in the caller's own workspace and has nothing
 * to report. Declaring a shared envelope over the two would have invented a member for one of them.
 *
 * `match` is `null` on all three no-match paths - a username that is not a valid address, an
 * address with no active member, and the implicit case of neither - and the service never omits
 * the member, so this is nullable rather than optional.
 */
export interface BrowserAssignmentLookup {
  match: BrowserAssignmentLookupTarget | null;
}

/**
 * The billing contact a client record carries.
 *
 * **Eleven text members, all reconstructed with a total fallback**, so none is ever `null` and the
 * whole record is present even for a client that has entered no billing contact at all.
 */
export interface BrowserClientBillingContact {
  alternate_email: string;
  alternate_name: string;
  alternate_phone_number: string;
  city: string;
  email: string;
  name: string;
  phone_number: string;
  state: string;
  street_address_1: string;
  street_address_2: string;
  zip_code: string;
}

/**
 * A client as the create route sends it back.
 *
 * **This is the write-payload normaliser's output, not the read shaper's row.** The create service
 * answers `normalizeClientPayload(payload)`, which runs `normalizeClientProjectData` over a spread
 * of the caller's own body - so it carries `childScopeIds` and `projects`, and it carries **no
 * `created_at` or `updated_at`**, because nothing has been read back from the row.
 * `clientRowToAppClient` is a different producer for a different route, and deriving this record
 * from it was the mistake `0.33.33.38.4.6.1` had to correct against the live flow.
 *
 * Because the normaliser spreads the request payload, this is a **structural minimum**: every
 * member named here is reconstructed by name, and a body may legitimately carry more.
 *
 * `id` and `name` are non-empty on every successful response - the service throws 400 otherwise -
 * and `status` is a closed union because `normalizeClientStatus` answers one of two words on every
 * path. `billing_rate` is trimmed text or `null`; `billing_period` and `billing_rounding` are
 * `null` or another normaliser's record, so their shapes stay unnamed.
 *
 * **The five tag members are optional because the decorator genuinely omits them**, exactly as on
 * the task list: `decorateRecordsForTarget` returns its records untouched when the tags module is
 * not readable for the session.
 */
export interface BrowserClientRecord {
  billable: BrowserClientBillable;
  billing_contact: BrowserClientBillingContact;
  /** `null` when no billing period was given. */
  billing_period: unknown;
  /** Trimmed text, or `null` when unset. */
  billing_rate: string | null;
  /** `null` when no rounding was given. */
  billing_rounding: unknown;
  childScopeIds: unknown[];
  /** Non-empty: the service throws 400 without it. */
  id: string;
  /** Non-empty: the service throws 400 without it. */
  name: string;
  parent_client_id: string;
  /** Forced empty by the create path, which writes the client before any project. */
  projects: unknown[];
  status: BrowserClientStatus;
  workspace_id: string;
  /** Absent unless the tags module is readable for the session. */
  directTags?: unknown[];
  /** Absent unless the tags module is readable for the session. */
  effectiveTags?: unknown[];
  /** Absent unless the tags module is readable for the session. */
  propagatedTags?: unknown[];
  /** Absent unless the tags module is readable for the session. */
  tagAssignments?: unknown[];
  /** Absent unless the tags module is readable for the session. */
  tags?: unknown[];
}

/**
 * Where a project stands.
 *
 * Closed for the same reason the client status is: `normalizeStatus` answers `"Active"` for
 * anything it does not recognise and only ever those three words. A project can be completed;
 * a client cannot, which is why the two unions are separate.
 */
export type BrowserProjectStatus = "Active" | "Completed" | "Inactive";

/**
 * Whether a client is active.
 *
 * Closed because `normalizeClientStatus` answers `"Active"` for anything it does not recognise and
 * only ever those two words.
 */
export type BrowserClientStatus = "Active" | "Inactive";

/**
 * Whether a client or project is billable.
 *
 * Closed because `normalizeBillableFlag` returns one of two literals on every path, including its
 * fallback.
 */
export type BrowserClientBillable = "no" | "yes";

/**
 * A project as the create routes send it back.
 *
 * **Not a client record with a `client_id` added, and not the read shaper's row.**
 * `normalizeProjectPayload` normalises the payload through the same aggregate normaliser, then
 * re-overrides `client_id` and `parent_project_id` from the request. It carries `taskDefaults`
 * where the client carries `billing_contact` and `childScopeIds`, and like the client record it
 * has **no timestamps and no resolved `client_name`** - those belong to the read shaper.
 *
 * The same structural-minimum rule applies: the normaliser spreads the request payload, so a body
 * may legitimately carry more than these members.
 */
export interface BrowserProjectRecord {
  billable: BrowserClientBillable;
  /** `null` when no billing period was given. */
  billing_period: unknown;
  /** Trimmed text, or `null` when unset. */
  billing_rate: string | null;
  /** `null` when no rounding was given. */
  billing_rounding: unknown;
  client_id: string;
  /** Non-empty: the service throws 400 without it. */
  id: string;
  /** Non-empty: the service throws 400 without it. */
  name: string;
  parent_project_id: string;
  status: BrowserProjectStatus;
  /** Built by four further normalisers; the Tasks settings estate owns its shape. */
  taskDefaults: unknown;
  workspace_id: string;
  /** Absent unless the tags module is readable for the session. */
  directTags?: unknown[];
  /** Absent unless the tags module is readable for the session. */
  effectiveTags?: unknown[];
  /** Absent unless the tags module is readable for the session. */
  propagatedTags?: unknown[];
  /** Absent unless the tags module is readable for the session. */
  tagAssignments?: unknown[];
  /** Absent unless the tags module is readable for the session. */
  tags?: unknown[];
}

/**
 * What `POST /api/clients` resolves to.
 *
 * The service answers `{ client }` and nothing else. `null` is what the reader gives when it
 * cannot vouch for the record, which the caller turns into the same failure the raw
 * `result.client.id` read already produced for an absent client.
 */
export interface BrowserClientEnvelope {
  client: BrowserClientRecord | null;
}

/**
 * What `POST /api/projects` and `POST /api/clients/:clientId/projects` resolve to.
 *
 * Both routes reach the same service function and send the same envelope, so there is one contract
 * rather than one per route.
 */
export interface BrowserProjectEnvelope {
  project: BrowserProjectRecord | null;
}

/**
 * How a calendar subscription is scoped, as the private-feeds service sends it.
 *
 * Closed because the token row's `scope_type` column is typed to these three words on the server
 * and `toPublicSubscription` falls back to `"workspace"` when it is absent - so the shaper answers
 * one of the three on every path.
 */
export type BrowserCalendarScopeType = "client" | "project" | "workspace";

/**
 * Who owns a calendar subscription.
 *
 * Two text members, both with total fallbacks in the shaper: the display name falls through the
 * username to a fixed phrase, and the username to `""`.
 */
export interface BrowserCalendarSubscriptionOwner {
  displayName: string;
  username: string;
}

/** The scope a calendar subscription renders: a label the shaper resolves, and the closed type. */
export interface BrowserCalendarSubscriptionScope {
  label: string;
  type: BrowserCalendarScopeType;
}

/**
 * A calendar subscription as `toPublicSubscription` reconstructs it on every private-feeds route.
 *
 * **An exact reconstruction of eleven members, and it never carries the feed URL.** The shaper
 * names every member from the token row, so this is the same record the server declares as
 * `PrivateFeedPublicSubscription`, and a test pins the two together. The list route sends these
 * and nothing else; create and rotate send one beside the one-time secret, on
 * `BrowserCalendarSubscriptionSecret`; revoke answers only `{ removed, subscriptionId }`, which the
 * page discards.
 *
 * `status` stays text on purpose. The shaper answers the row's `status` column with a `"revoked"`
 * fallback, and the server's own contract keeps that column as `string` - closing it here would
 * claim a vocabulary the producer does not. `subscriptionId` is the token row's id, which the row
 * cannot lack; the four timestamps and the revocation reason are text or `null`, never absent.
 */
export interface BrowserCalendarSubscription {
  createdAt: string | null;
  name: string;
  ownedByCurrentUser: boolean;
  owner: BrowserCalendarSubscriptionOwner;
  revocationReason: string | null;
  revokedAt: string | null;
  rotatedAt: string | null;
  scope: BrowserCalendarSubscriptionScope;
  status: string;
  subscriptionId: string;
  timezone: string;
}

/**
 * What `GET /api/private-feeds/calendar-subscriptions` resolves to: the descriptors, and no URL.
 *
 * The server hashes each token's secret and stores only the hash, so this route **cannot**
 * reproduce a feed URL even if it wanted to - the list is metadata by construction.
 */
export interface BrowserCalendarSubscriptionList {
  subscriptions: BrowserCalendarSubscription[];
}

/**
 * What `POST /api/private-feeds/calendar-subscriptions` and `POST .../:subscriptionId/rotate`
 * resolve to, and **only** those two routes.
 *
 * `feedUrl` is the one-time secret: a URL carrying the raw token whose secret half the server
 * hashed before storing, so this response is the only time the browser will ever see it. That is
 * deliberate and documented - the page keeps it in memory, shows it once behind a reveal, and
 * clears it on `pagehide`; the route itself answers with `Cache-Control: no-store`. Naming the URL
 * here blesses an intended capability handoff, not leaked auth material.
 *
 * **This is a separate contract from the descriptor on purpose.** Putting an optional `feedUrl`
 * on `BrowserCalendarSubscription` would let a list element claim a secret it can never carry and
 * would erase the one distinction the security model rests on.
 */
export interface BrowserCalendarSubscriptionSecret {
  feedUrl: string;
  subscription: BrowserCalendarSubscription;
}

/**
 * What `GET /api/client-projects?view=options` resolves to.
 *
 * `readClientProjectOptions` writes `view` literally and builds both collections by hand, so the
 * envelope is exact. **Its elements are left as `unknown[]` deliberately.** The option records are
 * a cross-page vocabulary read by eleven pages, ten of them through
 * `clientProjectOptions.normalizeClients`, which is total over `unknown` and belongs to the shared
 * surface; the calendar page's own two normalisers are total as well. Naming the elements is the
 * work of whoever owns that surface, and it is recorded as later-owner debt rather than settled
 * here by a container check that would not have validated them anyway.
 */
export interface BrowserClientProjectOptionsBody {
  clients: unknown[];
  view: "options";
  workspaceProjects: unknown[];
}

/**
 * One project of a client, in the two members User Admin submits as a role scope.
 *
 * **A structural minimum, and deliberately so.** `projectOptionFields` sends eight members;
 * this names the two the role-scope picker relies on. The wider option record is the
 * cross-page vocabulary `BrowserClientProjectOptionsBody` records as later-owner debt, and
 * naming it here would settle that debt from the consumer that needs least of it.
 */
export interface BrowserUserAdminProjectScope {
  /** The `projects.id` primary key, submitted as `scope_id` on a project role assignment. */
  id: string;
  name: string;
}

/**
 * One client of the option body, in the members User Admin submits as a role scope.
 *
 * The same structural minimum as its projects, plus the nested collection: the picker walks
 * `projects` to build project scopes beneath each client.
 *
 * **There is no `isWorkspaceScope` member, and that is the point.** The shared
 * `clientProjectOptions.normalizeClients` prepends a synthetic client standing for the
 * workspace's own projects whenever `workspaceProjects` is non-empty. User Admin has never
 * offered that row as a role scope, and this contract describes what the **producer** sends
 * under `clients` rather than what that normaliser would build from the whole body.
 */
export interface BrowserUserAdminClientScope {
  /** The `clients.id` primary key, submitted as `scope_id` on a client role assignment. */
  id: string;
  name: string;
  projects: BrowserUserAdminProjectScope[];
}

/**
 * One workspace an administrator may assign membership in.
 *
 * **An exact reconstruction of five members.** `workspaceToAppValue` names all five and is
 * reached only from `readAssignableWorkspaces`, so this record belongs to this endpoint alone.
 * It is deliberately **not** any of the other workspace shapes in this file: those come from
 * different shapers, and matching member names is not producer identity.
 *
 * `workspaceType` is `string` rather than `BrowserWorkspaceType` for the same reason. The
 * `workspaces.workspace_type` column carries no `CHECK`, the query selects it raw and the
 * shaper copies it, so this producer closes nothing - and the page only ever compares the
 * value, never validates it. Closing the union here would promise a guarantee no one makes.
 *
 * Both owner members are nullable because the query reaches the username through a
 * `LEFT JOIN`, and a workspace need not have an owner at all.
 */
export interface BrowserAssignableWorkspace {
  ownerUserId: string | null;
  ownerUsername: string | null;
  /** The membership checkbox's value, submitted back as the workspace to join or leave. */
  workspaceId: string;
  workspaceName: string;
  workspaceType: string;
}

/**
 * `GET /api/workspaces`, behind `users.manage`.
 *
 * The service wraps the list by name, so the envelope is exact at one member. The list itself
 * is already filtered by the server: only `status = 'active'` workspaces, only those the
 * caller is a member of unless they are a super administrator, and only those where
 * `users.manage` holds in the target workspace. An empty list is therefore a real answer - it
 * means this administrator may assign membership nowhere - and the page says so.
 */
export interface BrowserAssignableWorkspaceList {
  workspaces: BrowserAssignableWorkspace[];
}

/**
 * One permission resource the server has decided this administrator may see.
 *
 * **An exact reconstruction of four members** by `normalizeResourceDefinition`, which trims
 * every string and de-duplicates the operations before answering.
 *
 * **`requiredPermissions` is absent because the producer does not send it.** The server reads
 * it to decide whether a resource is visible at all and then drops it; the catalog the browser
 * receives is already the answer to that question. The browser must not re-derive, widen or
 * hard-code it - module status, workspace terminology and permission filtering are all decided
 * server-side, and a resource missing from this list is missing on purpose.
 *
 * `moduleId` is `""` for a framework resource that belongs to no contributed module, which is
 * why it is the one member not required to carry text.
 */
export interface BrowserPermissionResource {
  key: string;
  label: string;
  moduleId: string;
  operations: string[];
}

/**
 * `GET /api/users/permission-resources`, behind `users.manage`.
 *
 * Exact at one member. **A resource that quietly disappeared between the wire and the matrix
 * would be worse than none arriving at all**: the permission grid would render without its
 * controls, and a default-denied resource would look deliberately unassigned rather than
 * unseen. So a catalog carrying one entry the browser cannot vouch for is refused whole.
 */
export interface BrowserPermissionResourceCatalog {
  resources: BrowserPermissionResource[];
}

/**
 * What kind of Support View event was recorded.
 *
 * Closed three times over: the `support_view_events.event_type` column carries a `CHECK` over
 * exactly these words, the server declares the same union, and every writer in the service
 * passes a literal from it. A proof pins all three to this one.
 */
export type BrowserSupportViewEventType = "action_attempt" | "entered" | "exited" | "expired" | "terminated";

/**
 * How a Support View event ended - closed by the same column `CHECK`, server union and literal
 * writers as the event type.
 */
export type BrowserSupportViewEventOutcome = "allowed" | "denied" | "disabled" | "expired" | "revoked" | "success";

/**
 * The state of the support session an event belongs to, joined in from `support_sessions.outcome`,
 * whose column `CHECK` and server union close it to these five.
 */
export type BrowserSupportViewSessionOutcome = "active" | "disabled" | "exited" | "expired" | "revoked";

/**
 * One Support View audit event as `toAuditEvent` reconstructs it for the operator.
 *
 * **An exact reconstruction of eleven members, and a deliberately narrow disclosure.** The query
 * behind it selects identifiers, timestamps and usernames; the shaper answers only readable
 * labels - `actorLabel` and `effectiveUserLabel` fall from display name to username to a fixed
 * phrase, and `workspaceName` has its own fallback - and never the user ids, the workspace id,
 * the event id, the request id, or the session's own timestamps. The stored `metadata_json` is
 * not even selected. Nothing about the request that produced the event - address, agent,
 * session - is stored on it in the first place, so there is nothing here to withhold.
 *
 * `reasonClass` stays text: action attempts pass an identifier-shaped token through
 * `normalizeAuditIdentifier`, and session ends write literal classes, so the vocabulary is open.
 * `reasonReference` is the operator's own stated reason, required and bounded at entry.
 */
export interface BrowserSupportViewAuditEvent {
  /** `""` when the event was not an action attempt. */
  actionId: string;
  actorLabel: string;
  effectiveUserLabel: string;
  eventType: BrowserSupportViewEventType;
  occurredAt: string;
  outcome: BrowserSupportViewEventOutcome;
  /** `""` when no class was recorded. */
  reasonClass: string;
  reasonReference: string;
  /** `""` when the event was not an action attempt. */
  routeId: string;
  sessionOutcome: BrowserSupportViewSessionOutcome;
  workspaceName: string;
}

/**
 * The bounded pagination envelope `boundedPaginationEnvelope` builds for seven list routes.
 *
 * **An exact reconstruction of seven members**, every one coerced by the helper itself: the four
 * integers through positive/non-negative normalisers, `hasMore` by a strict comparison,
 * `nextCursor` minted only when there is more and `""` otherwise, and `total` `null` when the
 * caller had no count. Named for the helper rather than for Support View so the audit log, files,
 * jobs, notifications and search reads can share it as each is narrowed.
 */
export interface BrowserBoundedPagination {
  hasMore: boolean;
  limit: number;
  maxPageSize: number;
  /** `""` when there is nothing further. */
  nextCursor: string;
  offset: number;
  returned: number;
  /** `null` when the producer had no total to give; the audit route always counts. */
  total: number | null;
}

/**
 * Where a runtime path sits relative to the deployment, and whether it had to be redacted.
 *
 * The three location shapers answer `data-dir` or `app-root` for a path inside the deployment
 * and fall through to `redactedPathLocation` otherwise, which is the only branch that sets
 * `redacted`.
 */
export type BrowserRuntimePathScope = "app-root" | "data-dir" | "outside-app-root";

/**
 * A filesystem path as diagnostics is allowed to describe it.
 *
 * **`display` is never the resolved path.** A path inside the data directory is shown against
 * a `<data-dir>` placeholder, one inside the application root against `./`, and anything else
 * is reduced to `<redacted>` plus its basename. So an administrator can tell where the
 * database or storage root lives without the response disclosing the host's directory layout.
 */
export interface BrowserRuntimePathLocation {
  display: string;
  redacted: boolean;
  relativeTo: BrowserRuntimePathScope;
}

/** Whether the safe reader reached its subject, or reported it unreachable. */
export type BrowserRuntimeHealthStatus = "ok" | "unavailable";

/**
 * How the configured file scanner answered.
 *
 * `safeScannerStatus` normalises the adapter's own word against a fixed set and falls back to
 * `ok`, `unavailable` or `unknown` from the availability flag, so no adapter can introduce a
 * sixth word here. `disabled` and `pass_through` are **real, healthy answers** for a
 * deployment that runs no scanner - they are not failures, and not malformed.
 */
export type BrowserScannerHealthStatus = "disabled" | "ok" | "pass_through" | "unavailable" | "unknown";

/** The database health the safe reader reports; `fileWritable` is false when it could not look. */
export interface BrowserRuntimeDatabaseHealth {
  fileWritable: boolean;
  status: BrowserRuntimeHealthStatus;
}

/**
 * The SQLite pragmas diagnostics reports.
 *
 * Every one is `null` or `""` when the health read threw, which is a real answer about an
 * unreachable database rather than a malformed body.
 */
export interface BrowserRuntimeSqliteDiagnostics {
  busyTimeoutMs: number | null;
  cacheSizeKib: number | null;
  foreignKeysEnabled: boolean;
  journalMode: string;
  mmapSizeBytes: number | null;
  synchronous: string;
  tempStore: string;
}

/** The database section: which provider, how healthy, its pragmas, and where its file lives. */
export interface BrowserRuntimeDatabaseDiagnostics {
  fileLocation: BrowserRuntimePathLocation;
  health: BrowserRuntimeDatabaseHealth;
  provider: string;
  sqlite: BrowserRuntimeSqliteDiagnostics;
}

/** Where the data directory lives, described the same safe way. */
export interface BrowserRuntimeDataDiagnostics {
  directoryLocation: BrowserRuntimePathLocation;
}

/**
 * The storage section.
 *
 * `rootLocation` is `null` for a provider that has no local root - an object store, say - and
 * that is the producer's own answer rather than a missing member.
 */
export interface BrowserRuntimeStorageDiagnostics {
  health: { available: boolean; status: BrowserRuntimeHealthStatus };
  provider: string;
  rootLocation: BrowserRuntimePathLocation | null;
}

/**
 * The scanner section.
 *
 * `available` is `boolean | null` because `booleanOrNull` reports "the adapter did not say"
 * as `null`, and `warning` is `""` when there is nothing to warn about.
 */
export interface BrowserRuntimeScannerDiagnostics {
  health: { available: boolean | null; status: BrowserScannerHealthStatus; warning: string };
  mode: string;
}

/**
 * What the in-process job worker reports about itself.
 *
 * **This is not `/api/jobs/status`.** These are process counters for the worker running in
 * this deployment; the Jobs Status readout counts durable rows in one workspace's queue. The
 * two share four words and nothing else, so `0.33.33.38.4.8.4`'s contracts are deliberately
 * not reused here.
 */
export interface BrowserRuntimeWorkerStatus {
  claimedCount: number;
  completedCount: number;
  deadCount: number;
  failedCount: number;
  lastClaimedCount: number;
  lastErrorAt: string | null;
  lastPollAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lockTtlSeconds: number;
  pollIntervalMs: number;
  registeredJobTypes: string[];
  running: boolean;
  startedAt: string | null;
  state: BrowserRuntimeWorkerState;
  stoppedAt: string | null;
  timerActive: boolean;
  workerId: string;
}

/** The four states the job runner's own status type declares. */
export type BrowserRuntimeWorkerState = "disabled" | "idle" | "running" | "stopped";

/** The worker section: how it is configured, and what it is doing. */
export interface BrowserRuntimeWorkerDiagnostics {
  mode: string;
  status: BrowserRuntimeWorkerStatus;
}

/** The deployment-shaped section, including whatever the configuration warned about at boot. */
export interface BrowserRuntimeEnvironmentDiagnostics {
  configurationWarnings: string[];
  deploymentMode: string;
  environment: string;
}

/**
 * `GET /api/runtime-diagnostics`, behind `workspace_settings.manage`.
 *
 * **Exactness is per producer level.** `read` reconstructs all eight sections by name and
 * spreads nothing, so the top level is exact; each section it builds is likewise reconstructed
 * member by member, which is also what absorbs provider extensibility - a storage or scanner
 * adapter may answer whatever it likes from `health()`, but only the members this service
 * names reach the browser, so the contract can be exact without freezing an adapter's
 * internals.
 *
 * **`app` and `features` are declared and left opaque on purpose.** Nothing on this path reads
 * them: the page renders the database, data, storage, scanner and worker sections and the
 * configuration warnings, and nothing else. `features` in particular is a thirty-odd member
 * public-demo budget and perimeter tree; naming it here would be publishing an exhaustive
 * projection for a producer with no browser consumer, which is what `0.33.33.38.4.2.1` refused
 * for the compatibility note list. A consumer, not the producer's generosity, earns a contract.
 */
export interface BrowserRuntimeDiagnostics {
  app: unknown;
  data: BrowserRuntimeDataDiagnostics;
  database: BrowserRuntimeDatabaseDiagnostics;
  features: unknown;
  runtime: BrowserRuntimeEnvironmentDiagnostics;
  scanner: BrowserRuntimeScannerDiagnostics;
  storage: BrowserRuntimeStorageDiagnostics;
  worker: BrowserRuntimeWorkerDiagnostics;
}

/**
 * The envelope the route wraps the readout in.
 *
 * An unreadable body is not a healthy deployment, and it is not an unconfigured one either.
 * `result.diagnostics || {}` had rendered every section as "Unavailable" through the same
 * formatter a genuinely unreachable database uses, which makes a response the page could not
 * parse indistinguishable from a server that looked and found nothing.
 */
export interface BrowserRuntimeDiagnosticsResponse {
  diagnostics: BrowserRuntimeDiagnostics;
}

/**
 * The four job states the Workspace Settings readout counts.
 *
 * `shapeStatusCounts` starts from this exact object with every count at zero and overwrites a
 * key only for a status it recognises, so all four are always present and a workspace with no
 * jobs really does report four zeros. **`completed` is deliberately absent**: the counting
 * query filters to these four, so a completed job is not something this readout counts.
 */
export interface BrowserJobStatusCounts {
  dead: number;
  failed: number;
  pending: number;
  running: number;
}

/**
 * The two states a recent-failure row can be in.
 *
 * The `jobs` column allows five, but `readRecentFailures` selects
 * `status IN ('failed', 'dead')`, so a row in this list cannot be pending, running or
 * completed. The browser validates that narrowing rather than re-deriving it.
 */
export type BrowserJobFailureStatus = "dead" | "failed";

/**
 * One failed or dead-lettered job, as `shapeFailureSummary` reconstructs it.
 *
 * **This is the safe observability projection, not the jobs row.** The query enumerates
 * fourteen columns by name, and the two it leaves behind are the ones that matter:
 * `payload_json`, which carries whatever the enqueuing caller put in it, and `dedupe_key`,
 * which is derived from job identity. Neither has a member here, and neither can acquire one
 * without changing the select.
 *
 * `lastError` is the failure message the worker recorded, whitespace-collapsed by `safeText`
 * and rendered as `textContent`. It is disclosed on purpose - a readout that says a job failed
 * without saying why is not observability - and it is the one member whose content the server
 * does not construct, so the durable secret-scanning owner covers it rather than this contract.
 *
 * The timestamps are `string | null` because the shaper maps an empty column to `null`, which
 * makes "never locked" and "locked at the empty string" the same answer.
 */
export interface BrowserJobFailureSummary {
  /** Non-negative: the `jobs` table constrains `attempt_count >= 0`. */
  attemptCount: number;
  availableAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  deadAt: string | null;
  jobId: string;
  jobType: string;
  /** Always a string, `""` when the worker recorded nothing usable. */
  lastError: string;
  lockedAt: string | null;
  lockedBy: string | null;
  /** Positive: the `jobs` table constrains `max_attempts > 0`. */
  maxAttempts: number;
  priority: number;
  status: BrowserJobFailureStatus;
  updatedAt: string | null;
}

/**
 * The bounded page of recent failures.
 *
 * `pagination` is `BrowserBoundedPagination` again - the **third** reuse of the contract
 * `0.33.33.38.4.8.1` named for `boundedPaginationEnvelope` rather than for one route, and this
 * producer calls that same helper.
 */
export interface BrowserJobRecentFailures {
  items: BrowserJobFailureSummary[];
  pagination: BrowserBoundedPagination;
}

/** What `readAdminReadout` answers behind `workspace_settings.manage`. */
export interface BrowserJobReadout {
  counts: BrowserJobStatusCounts;
  recentFailures: BrowserJobRecentFailures;
}

/**
 * `GET /api/jobs/status`.
 *
 * The route wraps the readout by name under `no-store`, so this envelope is exact at one
 * member. Reading it is not optional in the way an empty page is: a body this contract cannot
 * vouch for means the page does not know how much work has failed, which is the opposite of
 * what a zeroed readout would tell an administrator.
 */
export interface BrowserJobStatusResponse {
  jobs: BrowserJobReadout;
}

/**
 * A filter choice with a readable label: the actor, viewed-user and workspace queries each
 * select an id `AS value` beside a display name `AS label`.
 *
 * **The value is deliberately an identifier.** These are the only ids the audit response
 * discloses, and they exist so the operator can send them back as filter parameters.
 */
export interface BrowserSupportViewAuditFilterOption {
  label: string;
  value: string;
}

/**
 * A filter choice with no label: the event-type and outcome queries select `DISTINCT ... AS
 * value` and nothing else, and the page formats the value into a label itself.
 *
 * The server's own `SupportViewAuditOption` declares a `label` for all five collections; the two
 * queries behind these do not select one, and this boundary follows the query. That declaration
 * is the server's to correct, and the discrepancy is recorded rather than copied.
 */
export interface BrowserSupportViewAuditFilterValue {
  value: string;
}

/**
 * The five filter catalogues `readAuditFilterOptions` builds from the retained sessions and
 * events. Three are labelled, two are bare values, and the two vocabularies are kept apart.
 */
export interface BrowserSupportViewAuditFilterOptions {
  actors: BrowserSupportViewAuditFilterOption[];
  effectiveUsers: BrowserSupportViewAuditFilterOption[];
  eventTypes: BrowserSupportViewAuditFilterValue[];
  outcomes: BrowserSupportViewAuditFilterValue[];
  workspaces: BrowserSupportViewAuditFilterOption[];
}

/**
 * What `GET /api/support-view/audit` resolves to.
 *
 * **Reached only after authorization has chosen what may be disclosed.** `listAudit` requires
 * Support View to be enabled, a normal super-administrator session that is not itself in
 * Support View, and the `support_view.enter` permission, then prunes and filters to the
 * retention window before shaping. This contract describes what leaves that gate; it cannot
 * widen it.
 *
 * `retentionDays` and `exportLimit` are the service's own constants, sent so the page can state
 * the policy rather than assume it.
 */
export interface BrowserSupportViewAuditEnvelope {
  events: BrowserSupportViewAuditEvent[];
  exportLimit: number;
  filterOptions: BrowserSupportViewAuditFilterOptions;
  pagination: BrowserBoundedPagination;
  retentionDays: number;
}

/**
 * One workspace a Support View target may be viewed in, as `listTargets` builds it.
 *
 * **Exact: three members written by name** from a row the eligibility query already restricted
 * to active memberships of active workspaces. `label` and `workspaceName` are the same value
 * twice, kept because the producer writes both.
 */
export interface BrowserSupportViewTargetWorkspace {
  label: string;
  /** Non-empty: `start` refuses without it, so a blank one is not a choice. */
  workspaceId: string;
  workspaceName: string;
}

/**
 * A Support View target as `listTargets` reconstructs it.
 *
 * **A security-filtered summary, not a user record.** It is built by hand from five selected
 * columns - `user_id`, `username`, `display_name`, and the workspace pair - after a query that
 * admits only active users holding an active membership of an active workspace, and never the
 * actor themselves. `BrowserUserRecord` is a different producer describing a different thing,
 * and reusing it here would promise the browser a status, role, timestamps and preferences that
 * this route deliberately does not send.
 *
 * **This list is a picker, not an authorization.** `start` independently re-checks Support View
 * enablement, session mode, target-is-not-actor, `support_view.enter` for the chosen workspace,
 * the administrator's password, session freshness and a fresh eligibility row, so nothing named
 * here can widen who may actually be viewed.
 *
 * `label` is `displayLabel`'s output, either the username alone or `Display Name (username)`,
 * and is non-empty on every path.
 */
export interface BrowserSupportViewTarget {
  displayName: string;
  /** Non-empty: the shaper falls through to the username and then to a fixed phrase. */
  label: string;
  /** Non-empty: `start` refuses without it, so a blank one is not a choice. */
  userId: string;
  username: string;
  workspaces: BrowserSupportViewTargetWorkspace[];
}

/**
 * The administrator this page is being shown to, as `listTargets` names them from the session.
 *
 * **Exact: three members, and no capability, permission or session material.** `label` is the
 * operator's username, written twice by the producer.
 */
export interface BrowserSupportViewActor {
  label: string;
  userId: string;
  username: string;
}

/**
 * What `GET /api/support-view/targets` resolves to.
 *
 * Reached only through `assertOperator`: Support View enabled, a normal super-administrator
 * session that is not itself in Support View, and the `support_view.enter` permission.
 *
 * `expiresInSeconds` is the deployment's configured session lifetime - a single number read
 * from `config.supportView.ttlSeconds`, bounded to 60-3600 - and **not** a catalogue of
 * durations the operator may choose between. It is a top-level policy value rather than a
 * member of any target, because the producer sends it that way.
 */
export interface BrowserSupportViewTargetEnvelope {
  /** `null` only when the body could not be vouched for; the route always sends it. */
  actor: BrowserSupportViewActor | null;
  expiresInSeconds: number;
  targets: BrowserSupportViewTarget[];
}

/**
 * One audit log entry, exactly as `searchForScope` selects it.
 *
 * **Fifteen columns, straight from the table: this route has no shaper.** Six are `NOT NULL` and
 * nine are nullable, and the contract follows the schema column for column rather than the
 * renderer, which coerces every one of them to text for display.
 *
 * **What it deliberately discloses.** `ip_address` is the address the writer recorded for the
 * acting session, and the page renders it: this is an administrative audit surface behind
 * `audit_logs.view`, and the address is the point of several of its entries. The three `_json`
 * members are the writer's snapshots. They are safe by construction rather than by filtering
 * here: every value snapshot in the estate is built from a whitelist shaper - `userRowToAppValue`
 * names fifteen profile members and no password column - or from a hand-written literal, and the
 * password-reset entry records only a timestamp. Nothing narrows them at read time, so nothing
 * may be assumed about them at read time either.
 *
 * `action`, `change_type` and `record_type` stay text: the writer normalises them but the
 * columns carry no `CHECK`, the record type has an `allowUnknown` path, and the security stream
 * writes its own action names.
 */
export interface BrowserAuditLogEntry {
  action: string;
  /** `null` for an entry no signed-in actor produced. */
  actor_user_id: string | null;
  /** `null` when the writer had no username to record. */
  actor_user_name: string | null;
  audit_id: string;
  change_type: string;
  created_at: string;
  /**
   * The address recorded for the acting session, or `null`. Deliberately disclosed to an
   * administrator holding `audit_logs.view`; it is not redacted and this contract does not
   * pretend otherwise.
   */
  ip_address: string | null;
  /**
   * `JSON.stringify` of whatever the writer passed as metadata, or `null`.
   *
   * **A JSON string, not a record.** Typing it as an object would promise a shape no producer
   * agrees on - every caller passes its own - and would invite reading fields out of a snapshot
   * that exists to be displayed, not queried.
   */
  metadata_json: string | null;
  /** `JSON.stringify` of the writer's before-snapshot, or `null`. A JSON string, not a record. */
  previous_value_json: string | null;
  /** `JSON.stringify` of the writer's after-snapshot, or `null`. A JSON string, not a record. */
  new_value_json: string | null;
  record_id: string | null;
  record_label: string | null;
  record_type: string;
  record_url: string | null;
  workspace_id: string;
}

/**
 * One audit filter choice, as the audit service's four option builders write it.
 *
 * **Not `BrowserSupportViewAuditFilterOption`**, which two members happen to match: that one is
 * built by the Support View repository from support sessions, this one by four separate builders
 * over users, clients, projects and workspaces. Same shape, different producers, so the same
 * rule that kept three client vocabularies apart keeps these apart.
 */
export interface BrowserAuditFilterOption {
  label: string;
  value: string;
}

/**
 * The six filter catalogues `list` assembles.
 *
 * Two vocabularies again, and they differ from the Support View audit's: here the record and
 * change types are **bare strings** mapped straight off `SELECT DISTINCT` rows, while the four
 * labelled catalogues are `{ label, value }` records. `workspaces` is empty unless the caller is
 * a super administrator, and `clients` is empty outside a business workspace - both are producer
 * decisions this contract reports rather than makes.
 */
export interface BrowserAuditFilterOptions {
  changeTypes: string[];
  clients: BrowserAuditFilterOption[];
  projects: BrowserAuditFilterOption[];
  recordTypes: string[];
  users: BrowserAuditFilterOption[];
  workspaces: BrowserAuditFilterOption[];
}

/**
 * What `GET /api/audit-logs` and `GET /api/security-events` resolve to.
 *
 * One service answers both: `listSecurityEvents` calls `list` with `securityOnly`, so the
 * envelope is identical and there is one contract rather than two named after two routes. The
 * audit route requires `audit_logs.view` on the caller's workspace; the security route adds its
 * own administrator check; and `resolveAuditWorkspaceScope` refuses any workspace but the
 * caller's own unless they are a super administrator.
 *
 * `pagination` is the same `boundedPaginationEnvelope` record `0.33.33.38.4.8.1` published for
 * the Support View audit - the first reuse of that contract, and the reason it was named for the
 * helper rather than for one route.
 */
export interface BrowserAuditLogEnvelope {
  auditLogs: BrowserAuditLogEntry[];
  filterOptions: BrowserAuditFilterOptions;
  pagination: BrowserBoundedPagination;
  /** The scope the service resolved: a workspace id, or `"all"` for a super administrator. */
  workspaceId: string;
}

/**
 * How the interface picks its palette. `normalizeThemeMode` answers one of these three on every
 * path, falling back to `"light"`.
 *
 * **Closed here although `BrowserUserRecord` leaves the same value open, and the difference is
 * the check.** That record wrote the vocabulary down in prose and kept `string`, because this
 * estate refuses to declare a closed union over a wire field nothing validates. This boundary
 * validates it: `readUserSettingsProfile` refuses a response whose theme mode is not one of
 * these words. Same rule, applied where the check now exists.
 */
export type BrowserUserThemeMode = "auto" | "dark" | "light";

/**
 * What an automatic theme follows. A single literal, because `normalizeThemeAutoSource` answers
 * `"system"` on **every** path including its fallback - there is no second source yet, and the
 * contract says so rather than implying a choice the producer cannot make.
 */
export type BrowserUserThemeAutoSource = "system";

/** Where a sign-in or a workspace switch lands, closed by `normalizeUserLandingPage`. */
export type BrowserUserLandingPage = "dashboard" | "lists" | "notes" | "tasks" | "workbench";

/** Which calendar span the account prefers, closed by `normalizeCalendarViewPreference`. */
export type BrowserUserCalendarView = "day" | "month" | "week";

/**
 * The account's own settings, as both `GET` and `PUT /api/user/settings` send them.
 *
 * **Ten members, and the two routes agree by construction rather than by coincidence.**
 * `readSettings` copies them out of `userRowToAppValue`; `saveSettings` rebuilds them from the
 * request through **the same normalisers** - `normalizeThemeMode`, `normalizeThemeAutoSource`,
 * `normalizeUserLandingPage`, `normalizeCalendarViewPreference`, `normalizeBooleanPreference`
 * and the profile normaliser. A proof pins both routes to that shared list so they cannot drift.
 *
 * **This is not a `BrowserUserRecord`.** That record is fifteen members from the
 * user-administration routes and carries `user_id`, `userStatus`, `protectedUser` and
 * `passwordChangeRequired`, none of which this route sends; this one is the ten an account may
 * see and change about itself. Ten scalars are common to both, and the vocabularies agree.
 */
export interface BrowserUserSettingsProfile {
  /** `null` when the account has no alternate address. */
  altEmail: string | null;
  /** Falls back to the username, so never empty. */
  displayName: string;
  openExternalLinksNewTab: boolean;
  /** `null` when the account has expressed no preference. */
  preferredCalendarView: BrowserUserCalendarView | null;
  preferredLoginLanding: BrowserUserLandingPage;
  preferredWorkspaceSwitchLanding: BrowserUserLandingPage;
  themeAutoSource: BrowserUserThemeAutoSource;
  themeMode: BrowserUserThemeMode;
  /** Falls back to the deployment default, so never empty. */
  timezone: string;
  username: string;
}

/** How this deployment is run, closed by the one comparison `readWorkspaceCreationOptions` makes. */
export type BrowserWorkspaceInstallMode = "saas" | "self_hosted";

/**
 * A kind of workspace an account may create, closed because the producer starts from a literal
 * list of these three and only ever filters it.
 */
export type BrowserWorkspaceType = "business" | "family" | "personal";

/**
 * One workspace kind the account may create right now.
 *
 * **Exact: four members**, built for each type that survived the install-mode, entitlement and
 * per-user permission filters. `moduleSettings` is left `unknown[]`: it comes from
 * `readWorkspaceCreationModuleSettings`, which **spreads** each module's own definition, so its
 * members belong to the contributing module rather than to this response - the same reason the
 * Workbench contribution contract promises only an identity.
 */
export interface BrowserWorkspaceCreationType {
  /** `""` when the type declares no suggested name. */
  defaultName: string;
  label: string;
  /** Each module's own settings definition, spread; its vocabulary is the module's to name. */
  moduleSettings: unknown[];
  workspaceType: BrowserWorkspaceType;
}

/**
 * Whether and what this account may create, as `readWorkspaceCreationOptions` reports it.
 *
 * **The server has already decided.** `availableTypes` is empty when creation is disabled for
 * the deployment, when the account lacks the permission, or when a hosted entitlement does not
 * cover the type - so an empty list is a real answer and the page simply hides its form. The
 * two flags are reported beside it, never combined into one by the browser.
 */
export interface BrowserWorkspaceCreationOptions {
  availableTypes: BrowserWorkspaceCreationType[];
  canCreateWorkspaces: boolean;
  installMode: BrowserWorkspaceInstallMode;
  workspaceCreationEnabled: boolean;
}

/**
 * One workspace the account belongs to, as `readForUser` selects it.
 *
 * **Four columns, snake_case, straight from the query** - this is a row, not a shaped record,
 * which is why it is not `BrowserUserWorkspaceMembership`: that one is six camelCase members
 * built by `decorateUserWithMemberships` for the administration routes. Neither `status` nor
 * `workspace_type` carries a column `CHECK`, so both stay text.
 */
export interface BrowserUserSettingsWorkspace {
  status: string;
  workspace_id: string;
  workspace_name: string;
  workspace_type: string;
}

/**
 * What `GET /api/user/settings` resolves to: the account's own settings plus what it may do.
 *
 * **The profile ten, and four more that only the read sends.** The save answers the ten alone,
 * so this extends that contract rather than repeating it or making four members optional on one
 * record - the difference between the routes is real and is expressed as the difference.
 *
 * `canEnterAccountExportRecovery` is a **server permission result**, not a browser decision:
 * `isWorkspaceAdministrator` computes it and the route sends it on every response. The browser
 * reports it; it can never manufacture it, and nothing here widens who may recover an account.
 */
export interface BrowserUserSettings extends BrowserUserSettingsProfile {
  /** The account's current workspace; the session's active workspace, or its own. */
  activeWorkspaceId: string;
  /** A permission result the server computed. The browser reports it and never decides it. */
  canEnterAccountExportRecovery: boolean;
  workspaceCreation: BrowserWorkspaceCreationOptions;
  workspaces: BrowserUserSettingsWorkspace[];
}

/**
 * What `DELETE /api/user/workspaces/:workspaceId` answers when the account has just left its
 * **last** active workspace.
 *
 * The service revokes every session for the account and answers this instead of a workspace
 * list, and the page leaves for the recovery sign-in. `accountExportRecovery` is the literal
 * `true` the producer writes; `activeWorkspaceId` is `null` because there is no longer one.
 */
export interface BrowserAccountExportRecoveryResult {
  accountExportRecovery: true;
  activeWorkspaceId: null;
  workspaces: BrowserUserSettingsWorkspace[];
}

/**
 * What that route answers on the ordinary path: the workspace the account is left on, and the
 * memberships it still holds.
 *
 * **`accountExportRecovery` is absent, not `false`** - the producer omits the member entirely,
 * and `?: never` says so, which is what lets the two results be told apart by their own shapes
 * rather than by a flag the browser has to interpret.
 */
export interface BrowserWorkspaceMembershipResult {
  accountExportRecovery?: never;
  activeWorkspaceId: string;
  workspaces: BrowserUserSettingsWorkspace[];
}

/**
 * The two answers that route genuinely has.
 *
 * Modelled as a union rather than one record with optional members, because the producer really
 * does return two different shapes and flattening them would let a consumer read a workspace
 * list off the recovery answer, which is always empty.
 */
export type BrowserWorkspaceRemovalResult =
  | BrowserAccountExportRecoveryResult
  | BrowserWorkspaceMembershipResult;

/**
 * An API key as the workspace list sends it: the nine columns `readAll` selects by name, with
 * the key's scopes attached.
 *
 * **Exact, and it never carries the hash.** The repository lists its columns explicitly and
 * `key_hash` is not among them, so the list is metadata by construction. This is a different
 * record from `BrowserApiKeyRecord`: the list discloses `created_by_user_id` and the public
 * shaper does not, and the two are kept apart rather than merged with an optional member.
 *
 * `status` stays text: the service writes `"active"` and `"revoked"`, but the column carries
 * no `CHECK` and the server's own row type keeps it open.
 */
export interface BrowserApiKeyListEntry {
  api_key_id: string;
  created_at: string;
  created_by_user_id: string;
  key_prefix: string;
  /** `null` until the key is first used. */
  last_used_at: string | null;
  name: string;
  /** `null` until the key is revoked. */
  revoked_at: string | null;
  scopes: string[];
  status: string;
  workspace_id: string;
}

/**
 * An API key as `toPublicApiKey` reconstructs it beside a create or revoke result.
 *
 * **An exact reconstruction of nine members**: the list entry without its creator, and never
 * the hash or the raw key. The same shaper feeds the audit trail's before-and-after values, so
 * what the browser sees here is also what the audit log records.
 */
export interface BrowserApiKeyRecord {
  api_key_id: string;
  created_at: string;
  key_prefix: string;
  last_used_at: string | null;
  name: string;
  revoked_at: string | null;
  scopes: string[];
  status: string;
  workspace_id: string;
}

/**
 * One API scope the workspace may grant, as `listAvailableApiScopes` builds it from the
 * enabled modules' catalogue entries.
 *
 * **Exact: six members written by name** after enablement, workspace-type and public-demo
 * filtering. `id` and `scope` are the same value twice, kept because the producer writes both.
 * `access` stays text: the registry answers a declared `access` when a module gives one and
 * derives `"read"` or `"write"` from the scope's suffix otherwise, so the declared path is open.
 */
export interface BrowserApiScope {
  access: string;
  description: string;
  id: string;
  label: string;
  moduleId: string;
  scope: string;
}

/**
 * What `GET /api/api-keys` resolves to, and the two members every API key route shares.
 *
 * Reached only through `workspace_settings.manage`; `list` reads it, `create` and `revoke`
 * re-read it after their write so the page can re-render without a second request.
 */
export interface BrowserApiKeyCollection {
  apiKeys: BrowserApiKeyListEntry[];
  availableScopes: BrowserApiScope[];
}

/**
 * The one-time secret `POST /api/api-keys` answers, and nothing else answers.
 *
 * `rawKey` is minted from twenty-four random bytes, hashed with SHA-256 before it is stored,
 * and its first seventeen characters kept as the display prefix; the audit trail records only
 * that prefix. So this response is the only time the raw key exists outside the caller's
 * hands, which is why it is named here and forbidden, by proof, from the list entry and the
 * public record.
 */
export interface BrowserApiKeySecret {
  apiKey: BrowserApiKeyRecord;
  rawKey: string;
}

/** What `POST /api/api-keys` resolves to: the secret beside the re-read collection. */
export type BrowserApiKeyCreation = BrowserApiKeyCollection & BrowserApiKeySecret;

/**
 * What `PUT /api/api-keys/:apiKeyId/revoke` resolves to: the revoked record beside the re-read
 * collection, and **no raw key** - a revoked key has nothing left to hand over.
 */
export interface BrowserApiKeyRevocation extends BrowserApiKeyCollection {
  apiKey: BrowserApiKeyRecord;
}

/**
 * One module's state as the Workbench bootstrap reports it.
 *
 * **An exact reconstruction of three members.** `buildModuleStateMap` builds this for every module
 * the workspace context returned, keyed by module id, and names all three - so unlike most of this
 * bootstrap it can be described precisely.
 *
 * `enabled` and `status` are two spellings of one decision: the shaper writes
 * `moduleDefinition.status === "enabled"` for the boolean and the matching word for the text, so
 * they cannot disagree. `displayName` falls back through the module's name to its id, so it is
 * never empty.
 */
export interface BrowserWorkbenchModuleState {
  /** Falls back through the module name to its id, so never empty. */
  displayName: string;
  enabled: boolean;
  status: BrowserWorkbenchModuleStatus;
}

/**
 * The two words `buildModuleStateMap` writes.
 *
 * Closed because the shaper writes a literal on both branches of one comparison; nothing here is a
 * column passing through.
 */
export type BrowserWorkbenchModuleStatus = "disabled" | "enabled";

/**
 * One module contribution as the Workbench registry carries it.
 *
 * **A one-member guarantee, and that is the honest size of it.** `normalizeContribution` spreads
 * the contribution a module declared in its own `module.js` and overrides only `moduleId`.
 * Everything else - renderer, label, sort order, actions - is that module's declaration, so the
 * framework's extensibility contract owns those shapes rather than this response boundary. Naming
 * them here would freeze one module's vocabulary into every module's contract.
 *
 * **Contributions arrive already filtered, twice.** `listWorkspaceContributions` drops any whose
 * module is disabled, whose requirements are unavailable, or whose required permissions the caller
 * lacks; `filterPublicDemoContributionActions` then removes individual actions a public demo may
 * not offer. The browser describes what survived both and must never try to restore either.
 */
export interface BrowserWorkbenchContribution {
  moduleId: string;
}

/**
 * The three contribution lists the Workbench bootstrap sends as its registry.
 *
 * **`registry` and `modules` are not two names for one thing.** This is a fixed three-member
 * record of contribution lists; `modules` is a map keyed by module id holding enablement state.
 * One says what the workspace's modules *offer*, the other says which are *on*.
 */
export interface BrowserWorkbenchRegistry {
  timerSources: BrowserWorkbenchContribution[];
  workbenchCards: BrowserWorkbenchContribution[];
  workItemSources: BrowserWorkbenchContribution[];
}

/**
 * What `GET /api/workbench/bootstrap` resolves to.
 *
 * **Three of its seven members are constants, and the producer says so in its own source.**
 * `taskOptions` is literally `null`, `timers` and `workCandidates` are literally `[]`, and a
 * comment beside them records that the fifty-candidate bootstrap computation was removed once the
 * browser began resolving candidates from `/api/workbench/focus-candidates` and the task detail
 * read. The Workbench's `sourceData.taskOptions || bootstrap.taskOptions` has therefore been
 * reading a member that is always absent, and this contract states that rather than implying a
 * catalog arrives here. **No Task option contract is reused, because none is sent.**
 *
 * `currentUserId` is `session.user_id` and is always text.
 *
 * **`modules` and `registry` are nullable here even though the route always sends them.** The
 * producer builds both unconditionally, but the reader answers `null` for anything it cannot vouch
 * for, and each Workbench read already had its own fallback - the cached registry for one, the
 * module map it is holding for the other. Preserving those fallbacks is why the members are
 * nullable rather than the reader inventing an empty registry.
 */
export interface BrowserWorkbenchBootstrap {
  currentUserId: string;
  /** `null` when the map cannot be vouched for; the route itself always sends one. */
  modules: Record<string, BrowserWorkbenchModuleState> | null;
  /** `null` when the registry cannot be vouched for; the route itself always sends one. */
  registry: BrowserWorkbenchRegistry | null;
  /** Always `null` on this route: the catalog reaches the page from its own producer. */
  taskOptions: null;
  /** Always empty on this route. */
  timers: unknown[];
  /** Always the empty string on this route. */
  workCandidateMode: string;
  /** Always empty on this route: candidates load from `/api/workbench/focus-candidates`. */
  workCandidates: unknown[];
}

/**
 * The resume context both task-timer producers reconstruct.
 *
 * **Twelve members, built identically by three shapers.** `timerToTaskTimer` builds it from the
 * repository row, `shapeTimerPayload` builds it from the unified active timer, and
 * `taskTimerFromUnified` rebuilds it again over that - every one of them naming all twelve, with
 * the same fallbacks and the same `"running"`-or-`"paused"` normalisation.
 *
 * `lastActiveStartTime` is the one nullable member: a paused timer has no active start.
 */
export interface BrowserTaskTimerResumeContext {
  accumulatedElapsedSeconds: number;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  sourceId: string;
  sourceLabel: string;
  sourceModuleId: string;
  sourceType: string;
  sourceUrl: string;
  /** `null` while the timer is paused. */
  lastActiveStartTime: string | null;
  timerStatus: BrowserTaskTimerStatus;
}

/**
 * The two states every task-timer producer normalises to.
 *
 * Closed because all three shapers write `timer.timer_status === "running" ? "running" : "paused"`;
 * nothing reaches the browser unnormalised.
 */
export type BrowserTaskTimerStatus = "paused" | "running";

/**
 * Whether a task timer's time is billable.
 *
 * Closed for the same reason: `row.billable === "no" ? "no" : "yes"` at the repository, and the
 * list shaper repeats it. A workspace-level normaliser runs before the row is written.
 */
export type BrowserTaskTimerBillable = "no" | "yes";

/**
 * One active manual timer, as far as the list boundary promises it.
 *
 * **A deliberate structural minimum, not a description of the record.** `shapeTimerPayload`
 * answers `{ ...timer, source_label, source_url, resumeContext, resume_context }` - a spread of
 * the repository row, so the browser cannot claim the shape is closed. What it *can* claim is
 * the one member both list consumers rely on and the producer genuinely guarantees: the column
 * is `TEXT NOT NULL`, the row mapping runs it through `textParam`, and every writer goes through
 * `normalizeTimerSlot`, which throws on an empty slot.
 *
 * **The source label and URL are deliberately absent.** The producer blanks them when the timer's
 * source is unreadable, which is a permission decision this boundary must not become the owner
 * of; a contract that does not promise them cannot weaken them. `resumeContext` is left out for
 * the same reason in a different key: it belongs to the resume workflows, not to slot occupancy.
 *
 * A record satisfying this type carries the rest of the row at runtime. The narrowing is of the
 * type surface, not of the payload.
 */
export interface BrowserActiveTimerSlotRecord {
  /** Non-empty: `TEXT NOT NULL`, and `normalizeTimerSlot` refuses an empty one on every write. */
  timer_slot: string;
}

/**
 * What `GET /api/active-timers` resolves to.
 *
 * One member, reconstructed by name. The route reaches `activeTimersRepository.readAll`, which
 * is the **manual-timer** producer - `readAllBySource(..., { sourceType: "manual" })` - and not
 * the all-work-timers list its sibling route answers.
 */
export interface BrowserActiveTimerList {
  timers: BrowserActiveTimerSlotRecord[];
}

/**
 * One task timer, in the shape **both** producers guarantee.
 *
 * **The two paths are not built the same way, and that asymmetry is the reason this contract is a
 * guaranteed minimum rather than an exact record.** `GET /api/tasks/timers` reaches
 * `timerToTaskTimer`, which reconstructs all twenty-five members by name. The save and link routes
 * reach `taskTimerFromUnified`, which **spreads** the unified active timer and overrides eleven -
 * and what it spreads has already been through `shapeTimerPayload`, which spreads again over
 * `activeTimerRowToAppValue`.
 *
 * Every member named here is nevertheless guaranteed on both paths: eleven because the task shaper
 * overrides them, two more because `shapeTimerPayload` does, and the rest because
 * `activeTimerRowToAppValue` is itself a total reconstruction that normalises `billable` and
 * `timer_status` exactly as the list shaper does. **A structural interface does not claim that no
 * other property exists**, which is what lets this describe the spread path honestly.
 *
 * **`timer_slot` is deliberately absent.** The mutation path carries it through the spread and the
 * list path never emits it, so it is not a common guarantee; naming it would freeze an incidental
 * extra into browser vocabulary. The same applies to anything else the unified record happens to
 * carry.
 *
 * **`source_label` and `source_url` are permission-filtered before they arrive.**
 * `shapeTimerPayload` asks `canReadTimerSource` and blanks both to the empty string when the caller
 * may not read the source. The browser describes what survived that decision and must never try to
 * reconstruct what was withheld.
 *
 * `sourceMetadata` stays `unknown`: it is parsed JSON from another producer, and
 * `source_metadata_json` beside it is the text it was parsed from.
 *
 * `task_id` is built differently on the two paths - the list shaper uses the timer's own
 * `source_id`, the mutation shaper uses the task it was given - and both answer text.
 */
export interface BrowserTaskTimerRecord {
  accumulated_elapsed_seconds: number;
  billable: BrowserTaskTimerBillable;
  active_task_timer_id: string;
  active_timer_id: string;
  client_id: string;
  client_name: string;
  created_at: string;
  description: string;
  project_id: string;
  project_name: string;
  source_id: string;
  source_label: string;
  source_metadata_json: string;
  source_module_id: string;
  source_type: string;
  source_url: string;
  task_id: string;
  updated_at: string;
  user_id: string;
  workspace_id: string;
  /** `null` while the timer is paused. */
  last_active_start_time: string | null;
  resumeContext: BrowserTaskTimerResumeContext;
  /** The same object as `resumeContext`; both producers send both names. */
  resume_context: BrowserTaskTimerResumeContext;
  /** Parsed from `source_metadata_json` by another producer. */
  sourceMetadata: unknown;
  timer_status: BrowserTaskTimerStatus;
}

/**
 * The next occurrence a recurrence continuity points at.
 *
 * **Four members, and `safeNextTask` is why it is safe to name them.** It answers `null` for
 * anything without a `task_id` and otherwise builds exactly `due_date`, `task_id`, `title` and
 * `url` - a deliberately tiny descriptor rather than a task record, because the surfaces that
 * render it need a link and a label and nothing else. `title` falls back to `"Task"` and
 * `due_date` falls back through the recurrence instance date to the empty string, so neither is
 * ever empty-by-accident.
 *
 * `url` is built by the producer, not the browser: `tasks.html?task=` with the identifier encoded.
 */
export interface BrowserTaskRecurrenceNextTask {
  /** Falls back to the recurrence instance date, then to the empty string. */
  due_date: string;
  task_id: string;
  /** Falls back to `"Task"`, so never empty. */
  title: string;
  url: string;
}

/**
 * What a completed recurrence instance says about the rest of its series.
 *
 * **One record from four construction sites, which is what makes it nameable.**
 * `readCompletionContinuity` builds all seven members, `endedContinuity` builds the same seven,
 * `prepareCompletionContinuity` spreads that record and overrides one member, and
 * `completeRecurrenceHandoff` either spreads it with two overrides or - on its `catch` path -
 * rebuilds the same seven by hand. No path produces a different shape.
 *
 * **`status` is a closed union because every one of those sites writes a literal.** `"ended"` when
 * the template is inactive or has no next occurrence, `"available"` when the next instance already
 * exists, `"pending"` when it does not, and `"handoff_failed"` when the follow-up queue threw.
 * Nothing here is a database column passing through, which is the only reason this estate declares
 * a union at all.
 *
 * `isRecurring` is `true` on every path; the producer never builds this record for a task that is
 * not a recurrence instance, and answers `null` instead. `nextScheduledDate` is the empty string
 * rather than `null` when the series has ended.
 */
export interface BrowserTaskRecurrenceContinuity {
  checklistTemplateSeeded: boolean;
  followUpFailed: boolean;
  followUpQueued: boolean;
  /** Always `true`: a task with no series gets `null` instead of this record. */
  isRecurring: boolean;
  /** The empty string when the series has ended. */
  nextScheduledDate: string;
  nextTask: BrowserTaskRecurrenceNextTask | null;
  status: BrowserTaskRecurrenceStatus;
}

/**
 * The four continuity states the producer writes as literals.
 *
 * Declared as a union rather than `string` because every construction site is a literal in the
 * recurrence service, not a column read. `0.33.33.38.4.3.1` kept `status`, `priority` and
 * `source_type` as `string` for exactly the opposite reason.
 */
export type BrowserTaskRecurrenceStatus = "available" | "ended" | "handoff_failed" | "pending";

/**
 * One entry of the bulk action's recurrence report.
 *
 * **Not simply `BrowserTaskRecurrenceContinuity`, and the difference is one member.** `bulkUpdate`
 * pushes `{ task_id, ...recurrenceContinuity }`, so each entry says *which* task the continuity
 * belongs to - information the singular routes never need because their envelope already carries
 * the task. Declaring the plural as an array of the singular record would have lost the only thing
 * that makes the collection usable.
 */
export interface BrowserTaskBulkRecurrenceContinuity extends BrowserTaskRecurrenceContinuity {
  task_id: string;
}

/**
 * One task assignee as `attachAssignees` sends it.
 *
 * **A four-member summary, and it is not `BrowserUserRecord`.** `assigneeRowToAppValue` builds
 * `task_assignee_id`, `user_id`, `username` and `displayName` - the identity of the assignment and
 * enough to label the person. The user record is fifteen constructed members including theme and
 * landing preferences, and reusing it here would claim eleven the task query never joins.
 *
 * `displayName` falls back through the username to the user identifier, so it is never empty.
 */
export interface BrowserTaskAssignee {
  /** Falls back to the username and then the identifier, so never empty. */
  displayName: string;
  task_assignee_id: string;
  user_id: string;
  username: string;
}

/**
 * A task exactly as `taskRowToAppValue` reconstructs it, plus the assignees `attachAssignees` adds.
 *
 * **A total reconstruction, which is why this contract can be exact.** The shaper names all
 * thirty-three members individually - no spread anywhere - and every task column the select
 * carries is emitted. `assignee_ids` is a *write-side* input the service passes into the
 * repository and the shaper never emits it, so it must never appear here.
 *
 * **This is the record the task-timer routes send.** `taskTimersService.save`, `finalize` and
 * `linkManualTimer` answer `task: updatedTask || task` where `updatedTask` is
 * `tasksRepository.readById` - the base record with no reminders, no checklist, no tags and no
 * recurrence detail. `BrowserTaskDetail` is what everything else sends.
 *
 * **Twenty-seven members have a total fallback and three are passed through**, so every one of the
 * thirty is `string` and none is ever `null`. `estimate_minutes` is the single nullable member: the
 * shaper answers `null` for a null or absent column and a number otherwise.
 *
 * `billable` is a closed union because the producer genuinely closes it - a ternary that answers
 * `"no"` only for a literal `"no"` and `"yes"` for everything else cannot produce a third value.
 * `status`, `priority` and `source_type` are **not** closed: each is a database text column with a
 * default applied by a falsy fallback, and this estate does not declare a union over a wire field
 * nothing validates. Their vocabularies are open/in_progress/blocked/complete/archived,
 * low/normal/high, and manual/recurrence/import.
 *
 * `reminder_override_enabled` is a real boolean: the column is an integer flag and the shaper
 * converts it through the dialect boolean reader, so the browser must reject the stored integer.
 */
export interface BrowserTaskRecord {
  assignees: BrowserTaskAssignee[];
  /** `"no"` only when the column literally holds `"no"`; the producer closes this union. */
  billable: "no" | "yes";
  /** `null` for a null or absent column; a number otherwise. */
  estimate_minutes: number | null;
  /** Converted from the stored integer flag, so a number here is wrong. */
  reminder_override_enabled: boolean;
  archived_at: string;
  archived_by_user_id: string;
  blocked_reason: string;
  client_id: string;
  client_name: string;
  completed_at: string;
  completed_by_user_id: string;
  created_at: string;
  created_by_user_id: string;
  description: string;
  due_at_utc: string;
  due_date: string;
  due_time: string;
  due_timezone: string;
  last_worked_at: string;
  next_action: string;
  priority: string;
  project_id: string;
  project_name: string;
  recurrence_instance_date: string;
  recurrence_template_id: string;
  resume_note: string;
  source_id: string;
  source_type: string;
  status: string;
  task_id: string;
  title: string;
  updated_at: string;
  updated_by_user_id: string;
  workspace_id: string;
}

/**
 * Which end of the relationship the task being asked about sits on.
 *
 * `readableRelationshipsForTask` writes `"child"` when the asked-about task is the parent of
 * the pair and `"parent"` when it is the child, from one comparison and nothing else.
 */
export type BrowserTaskRelationshipDirection = "child" | "parent";

/**
 * The nine members `taskRelationshipTaskSummary` reconstructs from a related task.
 *
 * It is a summary rather than a task record: the shaper names these nine and no others, so a
 * page cannot reach the related task's description, dates, assignee or tags through this
 * boundary. `estimate_minutes` is the one nullable member, as it is on the task record itself.
 */
export interface BrowserTaskRelationshipTaskSummary {
  client_id: string;
  client_name: string;
  estimate_minutes: number | null;
  project_id: string;
  project_name: string;
  status: string;
  task_id: string;
  title: string;
  url: string;
}

/** The members every relationship in the list carries, whichever side the caller can see. */
export interface BrowserTaskRelationshipCommon {
  child_task_id: string;
  created_at: string;
  direction: BrowserTaskRelationshipDirection;
  is_blocking: boolean;
  parent_task_id: string;
  /** The other task's id: the child's on a `"child"` row, the parent's on a `"parent"` row. */
  related_task_id: string;
  task_relationship_id: string;
  updated_at: string;
}

/** A relationship whose other task the caller may read, so its summary is present. */
export interface BrowserReadableTaskRelationship extends BrowserTaskRelationshipCommon {
  related_task: BrowserTaskRelationshipTaskSummary;
  related_task_readable: true;
}

/**
 * A relationship whose other task the caller may **not** read, or which no longer exists.
 *
 * The relationship itself is still disclosed - a task may legitimately know it has a parent it
 * cannot open - but the summary is `null`, so the title, status, client and project of a task
 * outside the caller's reach never cross this boundary.
 */
export interface BrowserWithheldTaskRelationship extends BrowserTaskRelationshipCommon {
  related_task: null;
  related_task_readable: false;
}

/**
 * One relationship, discriminated on whether its other task was readable.
 *
 * The producer sets `related_task_readable` from a `tasks.view` check that is false whenever
 * the related task is missing, and writes the summary only when that check passed and the task
 * exists. So the flag and the summary's presence are one decision reported twice, not two
 * members that could disagree - and a body in which they do disagree is one where a withheld
 * task's details arrived anyway.
 */
export type BrowserTaskRelationship =
  | BrowserReadableTaskRelationship
  | BrowserWithheldTaskRelationship;

/**
 * `GET /api/tasks/:taskId/relationships`, and the four write routes that answer with it.
 *
 * `addChildTask`, `updateChildTaskRelationship` and their siblings all end in
 * `listRelationships`, so the write responses cannot diverge from the read - producer identity
 * proved by a call rather than by matching members. The envelope is exact at two.
 *
 * `relationshipSummary` is left `unknown` on purpose. It is a **different producer** -
 * `taskRelationshipsRepository.relationshipSummary`, five counts from one aggregate query -
 * and the same member is already carried as `unknown` by the two task-detail contracts that
 * also receive it. Naming it here would put its contract on the boundary that happens to
 * mention it rather than on the children that own it, and nothing on this path reads it.
 */
export interface BrowserTaskRelationshipListResponse {
  relationshipSummary: unknown;
  relationships: BrowserTaskRelationship[];
}

/**
 * A task as every non-timer route sends it: `attachTaskDetails` over the base record.
 *
 * **One shaper serves all of them.** `create`, `read`, `update`, `complete`, `reopen`, `archive`,
 * `restore` and `skipToCurrent` all reach `attachTaskDetails`, directly or through
 * `readTaggedTaskWithDetails`, so there is one detailed record rather than one per route.
 *
 * **Ten members are ten other producers**, and nine of their shapes are still unnamed here -
 * `recurrenceContinuity` was named by `0.33.33.38.4.3.4` once its producer was traced.
 * `reminderDetails` comes from `taskRemindersService`, `checklistItems` and `checklistProgress`
 * from `taskChecklistsRepository`, `relationshipSummary` from `taskRelationshipsRepository`,
 * `recurrenceDetails` from `taskRecurrenceService`, `recurrenceContinuity` from
 * `readTaskCompletionContinuity`, `recurrenceRecovery` from `recurrenceRecoveryPlan`, and
 * `completionMetrics`, `resumeContext` and `tags` from three more. Naming them from what a task
 * page renders is the guess this rollup exists to refuse; the sibling children own them.
 *
 * **Every member is present on every path, including the ones that look conditional.**
 * `recurrenceRecovery` is `null` rather than absent when no session reaches the shaper - which is
 * what `complete`, `reopen`, `archive` and `restore` do - and `tags` is an empty array rather than
 * absent when the tag service did not decorate the row first. Content differs by path; the shape
 * does not.
 *
 * `complete` additionally spreads `recurrenceContinuity` over the record a second time on its
 * recurrence branch. It is the same member this contract already carries, and the browser reads
 * the envelope sibling rather than the copy.
 */
export interface BrowserTaskDetail extends BrowserTaskRecord {
  checklistItems: unknown[];
  checklistProgress: unknown;
  completionMetrics: unknown;
  /**
   * `null` for any task that is not a completed recurrence instance.
   *
   * Named by `0.33.33.38.4.3.4`: `attachTaskDetails` fills this member with
   * `readTaskCompletionContinuity`, which is the same producer the lifecycle routes send beside
   * their task, so the detail record carries the same contract rather than a parallel one.
   */
  recurrenceContinuity: BrowserTaskRecurrenceContinuity | null;
  recurrenceDetails: unknown;
  /** `null` whenever the shaper is called without a session, which four routes do. */
  recurrenceRecovery: unknown;
  relationshipSummary: unknown;
  reminderDetails: unknown;
  resumeContext: unknown;
  tags: unknown[];
}

/**
 * The task a timer route sends back beside its timer.
 *
 * **`task` is nullable because the repository read can answer nothing.** The producer writes
 * `task: updatedTask || task`, so the member is always present, but the browser cannot prove which
 * side of that fallback it received and every consumer already wrote its own.
 *
 * The `timer` and `timers` siblings belong to the task-timer child and are not named here.
 */
export interface BrowserTaskEnvelope {
  task: BrowserTaskRecord | null;
}

/**
 * The task a create, read, update or lifecycle route sends.
 *
 * The siblings differ by route - `read` adds `currentUserId` and `options`, `complete` adds
 * `createdTask`, `recurrenceContinuity` and `recurrenceJob` - and **each belongs to its own
 * child**. Declaring one envelope with every sibling optional would be the mega-interface this
 * estate keeps refusing.
 */
export interface BrowserTaskDetailEnvelope {
  task: BrowserTaskDetail | null;
}

/**
 * What `POST /api/tasks/:taskId/skip-to-current` resolves to.
 *
 * **`targetTask` is the same detailed record `task` is**, because the service builds it with
 * `readTaggedTaskWithDetails` - the same shaper. Producer identity decides the reuse; the
 * different member name does not make it a different type.
 *
 * It is genuinely `null` when the skip retained no target, which is the absence the consumer has
 * always been reading through an optional chain.
 */
export interface BrowserTaskSkipToCurrentResult {
  targetTask: BrowserTaskDetail | null;
}

/**
 * The narrowing surface the three task consumers share.
 *
 * **One field table, three consumers.** `tasks.js`, `task-dialog.js` and `workbench.js` all read
 * single-task responses, and a thirty-three member predicate written three times would be three
 * chances to disagree with the shaper. This surface is installed by the same framework script
 * block that already delivers `errors` and `taskLifecycleLegality`, so every page that reads a
 * task has it before its own script runs.
 *
 * It answers `null` for anything it cannot vouch for. None of these readers throws: every call
 * site already had a fallback for a missing task, and this preserves it.
 */
/**
 * One task as `GET /api/tasks` sends it.
 *
 * **This is not `BrowserTaskDetail`, and the projection is why.**
 * `attachTaskListProjectionDetails` adds five members - `checklistProgress`, `completionMetrics`,
 * `parentTask`, `relationshipSummary` and `resumeContext` - where `attachTaskDetails` adds ten.
 * The list deliberately never loads `checklistItems`, `recurrenceContinuity`, `recurrenceDetails`,
 * `recurrenceRecovery` or `reminderDetails`, because it is the optimised projection that keeps the
 * list off a per-row detail query. It also carries `parentTask`, which **no detail route sends**.
 * Five shared members, five detail-only, five list-only: neither record extends the other and both
 * extend `BrowserTaskRecord`.
 *
 * **The five tag members are optional because the producer genuinely omits them.**
 * `tagsService.decorateRecordsForTarget` returns its records *untouched* when the tags module is
 * not readable for the session, so a workspace with tags disabled receives list items with no
 * `tags`, `tagAssignments`, `directTags`, `propagatedTags` or `effectiveTags` at all. Requiring
 * them would have emptied the task list for those workspaces. This is optionality a runtime
 * condition creates, not optionality that makes one interface cover two records.
 *
 * `parentTask` is `null` when the task has no readable primary parent - `readPrimaryParentByTaskId`
 * applies the caller's own `tasks.view` evaluator, so an unreadable parent is absent by design and
 * the browser must not try to fill it in.
 *
 * The five projection members stay `unknown`: they are five other producers, the same answer
 * `BrowserTaskDetail` gives for the members it shares with this record.
 */
export interface BrowserTaskListItem extends BrowserTaskRecord {
  checklistProgress: unknown;
  completionMetrics: unknown;
  /** Absent unless the tags module is readable for the session. */
  directTags?: unknown[];
  /** Absent unless the tags module is readable for the session. */
  effectiveTags?: unknown[];
  /** `null` when the task has no parent the caller may read. */
  parentTask: unknown;
  /** Absent unless the tags module is readable for the session. */
  propagatedTags?: unknown[];
  relationshipSummary: unknown;
  resumeContext: unknown;
  /** Absent unless the tags module is readable for the session. */
  tagAssignments?: unknown[];
  /** Absent unless the tags module is readable for the session. */
  tags?: unknown[];
}

/**
 * The paging cursor `GET /api/tasks` sends beside its tasks.
 *
 * **Four members, all constructed, none inferred from the page controls.** `queryTasksResult`
 * builds `hasMore` from whether it minted a next cursor, and `limit` and `pageSize` from the same
 * resolved page size - two names for one number, which is why both are declared rather than one
 * being called optional. `nextCursor` is the empty string when there is nothing further, not
 * `null` and not absent.
 *
 * The browser's own `normalizeTaskPagination` reduces this to the three members the list controls
 * need; this contract describes what arrives, not what survives that reduction.
 */
export interface BrowserTaskListPagination {
  hasMore: boolean;
  limit: number;
  nextCursor: string;
  pageSize: number;
}

/**
 * The option catalog `GET /api/tasks` sends beside its tasks.
 *
 * **Nine members from six producers, and every one of them is now named.**
 * `readOptions` constructs `workspaceType`, `priorities`, `statuses`, `taskTimersEnabled` and
 * `timeTrackingEnabled` itself. The four collections come from `readClientOptionPayload`,
 * `readProjectOptionPayload`, `readTaskOptionPayload` and `usersRepository.readAll`, and each has
 * its own element contract - **four producers, four records, one envelope.** A single option type
 * covering all four would have erased exactly the distinctions these checkpoints recovered.
 *
 * `0.33.33.38.4.3.2` left the four as `unknown[]` and validated only their containers. That was
 * honest while their producers were untraced, and it made the element-level debt visible in the
 * consumers; `0.33.33.38.4.3.8` traced them and closed it.
 *
 * `priorities` and `statuses` are spread from server constants and are arrays of text. The browser
 * validates that they are text and not which words they hold, as this estate has done since
 * `userPreferences`.
 */
/**
 * One client as the Task option catalog carries it.
 *
 * **A structural minimum, and deliberately not the whole client.** `readClientOptionPayload`
 * spreads `...client` before adding `optionLabel`, `displayName` and `hierarchyDepth`, and what it
 * spreads has itself been through `decorateClientShape`, which spreads again. A spread is a trust
 * boundary only for what it reconstructs, so this contract promises the three members that payload
 * builder genuinely constructs plus the two `clientRowToAppClient` guarantees by name - `id` and
 * `name` - and says nothing about the rest of the record travelling beside them.
 *
 * The billing, hierarchy and tag members that `decorateClientShape` adds are **not** here. The
 * Tasks page does not read them, and claiming them would be claiming the client-projects estate's
 * contribution rather than this catalog's.
 *
 * `hierarchyDepth` is a real number: the builder answers `Number(client.depth) || 0`, and
 * `parent_client_id` is the third member `clientRowToAppClient` guarantees by name - the empty
 * string for a top-level client, which mirrors the project option's `client_id`.
 */
export interface BrowserTaskClientOption {
  /** Falls back through the indented label to the name, so never empty for a named client. */
  displayName: string;
  hierarchyDepth: number;
  id: string;
  name: string;
  optionLabel: string;
  /** The empty string for a top-level client, never `null`. */
  parent_client_id: string;
}

/**
 * One project as the Task option catalog carries it.
 *
 * **Not a client option plus `client_id`.** It reaches the browser through a different service
 * call, a different hierarchy sort and a different row shaper, and `projectRowToAppProject`
 * guarantees `client_id` as text - the empty string for a project with no client, which is what
 * the page's `(project.client_id || "") === selectedClientId` comparison has always read.
 *
 * The same structural-minimum rule applies as for the client option: `readProjectOptionPayload`
 * spreads its rows and this contract promises only the members it reconstructs plus the three the
 * row shaper builds by name.
 */
export interface BrowserTaskProjectOption {
  /** The empty string when the project has no client, never `null`. */
  client_id: string;
  /** Falls back through the indented label to the name, so never empty for a named project. */
  displayName: string;
  hierarchyDepth: number;
  id: string;
  name: string;
  optionLabel: string;
}

/**
 * One task as the Task option catalog carries it.
 *
 * **This is a picker projection, not a task record.** `taskPickerOption` is a total
 * reconstruction of thirteen members over a task the repository already returned, and it carries
 * neither the thirty columns `BrowserTaskRecord` describes nor the assignees, the projection
 * members or the detail members. Widening it to any of the task contracts would claim a shape this
 * producer never builds.
 *
 * It duplicates the identifier as both `task_id` and `id`, and the label three ways -
 * `label`, `optionLabel` and `displayName` - because the pickers that consume it read different
 * ones. All three are text with total fallbacks.
 *
 * The list is already permission-filtered: `readTaskOptionPayload` asks a `tasks.view` evaluator
 * per candidate and applies the status filter before shaping. Narrowing happens after that.
 */
export interface BrowserTaskPickerOption {
  client_id: string;
  client_name: string;
  displayName: string;
  due_date: string;
  due_time: string;
  /** The same value as `task_id`; the producer sends both. */
  id: string;
  /** Falls back to `"Untitled Task"`, so never empty. */
  label: string;
  optionLabel: string;
  priority: string;
  project_id: string;
  project_name: string;
  status: string;
  task_id: string;
}

/**
 * One workspace member as the Task option catalog carries it.
 *
 * **A deliberate subset of `BrowserUserRecord`, and it says so rather than pretending.** The
 * producer is identical - `usersRepository.readAll` answers `rows.map(userRowToAppValue)`, the
 * same shaper `0.33.33.38.4.4.1` derived that record from, filtered to active memberships - so the
 * full fifteen members really are on the wire. This contract promises the three the Tasks page
 * reads and validates all three.
 *
 * The alternative was a second copy of the fifteen-member predicate that lives in `user-admin.js`,
 * or a new published surface to share it. **A page-local subset is cheaper than either and claims
 * less**, which is why it is named for the catalog it belongs to rather than for the user record it
 * is drawn from. A later child that shares the full predicate may replace this with
 * `BrowserUserRecord` and delete the subset.
 *
 * Nothing withheld by `0.33.33.38.4.4.1` may appear here: the shaper never emits `password`, and
 * this record must never regain it or any other column the select carries but the response drops.
 */
export interface BrowserTaskUserOption {
  /** Falls back to the username, so never empty. */
  displayName: string;
  user_id: string;
  username: string;
}

export interface BrowserTaskListOptions {
  clients: BrowserTaskClientOption[];
  priorities: string[];
  projects: BrowserTaskProjectOption[];
  statuses: string[];
  taskTimersEnabled: boolean;
  tasks: BrowserTaskPickerOption[];
  timeTrackingEnabled: boolean;
  users: BrowserTaskUserOption[];
  workspaceType: string;
}

/**
 * What `GET /api/tasks` resolves to.
 *
 * **One envelope for all three loaders**, because all three call the same `loadCanonicalTasks`
 * helper and the same route: the first load, the refresh, and the cursor page. Only the query
 * string differs.
 *
 * `currentUserId` is `session.user_id` and is always text - the consumer's
 * `result.currentUserId || state.currentUserId` was reading a malformed body, not a producer
 * union.
 *
 * **`options` and `pagination` are nullable here even though this route always sends them.**
 * `list` throws its own invariant when pagination is missing and always asks for options, so the
 * route cannot answer `null`; but `queryTasksResult` builds both conditionally for its other
 * callers, and the browser cannot prove which caller answered. `null` is what the reader gives
 * when it cannot vouch for the member, which keeps both existing consumer fallbacks intact.
 *
 * `timers` is **not** part of this envelope: `queryTasksResult` carries it, and `list` rebuilds
 * the response without it. The task timers belong to `0.33.33.38.4.3.3` and reach the page from
 * their own route.
 */
export interface BrowserTaskListEnvelope {
  currentUserId: string;
  options: BrowserTaskListOptions | null;
  pagination: BrowserTaskListPagination | null;
  tasks: BrowserTaskListItem[];
}

export interface BrowserTaskRecords {
  /** The base record a timer route sends, or `null`. */
  readTask(body: unknown): BrowserTaskRecord | null;
  /** The detailed record every other route sends, or `null`. */
  readTaskDetail(body: unknown): BrowserTaskDetail | null;
  /** The detailed record the skip-to-current route retained, or `null`. */
  readSkipToCurrentTarget(body: unknown): BrowserTaskDetail | null;
  /** The task list envelope, with every element checked. */
  readTaskList(body: unknown): BrowserTaskListEnvelope;
  /** The task timers `GET /api/tasks/timers` listed, with every element checked. */
  readTaskTimers(body: unknown): BrowserTaskTimerRecord[];
  /** The task timer a save or link route answered with, or `null`. */
  readTaskTimer(body: unknown): BrowserTaskTimerRecord | null;
  /** The continuity a lifecycle route reported beside its task, or `null`. */
  readRecurrenceContinuity(body: unknown): BrowserTaskRecurrenceContinuity | null;
  /** The per-task continuity entries a bulk action reported, with every element checked. */
  readBulkRecurrenceContinuities(body: unknown): BrowserTaskBulkRecurrenceContinuity[];
  /**
   * The detailed tasks a bulk action changed.
   *
   * `bulkUpdate` collects `readTaggedTaskWithDetails` output and the lifecycle services' own
   * `task`, so these are detail records rather than list items - which is also why they flow into
   * `upsertTask` beside the single-task responses.
   */
  readBulkTasks(body: unknown): BrowserTaskDetail[];
}

/**
 * The list columns every browser-facing Lists projection carries.
 *
 * **Derived from `LIST_COLUMNS`, which both shapers spread rather than reconstruct.**
 * `shapeListsForBrowser` answers `{ ...listRecord, ... }` and the browser's
 * `normalizeListRecord` answers `{ ...list, ... }`, so these twenty-one columns reach the page
 * exactly as the row held them. The required/nullable split is the table's own `NOT NULL`.
 *
 * **`is_reusable` is a number and that is not a mistake.** The column is `INTEGER NOT NULL` with a
 * `CHECK (is_reusable IN (0, 1))`, the server spreads it untouched, and it adds a *separate*
 * camelCase `isReusable` boolean beside it. Two members, two types, one concept - and the browser
 * normaliser then overwrites `is_reusable` with a boolean of its own. Naming both as booleans here
 * would have described the wire wrongly.
 *
 * `list_type` is shopping/procurement/packing/supplies/parts/checklist/bill_of_materials and
 * `status` is active/completed/finalized/archived/deleted. Both are `CHECK`-constrained on the
 * server and **neither is validated by the browser**, so both stay `string`.
 */
export interface BrowserListColumns {
  archived_at: string | null;
  client_id: string | null;
  completed_at: string | null;
  created_at: string;
  created_by_user_id: string | null;
  deleted_at: string | null;
  description: string | null;
  duplicated_from_list_id: string | null;
  finalized_at: string | null;
  finalized_by_user_id: string | null;
  /** `0` or `1`. The boolean beside it is `isReusable`. */
  is_reusable: number;
  list_id: string;
  list_type: string;
  metadata_json: string | null;
  project_id: string | null;
  source_list_id: string | null;
  status: string;
  title: string;
  updated_at: string;
  updated_by_user_id: string | null;
  workspace_id: string;
}

/**
 * One list as `GET /api/lists` and the single-list routes return it.
 *
 * **The seven members below are what the server constructs; everything else is spread.**
 * `shapeListsForBrowser` adds `id`, `isBillOfMaterials`, `isReusable`, `links`, `progress`,
 * `resumeContext` and `sourceContext` around the spread row.
 *
 * **Four of them stay `unknown`, and that is this checkpoint's boundary.** `links`, `progress`,
 * `resumeContext` and `sourceContext` are built by `readPermissionSafeLinksForLists`,
 * `readListProgressSummaries`, `buildListResumeContext` and `readSourceContextsForLists` - four
 * producers of their own, none of which this child traced. Naming their shapes from what the Lists
 * page happens to render is exactly the guess `0.33.33.38.4` exists to refuse.
 */
export interface BrowserListSummary extends BrowserListColumns {
  /** A duplicate of `list_id`, added by the server for the page's list primitives. */
  id: string;
  isBillOfMaterials: boolean;
  isReusable: boolean;
  /** Permission-filtered links. Their record is `0.33.33.38.4.7.2`'s producer, not this one's. */
  links: unknown[];
  progress: unknown;
  resumeContext: unknown;
  sourceContext: unknown;
}

/**
 * One list item as `GET /api/lists/:listId` returns it.
 *
 * Derived from `ITEM_COLUMNS`. **`quantity`, `estimated_cost`, `actual_cost` and `sort_order` stay
 * `unknown`**: the columns are numeric but nothing between the query and the response coerces them,
 * and this child validates what the producer guarantees rather than what the renderer hopes.
 */
export interface BrowserListItem {
  actual_cost: unknown;
  assigned_user_id: string | null;
  catalog_item_id: string | null;
  checked_at: string | null;
  checked_by_user_id: string | null;
  completed_at: string | null;
  completed_by_user_id: string | null;
  created_at: string;
  created_by_user_id: string | null;
  deleted_at: string | null;
  estimated_cost: unknown;
  item_name: string;
  list_id: string;
  list_item_id: string;
  metadata_json: string | null;
  needed_by_date: string | null;
  notes: string | null;
  purchase_status: string;
  quantity: unknown;
  sort_order: unknown;
  tracking_id: string | null;
  unit: string | null;
  updated_at: string;
  updated_by_user_id: string | null;
  url: string | null;
  vendor_name: string | null;
  workspace_id: string;
}

/**
 * One list link as the detail route returns it, derived from `LINK_COLUMNS`.
 *
 * **This is not a Notes link and not a Tasks linked context.** It is the list-link row: eleven
 * columns naming which module and target a list points at, with no label, no decorated record and
 * no resolved title. Reusing another module's link contract for the word would have claimed
 * decoration this producer never performs.
 */
export interface BrowserListLink {
  created_at: string;
  created_by_user_id: string | null;
  link_role: string | null;
  list_id: string;
  list_link_id: string;
  metadata_json: string | null;
  module_id: string;
  removed_at: string | null;
  target_id: string;
  target_type: string;
  workspace_id: string;
}

/** The `{ list, items, links }` envelope the single-list detail route returns. */
export interface BrowserListDetail {
  items: BrowserListItem[];
  links: BrowserListLink[];
  /** Absent rather than `null`, so the browser normaliser's own default applies unchanged. */
  list?: BrowserListSummary;
}

export interface LongtailForgeBrowserNamespace {
  api?: BrowserApi;
  appShellBootstrap?: BrowserAppShellBootstrapAdapter;
  assetVersion?: BrowserAssetVersion;
  cachedFetch?: BrowserCachedFetch;
  capturePrompt?: BrowserCapturePrompt;
  clientProjectOptions?: BrowserClientProjectOptions;
  controllers?: PageControllerRegistry;
  dashboard?: BrowserDashboard;
  dashboardBootstrap?: BrowserDashboardBootstrap;
  errors?: BrowserErrorContract;
  taskRecords?: BrowserTaskRecords;
  esModuleBridge?: BrowserEsModuleBridge;
  fileAttachments?: BrowserFileAttachments;
  formatters?: BrowserFormatters;
  getWorkspaceProjectsLabel?: (workspaceName?: unknown) => string;
  icons?: BrowserIcons;
  listsDialog?: BrowserListsDialog;
  modal?: BrowserModalDialogs;
  moduleActions?: BrowserModuleActions;
  notesDialog?: BrowserNotesDialog;
  notesEditor?: BrowserNotesEditor;
  notesLinkedPanel?: BrowserNotesLinkedPanel;
  notificationPreferences?: BrowserNotificationPreferences;
  notificationSubscriptions?: BrowserNotificationSubscriptions;
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
  settingsHost?: BrowserSettingsHost;
  settingsPageController?: BrowserSettingsPageController;
  status?: BrowserStatusMessage;
  taskResumeNoteCapture?: BrowserTaskResumeNoteCapture;
  timeEntryDialog?: BrowserTimeEntryDialog;
  timeTrackingTimerDialog?: BrowserTimeTrackingTimerDialog;
  timezones?: BrowserTimezones;
  /**
   * The frozen view factory, written by `view-builder.js` and extended by `view-renderer.js`.
   * Optional because the namespace itself can be absent, not because the factory is.
   */
  /**
   * The five surfaces below were published with accurate interfaces by `0.33.33.34` through
   * `.37` and reached through a local cast at every consumer, because the namespace did not
   * name them. `0.33.33.38.2.2.1` wires the interfaces that already exist rather than
   * restating them: each consumer keeps the checked accessor that does the real narrowing and
   * simply stops supplying its own type.
   */
  taskLifecycleLegality?: BrowserTaskLifecycleLegality;
  view?: BrowserViewFactory;
  viewActionSecurity?: BrowserViewActionSecurity;
  viewDataBinding?: BrowserViewDataBinding;
  viewModalStack?: BrowserViewModalStack;
  viewSearchOptions?: BrowserViewSearchOptions;
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
