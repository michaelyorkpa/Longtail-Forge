import { test, expect } from "./support/isolated-workspace.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
test("disclosure writes preserve native, alternate and foreign-document element behavior", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/workbench.html");
  const bodies = ["setWorkbenchDisclosureOpen", "updateDisclosureExpandedState"].map(name => extractFunctionBlock(source, name));
  const results = await page.evaluate(bodies => {
    const run = new Function(`${bodies.join("\n")} return setWorkbenchDisclosureOpen;`)();
    const frame = globalThis.document.createElement("iframe");
    globalThis.document.body.append(frame);
    const foreign = frame.contentDocument;
    if (!foreign) throw new Error("foreign document required");
    const elements = [globalThis.document.createElement("details"), globalThis.document.createElement("div"), foreign.createElement("details")];
    const result = elements.map(element => {
      const summary = element.ownerDocument.createElement("summary"); element.append(summary);
      run(element, "false");
      const opened = [Reflect.get(element, "open"), summary.getAttribute("aria-expanded"), element.dataset.workbenchExpanded];
      run(element, 0);
      const closed = [Reflect.get(element, "open"), summary.getAttribute("aria-expanded"), element.dataset.workbenchExpanded];
      return { opened, closed };
    });
    frame.remove(); return result;
  }, bodies);
  expect(results).toHaveLength(3);
  for (const result of results) expect(result).toEqual({ opened: [true, "true", "true"], closed: [false, "false", "false"] });
});
