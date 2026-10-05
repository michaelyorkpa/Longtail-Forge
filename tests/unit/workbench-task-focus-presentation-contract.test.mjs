import { describe, expect, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Workbench Task Focus presentation contract (`0.33.33.38.2.13`).
 *
 * Declared ahead of its writer for Codex's `0.33.33.42.47`, which moves the remaining Task Focus
 * presentation - the summary and details, timer display, related context, action strip and panel
 * composition - into `public/js/workbench-task-focus-presentation.js` and publishes
 * `LongtailForge.workbenchTaskFocusPresentation`. These cases pin the declarations exactly as
 * Codex's planning commit `39b71e81` requested them, once their doc comments are removed, and the
 * governance record that lets the declaration land first. Governance enforces the record both
 * ways: it fails while the member has no writer and no record, and it fails once a writer appears
 * while the record still stands. The writer's checkpoint strikes the record and retargets the last
 * case here.
 *
 * `0.33.33.38.2.14` added three host members - Workbench's context label and related-context
 * readers, which retained Workbench code shares - after Codex's held report found those reverse
 * dependencies. They are injected through the host rather than exported by the renderer, because a
 * renderer-declared related-context return is wider than the refresh's own state type.
 */

const reader = createProjectTextReader();
const contracts = reader.readText("src/types/browser-contracts.d.ts");
const governance = reader.readText("scripts/regressions/framework/full-strict-governance.regression.mjs");

/** The requested declarations, in order, as `39b71e81` wrote them, with `0.33.33.38.2.14`'s three host readers. */
const REQUESTED = `export interface BrowserWorkbenchTaskFocusRelatedAction {
  type?: string;
  moduleActionId?: string;
  params?: unknown;
  fallbackUrl?: string;
}
export interface BrowserWorkbenchTaskFocusRelatedItem {
  action?: BrowserWorkbenchTaskFocusRelatedAction;
  moduleId?: string;
  recordType?: string;
  recordId?: unknown;
  reason?: string;
  title?: string;
  sourceLabel?: string;
  contextLabel?: string;
  reasonLabel?: string;
  badges?: unknown[];
}
export interface BrowserWorkbenchTaskFocusRelatedGroup {
  id?: string;
  label?: string;
  reason?: string;
  count?: number | string;
  items?: BrowserWorkbenchTaskFocusRelatedItem[];
}
export interface BrowserWorkbenchTaskFocusRelatedState {
  error: string;
  groups: Array<BrowserWorkbenchTaskFocusRelatedGroup & { items: BrowserWorkbenchTaskFocusRelatedItem[] }>;
  isLoading: boolean;
  items: unknown[];
  taskId: unknown;
  meta?: unknown;
  task?: unknown;
}
export interface BrowserWorkbenchTaskFocusPresentationState
  extends BrowserWorkbenchTaskFocusChecklistState {
  task?: Record<string, unknown> | null;
  taskId?: unknown;
  title?: string;
  contextLabel?: string;
  dueAt?: unknown;
  priority?: unknown;
  status?: unknown;
  relatedContext?: BrowserWorkbenchTaskFocusRelatedState;
}
export type BrowserWorkbenchTaskFocusDisplayTimer = Partial<Pick<
  BrowserTaskTimerRecord,
  "active_timer_id" | "timer_status" | "accumulated_elapsed_seconds" | "last_active_start_time"
>>;
export interface BrowserWorkbenchTaskFocusPresentationMounts {
  taskFocusActionMount: HTMLElement | null;
  taskFocusBody: HTMLElement | null;
  taskFocusPanelElement: HTMLElement | null;
  readonly workbenchInspectorElement: HTMLElement | null;
  readonly workbenchInspectorList: HTMLElement | null;
  readonly workbenchInspectorCountText: HTMLElement | null;
  readonly workbenchInspectorCollapseButton: HTMLButtonElement | null;
}
export interface BrowserWorkbenchTaskFocusPresentationHost {
  readonly state: { readonly activeTaskFocus: BrowserWorkbenchTaskFocusPresentationState | null };
  readonly mounts: BrowserWorkbenchTaskFocusPresentationMounts;
  readonly taskFocusInspectorCollapsed: boolean;
  requireView(): BrowserViewFactory;
  requireWorkbenchElement<T extends HTMLElement>(element: T | null | undefined): T;
  resolvedWorkbenchViewState(): string;
  setWorkbenchInspectorCopy(heading: string, helper: string): void;
  emptyState(message: string | null): HTMLDivElement;
  safeTaskFocusText(value: unknown, fallback?: string): string;
  safeRelatedContextText(value: unknown, fallback?: string): string;
  relatedContextSourceLabel(item?: BrowserWorkbenchTaskFocusRelatedItem): string;
  workbenchDetailField(value: unknown, key: string, optional?: boolean): unknown;
  badge(label: unknown, type?: unknown): HTMLSpanElement;
  formatToken(value: unknown): string;
  formatCandidateDate(value: unknown): string;
  formatDuration(totalSeconds: unknown): string;
  readElapsedSeconds(timer: unknown): number;
  actionButton(label: string | null, handler: EventListener, options?: { danger?: unknown }): HTMLButtonElement;
  createWorkbenchSectionSummary: BrowserWorkbenchTaskFocusChecklistHost["createWorkbenchSectionSummary"];
  setWorkbenchDisclosureOpen: BrowserWorkbenchTaskFocusChecklistHost["setWorkbenchDisclosureOpen"];
  createTaskFocusChecklistSection(active: BrowserWorkbenchTaskFocusPresentationState | null): HTMLDetailsElement;
  currentTaskFocusTimer(active?: BrowserWorkbenchTaskFocusPresentationState | null): BrowserWorkbenchTaskFocusDisplayTimer | null;
  taskFocusTimerEligibility(active?: BrowserWorkbenchTaskFocusPresentationState | null): { eligible: boolean; reason: string };
  taskTimerSurfaceAvailable(): boolean;
  taskFocusLifecycleDisabledReason(action: string, active?: BrowserWorkbenchTaskFocusPresentationState | null): string;
  openFocusedTaskEditor(event: Event | null | undefined): Promise<void>;
  completeFocusedTask(): Promise<void>;
  blockFocusedTask(event: Event | null | undefined): Promise<void>;
  resumeFocusedTask(): Promise<void>;
  saveFocusedTaskTimer(timerStatus: string): Promise<void>;
  finalizeFocusedTaskTimer(event?: Event | null): Promise<void>;
  resetFocusedTaskTimer(): Promise<void>;
  openTaskFocusRelatedContextItem(item?: BrowserWorkbenchTaskFocusRelatedItem, trigger?: EventTarget | null): Promise<void>;
  taskFocusContextLabel(task?: { client_name?: unknown; project_name?: unknown }, active?: { contextLabel?: unknown } | null): string;
  taskFocusRelatedContextState(active?: BrowserWorkbenchTaskFocusPresentationState | null): BrowserWorkbenchTaskFocusRelatedState;
  taskFocusRelatedContextGroups(context?: BrowserWorkbenchTaskFocusRelatedState): BrowserWorkbenchTaskFocusRelatedState["groups"];
}
export interface BrowserWorkbenchTaskFocusPresentationRenderer {
  createPanel(): HTMLElement;
  renderSurface(): void;
  renderInspector(): void;
  syncInspectorCollapse(collapsed: boolean, options?: { enableCollapse?: unknown }): void;
  title(active?: BrowserWorkbenchTaskFocusPresentationState | null): string;
}
export interface BrowserWorkbenchTaskFocusPresentation {
  create(host: BrowserWorkbenchTaskFocusPresentationHost): BrowserWorkbenchTaskFocusPresentationRenderer;
}
`;

const FIRST = "export interface BrowserWorkbenchTaskFocusRelatedAction {";
const LAST = "export interface BrowserWorkbenchTaskFocusPresentation {";

/** The declared block without its doc comments, so only a signature change can differ. */
function declaredBlock() {
  const start = contracts.indexOf(FIRST);
  const last = contracts.indexOf(LAST);
  expect(start, "the first declaration is present").toBeGreaterThan(-1);
  expect(last, "the factory is declared after the rest").toBeGreaterThan(start);
  return contracts.slice(start, contracts.indexOf("}\n", last) + 2)
    .replace(/[ \t]*\/\*\*[\s\S]*?\*\/\n/g, "")
    .replace(/\n\n/g, "\n");
}

describe("The presentation contract Codex requested", () => {
  it("declares every requested type with the requested members and signatures, in order", () => {
    expect(declaredBlock()).toBe(REQUESTED);
  });

  it("follows the checklist declarations and extends the checklist state", () => {
    expect(contracts.indexOf("export interface BrowserWorkbenchTaskFocusChecklist {")).toBeLessThan(contracts.indexOf(FIRST));
    expect(contracts).toMatch(/export interface BrowserWorkbenchTaskFocusPresentationState\n {2}extends BrowserWorkbenchTaskFocusChecklistState \{/);
  });

  it("declares the optional namespace member beside the checklist member", () => {
    expect(contracts).toMatch(/^ {2}workbenchTaskFocusChecklist\?: BrowserWorkbenchTaskFocusChecklist;\n(?: {2}(?:\/\*\*| \*).*\n)+ {2}workbenchTaskFocusPresentation\?: BrowserWorkbenchTaskFocusPresentation;$/m);
  });

  it("publishes the member and strikes its spent type-only record", () => {
    const at = governance.indexOf("const TYPE_ONLY_DECLARATIONS = new Map(");
    expect(at).toBeGreaterThan(-1);
    const record = governance.slice(at, governance.indexOf(");", at));
    expect(record).not.toContain("workbenchTaskFocusPresentation");
    expect(createProjectTextReader().readText("public/js/workbench-task-focus-presentation.js")).toMatch(/namespace\.workbenchTaskFocusPresentation =/);
    expect(governance).toMatch(/declarationCoverage\.knownMembers\.length, 67,/);
    expect(governance).toMatch(/declarationCoverage\.declaredMembers\.length, 67,/);
    expect(governance).toMatch(/declarationCoverage\.publishedMembers\.length, 67,/);
  });
});
