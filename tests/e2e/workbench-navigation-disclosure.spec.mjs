import { test, expect } from "./support/isolated-workspace.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
test("restoration establishes page-built details and skips unrelated matching elements", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/workbench.html");
  await expect(page.locator('[data-workbench-card="active-work-timers"]')).toBeAttached();
  const bodies = ["setWorkbenchDisclosureOpen", "updateDisclosureExpandedState", "restoreCardState", "workbenchCardField", "workbenchCardPropertyKey", "isTimerWorkbenchCard", "readCardState"].map(name => extractFunctionBlock(source, name));
  const result = await page.evaluate(bodies => {
    const produced = globalThis.document.querySelector('[data-workbench-card="active-work-timers"]');
    if (!(produced instanceof globalThis.HTMLDetailsElement)) throw new Error("page-built details required");
    const card = produced.cloneNode(true);
    if (!(card instanceof globalThis.HTMLDetailsElement)) throw new Error("details clone required");
    card.dataset.workbenchCard = "restoration-proof";
    const unrelated = globalThis.document.createElement("div");
    unrelated.dataset.workbenchCard = "unrelated-proof";
    globalThis.document.body.append(card, unrelated);
    const restore = new Function(`const WORKBENCH_CARD_STATE_KEY = "lf_workbench_cards_v1"; function syncTimerSectionOpenState() {} ${bodies.join("\n")} return restoreCardState;`)();
    const answers = ["false", 0].map(value => {
      globalThis.localStorage.setItem("lf_workbench_cards_v1", JSON.stringify({ "restoration-proof": value, "unrelated-proof": true }));
      restore();
      return { open: card.open, expanded: card.querySelector("summary")?.getAttribute("aria-expanded"), dataset: card.dataset.workbenchExpanded, unrelatedHasOpen: "open" in unrelated };
    });
    card.remove(); unrelated.remove(); return answers;
  }, bodies);
  expect(result).toEqual([
    { open: true, expanded: "true", dataset: "true", unrelatedHasOpen: false },
    { open: false, expanded: "false", dataset: "false", unrelatedHasOpen: false },
  ]);
});

test("native disclosure activation and focus restoration keep their accessible behavior", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/workbench.html");
  const card = page.locator('[data-workbench-card="active-work-timers"]');
  await expect(card).toBeAttached();
  const summary = card.locator(":scope > summary");
  const initiallyOpen = await card.evaluate(element => element.hasAttribute("open"));
  await summary.click();
  await expect(summary).toHaveAttribute("aria-expanded", String(!initiallyOpen));
  await expect(card).toHaveAttribute("data-workbench-expanded", String(!initiallyOpen));
  await summary.press("Enter");
  await expect(summary).toHaveAttribute("aria-expanded", String(initiallyOpen));
  await summary.press("Escape");
  await expect(summary).toHaveAttribute("aria-expanded", String(initiallyOpen));
  const bodies = ["updateDisclosureExpandedState", "focusActiveFocusQuestion"].map(name => extractFunctionBlock(source, name));
  const result = await page.evaluate(bodies => {
    const update = new Function(`${bodies[0]}; return updateDisclosureExpandedState;`)();
    const unrelated = globalThis.document.createElement("div");
    unrelated.append(globalThis.document.createElement("summary"));
    update(unrelated);
    const details = globalThis.document.createElement("details");
    const summary = globalThis.document.createElement("summary"); details.append(summary);
    details.open = true; update(details);
    const frame = globalThis.document.createElement("iframe"); globalThis.document.body.append(frame);
    const foreign = frame.contentDocument?.createElement("button");
    if (!foreign) throw new Error("foreign document required");
    /** @type {string[]} */ const calls = [];
    const fallback = globalThis.document.createElement("button");
    Object.defineProperty(fallback, "focus", { value() { calls.push("fallback"); } });
    const focus = new Function("document", "focusModeList", `${bodies[1]}; return focusActiveFocusQuestion;`);
    const elements = [globalThis.document.createElement("button"), globalThis.document.createElementNS("http://www.w3.org/2000/svg", "svg"), foreign];
    elements.forEach((element, index) => {
      Object.defineProperty(element, "focus", { value: /** @this {Element} */ function () { if (this !== element) throw new Error("focus receiver changed"); calls.push(String(index)); } });
      focus({ querySelector: () => element }, { querySelector: () => fallback })();
    });
    const xml = globalThis.document.implementation.createDocument(null, "control").documentElement;
    for (const active of [null, xml, Object.defineProperty(globalThis.document.createElement("button"), "focus", { value: 7 })])
      focus({ querySelector: () => active }, { querySelector: () => fallback })();
    frame.remove();
    return { calls, unrelated: unrelated.dataset.workbenchExpanded ?? null, expanded: summary.getAttribute("aria-expanded"), dataset: details.dataset.workbenchExpanded };
  }, bodies);
  expect(result).toEqual({ calls: ["0", "1", "2", "fallback", "fallback", "fallback"], unrelated: null, expanded: "true", dataset: "true" });
});
