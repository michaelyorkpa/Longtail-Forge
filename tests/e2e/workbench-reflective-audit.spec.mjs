import { test, expect } from "./support/isolated-workspace.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
test("badge direct setters match native conversion and failure ordering", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/workbench.html");
  const result = await page.evaluate(body => {
    const original = body.replace('element.dataset.badgeType = `${type}`;', 'Reflect.set(element.dataset, "badgeType", type);').replace('element.textContent = label === null || label === undefined ? "" : `${label}`;', 'Reflect.set(element, "textContent", label);');
    return ["null", "undefined", "number", "object", "symbol-label", "symbol-type", "throw-label", "throw-type"].map(kind => {
      const answers = [original, body].map(code => {
        /** @type {string[]} */ const calls = [];
        const label = kind === "null" ? null : kind === "undefined" ? undefined : kind === "number" ? 7 : kind === "symbol-label" ? Symbol("label") : { [Symbol.toPrimitive](/** @type {string} */ hint) { calls.push(`label:${hint}`); if (kind === "throw-label") throw new RangeError("label"); return "Label"; } };
        const type = kind === "symbol-type" ? Symbol("type") : { [Symbol.toPrimitive](/** @type {string} */ hint) { calls.push(`type:${hint}`); if (kind === "throw-type") throw new RangeError("type"); return "kind"; } };
        let text = null, badgeType = null, failure = "";
        try { const element = new Function(`${code}; return badge;`)()(label, type); text = element.textContent; badgeType = element.dataset.badgeType; }
        catch (error) { failure = error instanceof Error ? error.name : "unexpected"; }
        return { calls, text, badgeType, failure };
      });
      return { kind, answers };
    });
  }, extractFunctionBlock(source, "badge"));
  for (const { kind, answers } of result) {
    expect(answers[1], kind).toEqual(answers[0]);
    expect(answers[1].failure).toBe(kind.startsWith("symbol") ? "TypeError" : kind.startsWith("throw") ? "RangeError" : "");
  }
});
test("card visibility proves the HTML recipient and does not add hidden to SVG", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/workbench.html");
  await expect(page.locator('[data-workbench-card="active-work-timers"]')).toBeAttached();
  const bodies = ["renderRegisteredWorkbenchCards", "workbenchCardField", "workbenchCardPropertyKey"].map(name => extractFunctionBlock(source, name));
  const result = await page.evaluate(bodies => {
    const html = globalThis.document.querySelector('[data-workbench-card="active-work-timers"]');
    if (!(html instanceof globalThis.HTMLElement)) throw new Error("page-built HTML card required");
    const svg = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.dataset.workbenchCard = "svg-proof"; svg.dataset.workbenchRenderer = "active-work-timers";
    globalThis.document.body.append(svg);
    let rendered = 0;
    /** @type {{ registry: { workbenchCards: { moduleId: string, renderer: string }[] } }} */
    const state = { registry: { workbenchCards: [] } };
    const renderers = { "active-work-timers": () => { rendered++; } };
    const render = new Function("state", "workbenchCardRenderers", `${bodies.join("\n")}; return renderRegisteredWorkbenchCards;`)(state, renderers);
    render();
    const hidden = html.hidden;
    state.registry.workbenchCards = [{ moduleId: "time-tracking", renderer: "active-work-timers" }];
    render();
    const answer = { hidden, shown: !html.hidden, svgHasHidden: "hidden" in svg, rendered };
    svg.remove(); return answer;
  }, bodies);
  expect(result).toEqual({ hidden: true, shown: true, svgHasHidden: false, rendered: 2 });
});
