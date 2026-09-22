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
    if (!(produced instanceof HTMLDetailsElement)) throw new Error("page-built details required");
    const card = produced.cloneNode(true);
    if (!(card instanceof HTMLDetailsElement)) throw new Error("details clone required");
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
