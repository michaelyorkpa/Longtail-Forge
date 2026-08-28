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
  /**
   * The frozen view factory, written by `view-builder.js` and extended by `view-renderer.js`.
   * Optional because the namespace itself can be absent, not because the factory is.
   */
  view?: BrowserViewFactory;
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
