import { test, expect } from "./support/isolated-workspace.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/workbench.js");
const capture = source.match(/^  const workbenchHost = .*;$/m)?.[0];
if (!capture) throw new Error("Workbench host capture was not found.");
const functions = ["requireCheckedDom", "buildWorkbenchHost", "renderWorkbenchViewState"]
  .map(name => extractFunctionBlock(source, name)).join("\n");

test("Workbench captures its optional checked host once and guards absent or non-HTML hosts", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/workbench.html");
  await expect(page.locator("main[data-workbench-host]")).toHaveAttribute("data-workbench-view-state", "focus-selection");
  // Use the real injected checkedDom and native DOM constructors. Only unrelated panel
  // transitions are inert in this lifted capture/use proof; the guarded bodies are real.
  const result = await page.evaluate(`(() => {
    return ["html", "missing", "svg"].map(kind => {
      const document = window.document.implementation.createHTMLDocument("host proof");
      const original = kind === "missing" ? null : kind === "html"
        ? document.createElement("main")
        : document.createElementNS("http://www.w3.org/2000/svg", "svg");
      if (original) { original.setAttribute("data-workbench-host", ""); document.body.append(original); }
      let lookups = 0;
      const query = document.querySelector.bind(document);
      document.querySelector = selector => { lookups++; return query(selector); };
      const state = { activeTaskFocus: { taskId: "focused" } };
      const WORKBENCH_VIEW_STATE_TASK_FOCUS = "task-focus";
      const resolvedWorkbenchViewState = () => WORKBENCH_VIEW_STATE_TASK_FOCUS;
      const toggleWorkbenchStatePanel = () => {};
      const taskFocusPanelElement = null, focusPanelElement = null;
      const recommendedActionPanelElement = null, secondaryWorkbenchPanelElement = null;
      const changeFocusButton = null;
      ${functions}
      ${capture}
      if (kind !== "html") buildWorkbenchHost();
      renderWorkbenchViewState();
      const replacement = document.createElement("main");
      replacement.setAttribute("data-workbench-host", "");
      document.body.replaceChildren(replacement);
      renderWorkbenchViewState();
      return { kind, lookups, kept: workbenchHost === original && original instanceof HTMLElement,
        absent: workbenchHost === null,
        viewState: original?.getAttribute("data-workbench-view-state") ?? null,
        taskId: original?.getAttribute("data-workbench-active-task-focus") ?? null,
        children: original?.childElementCount ?? 0,
        replacementUntouched: replacement.attributes.length === 1 && replacement.childElementCount === 0 };
    });
  })()`);
  expect(result).toEqual([
    { kind: "html", lookups: 1, kept: true, absent: false, viewState: "task-focus", taskId: "focused", children: 0, replacementUntouched: true },
    { kind: "missing", lookups: 1, kept: false, absent: true, viewState: null, taskId: null, children: 0, replacementUntouched: true },
    { kind: "svg", lookups: 1, kept: false, absent: true, viewState: null, taskId: null, children: 0, replacementUntouched: true },
  ]);
  // Execute both spellings on native DOMStringMap setters, which the fake DOM does not model.
  const conversions = await page.evaluate(`(() => {
    let calls = 0;
    const object = { toString() { calls++; return "object focus"; } };
    return ["focus", 7, object, null, undefined, 0, Symbol("focus")].map(taskId => {
      const activeTaskFocus = { taskId };
      function write(template) {
        calls = 0;
        const workbenchHost = document.createElement("main");
        let error = "";
        try {
          if (template) workbenchHost.dataset.workbenchActiveTaskFocus = \`\${activeTaskFocus?.taskId || ""}\`;
          else workbenchHost.dataset.workbenchActiveTaskFocus = activeTaskFocus?.taskId || "";
        } catch (caught) { error = caught.name; }
        return { stored: workbenchHost.getAttribute("data-workbench-active-task-focus"), calls, error };
      }
      return { direct: write(false), template: write(true) };
    });
  })()`);
  for (const result of conversions) expect(result.template).toEqual(result.direct);
  expect(conversions.map((/** @type {{template: {stored: string | null, calls: number, error: string}}} */ result) => result.template)).toEqual([
    { stored: "focus", calls: 0, error: "" },
    { stored: "7", calls: 0, error: "" },
    { stored: "object focus", calls: 1, error: "" },
    { stored: "", calls: 0, error: "" },
    { stored: "", calls: 0, error: "" },
    { stored: "", calls: 0, error: "" },
    { stored: null, calls: 0, error: "TypeError" },
  ]);
});
