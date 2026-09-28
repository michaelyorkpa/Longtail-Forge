import { describe, expect, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

/**
 * The Workbench Task Focus checklist contract (`0.33.33.38.2.12`).
 *
 * Declared ahead of its writer for Codex's `0.33.33.42.46`, which extracts eight checklist
 * presentation functions into `public/js/workbench-task-focus-checklist.js` and publishes
 * `LongtailForge.workbenchTaskFocusChecklist`. These cases pin the requested signatures and the
 * discharged governance record that let the declaration land first. Governance enforces the record
 * both ways: it fails while the member has no writer and no record, and it fails once a writer
 * appears while the record still stands.
 */

const reader = createProjectTextReader();
const contracts = reader.readText("src/types/browser-contracts.d.ts");
const governance = reader.readText("scripts/regressions/framework/full-strict-governance.regression.mjs");

/** @param {string} name */
function interfaceBody(name) {
  const match = contracts.match(new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`));
  expect(match, `${name} is declared`).toBeTruthy();
  return match ? match[1] : "";
}

describe("The checklist contract Codex requested", () => {
  it("declares the factory and the renderer", () => {
    expect(interfaceBody("BrowserWorkbenchTaskFocusChecklist"))
      .toMatch(/\n {2}create\(host: BrowserWorkbenchTaskFocusChecklistHost\): BrowserWorkbenchTaskFocusChecklistRenderer;/);
    expect(interfaceBody("BrowserWorkbenchTaskFocusChecklistRenderer"))
      .toMatch(/\n {2}render\(active: BrowserWorkbenchTaskFocusChecklistState \| null\): HTMLDetailsElement;/);
  });

  it("declares the six host functions with Workbench's own signatures", () => {
    const host = interfaceBody("BrowserWorkbenchTaskFocusChecklistHost");
    for (const signature of [
      "requireView(): BrowserViewFactory;",
      "emptyState(message: string | null): HTMLDivElement;",
      "safeTaskFocusText(value: unknown, fallback?: string): string;",
      "setWorkbenchDisclosureOpen(details: HTMLDetailsElement | null, open: unknown): void;",
      "handleTaskFocusChecklistChange(event: Event): Promise<void>;",
    ]) {
      expect(host, signature).toContain(signature);
    }
    expect(host).toMatch(/createWorkbenchSectionSummary\(options: \{\s*bodyId\?: string;\s*count\?: HTMLElement \| null;\s*subtitle\?: HTMLElement \| null;\s*title: string;\s*\}\): HTMLElement;/);
  });

  it("keeps every state member optional and the opaque ones unknown", () => {
    const state = interfaceBody("BrowserWorkbenchTaskFocusChecklistState");
    const members = [...state.matchAll(/^ {2}(\w+)(\??):\s*(.+);$/gm)].map(([, name, optional, type]) => [name, optional, type]);
    expect(members).toEqual([
      ["task", "?", "{ checklistItems?: unknown; checklistProgress?: unknown } | null"],
      ["isLoading", "?", "boolean"],
      ["error", "?", "string"],
      ["checklistError", "?", "string"],
      ["checklistMutationItemId", "?", "unknown"],
    ]);
  });

  it("declares the optional namespace member with a runtime writer and no spent type-only record", () => {
    expect(contracts).toMatch(/^ {2}workbenchTaskFocusChecklist\?: BrowserWorkbenchTaskFocusChecklist;$/m);
    const at = governance.indexOf("const TYPE_ONLY_DECLARATIONS = new Map(");
    expect(at).toBeGreaterThan(-1);
    const record = governance.slice(at, governance.indexOf(";", at));
    expect(record).not.toContain("workbenchTaskFocusChecklist");
    const writer = reader.readText("public/js/workbench-task-focus-checklist.js");
    expect(writer).toMatch(/const namespace = window\.LongtailForge \|\| \{\};/);
    expect(writer).toMatch(/namespace\.workbenchTaskFocusChecklist = Object\.freeze\(\{ create \}\);/);
  });
});
