import { test, expect } from "./support/isolated-workspace.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";
const source = createProjectTextReader().readText("public/js/workbench.js");
test("Task Focus buttons preserve native dataset conversion and failure ordering", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/workbench.html");
  const bodies = ["createTaskFocusActionButton", "createTaskFocusTimerButton"].map(name => extractFunctionBlock(source, name));
  const results = await page.evaluate((bodies) => {
    return bodies.flatMap(body => ["number", "object", "symbol", "throws"].map(kind => {
      const answers = [true, false].map(original => {
        const button = globalThis.document.createElement("button");
        /** @type {string[]} */ const calls = [];
        const id = kind === "number" ? 7 : kind === "symbol" ? Symbol("id") : {
          [Symbol.toPrimitive](/** @type {string} */ hint) { calls.push(hint); if (kind === "throws") throw new RangeError("id conversion"); return "a/b"; },
        };
        const lifted = original ? body.replace('button.dataset.taskId = `${taskId}`;', 'button.dataset.taskId = taskId;').replace('button.dataset.taskId = `${taskId || ""}`;', 'button.dataset.taskId = taskId || "";') : body;
        const fn = new Function("requireView", "actionButton", `return (${lifted});`)(() => ({ createActionButton: () => button }), () => button);
        let failure = "";
        try { fn({ active: { taskId: id }, taskId: id, label: "Action", id: "action", action: "start", disabled: true }); }
        catch (error) { failure = error instanceof Error ? error.name : "unexpected"; }
        return { calls, failure, value: button.dataset.taskId ?? null, action: button.dataset.workbenchTaskFocusAction ?? null, timerAction: button.dataset.workbenchTaskFocusTimerAction ?? null, disabled: button.disabled };
      });
      return { kind, answers };
    }));
  }, bodies);
  for (const { kind, answers } of results) {
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[1].failure).toBe(kind === "symbol" ? "TypeError" : kind === "throws" ? "RangeError" : "");
    expect(answers[1].value).toBe(kind === "number" ? "7" : kind === "object" ? "a/b" : null);
  }
});
