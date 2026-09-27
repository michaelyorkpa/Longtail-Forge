import { test, expect } from "./support/isolated-workspace.mjs";

test("rendered Inspector dispatches the numeric registration unchanged and retains cancel and complete outcomes", async ({ isolatedWorkspace }, testInfo) => {
  const { page } = isolatedWorkspace;
  const items = Array.from({ length: 6 }, (_, index) => ({ moduleId: "notes", recordType: "note", recordId: `record-${index}`, candidateId: `candidate-${index}`, title: index === 5 ? "Numeric Inspector action" : `Recommendation ${index}`, contextLabel: "Inspector proof", primaryAction: { type: "module-action", id: index === 5 ? 7 : "7", label: "Open note" } }));
  await page.route("**/api/workbench/focus-candidates?*", route => route.fulfill({ json: { items } }));
  await page.goto("/workbench.html");
  await expect(page.locator("[data-workbench-inspector-item]")).toHaveCount(1);
  await page.evaluate(`(() => {
    const registry = window.LongtailForge.moduleActions;
    document.body.dataset.numericOpens = "0";
    document.body.dataset.stringOpens = "0";
    registry.register({ id: "7", moduleId: "notes", open(params, host) { document.body.dataset.stringOpens = "1"; host.cancel(); } });
    registry.register({ id: 7, moduleId: "notes", open(params, host) {
      document.body.dataset.numericOpens = String(Number(document.body.dataset.numericOpens) + 1);
      document.body.dataset.numericRecord = params.recordId;
      document.body.dataset.numericCandidate = params.candidateId;
      if (document.body.dataset.numericOpens === "1") host.cancel(); else host.complete({ saved: true });
    } });
  })()`);
  const openInspector = page.getByRole("button", { name: "Open Inspector", exact: true });
  if (testInfo.project.name === "mobile") await openInspector.click();
  const button = page.locator("[data-workbench-inspector-item]").getByRole("button", { name: "Open note: Numeric Inspector action", exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator("body")).toHaveAttribute("data-numeric-opens", "1");
  await expect(button).toBeVisible();
  await button.click();
  await expect(page.locator("body")).toHaveAttribute("data-numeric-opens", "2");
  await expect(page.locator("body")).toHaveAttribute("data-string-opens", "0");
  await expect(page.locator("body")).toHaveAttribute("data-numeric-record", "record-5");
  await expect(page.locator("body")).toHaveAttribute("data-numeric-candidate", "candidate-5");
  await expect(page).toHaveURL(/\/workbench\.html$/);
});

test("native location fallback preserves destinations and synchronous conversion, with the authorized Symbol wording", async ({ isolatedWorkspace, browser }, testInfo) => {
  const { page } = isolatedWorkspace;
  await page.route("**/__location-proof/**", route => route.fulfill({ contentType: "text/html", body: "<title>Location proof</title>" }));
  await page.route("**/0", route => route.fulfill({ contentType: "text/html", body: "<title>Zero</title>" }));
  // The application forbids embedded pages. This controlled same-origin page measures
  // the native setter without changing or bypassing the application's frame policy.
  await page.route("**/workbench-location-proof.html", route => route.fulfill({ contentType: "text/html", body: "<body>Native location proof</body>" }));
  await page.goto("/workbench-location-proof.html");
  // The original setter deliberately receives opaque values. Keep both native browser
  // expressions inside the evaluated source rather than asserting a DOM setter type.
  const result = await page.evaluate(`(async () => {
    const results = [];
    for (const kind of ["string", "zero", "object", "symbol"]) {
      for (const template of [false, true]) {
        const frame = document.createElement("iframe");
        await new Promise(resolve => { frame.onload = resolve; document.body.append(frame); });
        let conversions = 0;
        const value = kind === "string" ? "/__location-proof/string" : kind === "zero" ? 0
          : kind === "symbol" ? Symbol("href") : { toString() { conversions++; return "/__location-proof/object"; } };
        let synchronous = true;
        const row = { kind, template, conversions: 0, destination: "", name: "", message: "", synchronous: false };
        const loaded = new Promise(resolve => { frame.onload = resolve; });
        try {
          if (template) frame.contentWindow.location.href = TEMPLATE_VALUE;
          else frame.contentWindow.location.href = value;
          synchronous = false;
          await loaded;
          row.destination = new URL(frame.contentWindow.location.href).pathname;
        } catch (error) {
          row.name = error.name; row.message = error.message; row.synchronous = synchronous;
        }
        row.conversions = conversions;
        results.push(row); frame.remove();
      }
    }
    return results;
  })()`.replace("TEMPLATE_VALUE", "`" + "$" + "{value}`"));
  await testInfo.attach("chromium-location-before-after", { body: JSON.stringify({ version: browser.version(), result }, null, 2), contentType: "application/json" });
  for (let index = 0; index < 6; index += 2) {
    expect(result[index + 1].destination).toBe(result[index].destination);
    expect(result[index + 1].conversions).toBe(result[index].conversions);
  }
  expect(result[0].destination).toBe("/__location-proof/string");
  expect(result[2].destination).toBe("/0");
  expect(result[4].destination).toBe("/__location-proof/object");
  expect(result[4].conversions).toBe(1);
  expect(result[6]).toMatchObject({ name: "TypeError", message: "Failed to set the 'href' property on 'Location': Cannot convert a Symbol value to a string", synchronous: true });
  expect(result[7]).toMatchObject({ name: "TypeError", message: "Cannot convert a Symbol value to a string", synchronous: true });
});
