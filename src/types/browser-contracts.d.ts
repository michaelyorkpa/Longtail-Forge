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

/**
 * `LongtailForge.notesLinkedPanel`, published by `public/js/shared/notes-linked-panel.js`.
 *
 * The linked-notes panel the Task dialog mounts. **`mount` throws** rather than returning
 * `null` when it has no container, so the return type has no null branch.
 */
export interface BrowserNotesLinkedPanel {
  mount(container?: unknown, options?: unknown): BrowserMountedPanel;
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

export interface LongtailForgeBrowserNamespace {
  api?: BrowserApi;
  appShellBootstrap?: BrowserAppShellBootstrapAdapter;
  assetVersion?: BrowserAssetVersion;
  cachedFetch?: BrowserCachedFetch;
  capturePrompt?: BrowserCapturePrompt;
  clientProjectOptions?: BrowserClientProjectOptions;
  controllers?: PageControllerRegistry;
  dashboardBootstrap?: BrowserDashboardBootstrap;
  errors?: BrowserErrorContract;
  esModuleBridge?: BrowserEsModuleBridge;
  formatters?: BrowserFormatters;
  getWorkspaceProjectsLabel?: (workspaceName?: unknown) => string;
  icons?: BrowserIcons;
  listsDialog?: BrowserListsDialog;
  modal?: BrowserModalDialogs;
  moduleActions?: BrowserModuleActions;
  notesDialog?: BrowserNotesDialog;
  notesEditor?: BrowserNotesEditor;
  notesLinkedPanel?: BrowserNotesLinkedPanel;
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
