/* global document, HTMLElement, HTMLInputElement, HTMLSelectElement, HTMLTextAreaElement, HTMLButtonElement, HTMLFormElement, HTMLDialogElement */
// The page.evaluate callback below runs in the browser, not Node.

// Runtime proof for 0.33.33.43.25.
//
// That checkpoint narrowed the Lists module element handles from `Element | null` to the
// subtypes their reads already assume, through checked lookups in the shape `public/js/files.js`
// established on its way to zero:
//
//   const element = document.querySelector(selector);
//   return element instanceof HTMLSelectElement ? element : null;
//
// The claim that makes this safe is "narrowing only, with no refusal": every handle narrowed
// there is one whose reads already assume the subtype, so a mismatch would be a defect the page
// is already showing rather than a case the lookup newly rejects.
//
// **That claim is about the real DOM, and only the real DOM can settle it.** A unit test can
// prove the lookups narrow correctly; it cannot prove that the element this page actually builds
// for `[data-list-filter-client]` is a `<select>`. If any handle below resolves to `null` or to
// the wrong subtype, the narrowing silently turns a working control into an absent one - which is
// exactly the failure this spec exists to catch before it ships.

import { expect, test } from "@playwright/test";
import { test as isolatedTest } from "./support/isolated-workspace.mjs";

/**
 * Every selector `cacheListsElements` narrows, and the constructor its lookup demands.
 *
 * `page` handles are present on load. `dialog` handles live inside the two modals, which are in
 * the document from the start - they are closed, not absent - so they are checked the same way.
 * @type {ReadonlyArray<{ selector: string, constructorName: string }>}
 */
const NARROWED_HANDLES = [
  { selector: "[data-list-create]", constructorName: "HTMLElement" },
  { selector: "[data-list-filter-status]", constructorName: "FormControl" },
  { selector: "[data-list-filter-type]", constructorName: "FormControl" },
  { selector: "[data-list-filter-reusable]", constructorName: "FormControl" },
  { selector: "[data-list-filter-needed]", constructorName: "FormControl" },
  { selector: "[data-list-filter-archive]", constructorName: "FormControl" },
  { selector: "[data-list-sort]", constructorName: "FormControl" },
  { selector: "[data-list-filter-client]", constructorName: "HTMLSelectElement" },
  { selector: "[data-list-filter-project]", constructorName: "HTMLSelectElement" },
  { selector: "[data-list-filter-assignee]", constructorName: "HTMLSelectElement" },
  { selector: "[data-list-dialog]", constructorName: "HTMLDialogElement" },
  { selector: "[data-list-form]", constructorName: "HTMLFormElement" },
  { selector: "[data-list-title]", constructorName: "FormControl" },
  { selector: "[data-list-type]", constructorName: "FormControl" },
  { selector: "[data-list-description]", constructorName: "FormControl" },
  { selector: "[data-list-client]", constructorName: "HTMLSelectElement" },
  { selector: "[data-list-project]", constructorName: "HTMLSelectElement" },
  { selector: "[data-list-link-target-type]", constructorName: "FormControl" },
  { selector: "[data-list-link-search]", constructorName: "FormControl" },
  { selector: "[data-list-link-results]", constructorName: "FormControl" },
  { selector: "[data-list-link-apply]", constructorName: "FormControl" },
  { selector: "[data-list-save]", constructorName: "FormControl" },
  { selector: "[data-list-item-dialog]", constructorName: "HTMLDialogElement" },
  { selector: "[data-list-item-form]", constructorName: "HTMLFormElement" },
  { selector: "[data-list-item-save]", constructorName: "FormControl" },
];

test("every narrowed Lists handle resolves to the subtype its lookup demands", async ({ page }) => {
  await page.goto("/lists.html");
  await expect(page.locator("main[data-lists-host]")).toBeVisible();
  await expect(page.locator("[data-lists-list]")).toBeAttached();

  const observed = await page.evaluate((handles) => handles.map(({ selector, constructorName }) => {
    const element = document.querySelector(selector);
    if (!element) {
      return { selector, constructorName, found: false, actual: null, narrows: false };
    }
    // The same tests the lookups run, so a pass here is a pass there and not an approximation.
    const narrows = constructorName === "FormControl"
      ? element instanceof HTMLInputElement
        || element instanceof HTMLSelectElement
        || element instanceof HTMLTextAreaElement
        || element instanceof HTMLButtonElement
      : element instanceof (
        constructorName === "HTMLSelectElement" ? HTMLSelectElement
          : constructorName === "HTMLFormElement" ? HTMLFormElement
            : constructorName === "HTMLDialogElement" ? HTMLDialogElement
              : HTMLElement
      );
    return { selector, constructorName, found: true, actual: element.constructor.name, narrows };
  }), NARROWED_HANDLES);

  const missing = observed.filter((entry) => !entry.found).map((entry) => entry.selector);
  expect(missing, "every narrowed handle must exist on the rendered page").toEqual([]);

  const refused = observed
    .filter((entry) => !entry.narrows)
    .map((entry) => `${entry.selector} is ${entry.actual}, which the lookup for ${entry.constructorName} refuses`);
  // This is the whole point: a refusal here means the narrowing turned a working control into an
  // absent one, which the strict compiler cannot see and the page would fail silently on.
  expect(refused, "narrowing must refuse nothing the page actually builds").toEqual([]);
});

test("the narrowed dialog handles carry the members their callers reach for", async ({ page }) => {
  await page.goto("/lists.html");
  await expect(page.locator("main[data-lists-host]")).toBeVisible();

  const members = await page.evaluate(() => {
    const listDialog = document.querySelector("[data-list-dialog]");
    const itemDialog = document.querySelector("[data-list-item-dialog]");
    const itemForm = document.querySelector("[data-list-item-form]");
    return {
      listDialogShowModal: typeof (/** @type {HTMLDialogElement | null} */ (listDialog))?.showModal,
      listDialogReturnValue: typeof (/** @type {HTMLDialogElement | null} */ (listDialog))?.returnValue,
      itemDialogShowModal: typeof (/** @type {HTMLDialogElement | null} */ (itemDialog))?.showModal,
      itemDialogClose: typeof (/** @type {HTMLDialogElement | null} */ (itemDialog))?.close,
      itemFormReset: typeof (/** @type {HTMLFormElement | null} */ (itemForm))?.reset,
      itemFormElements: typeof (/** @type {HTMLFormElement | null} */ (itemForm))?.elements,
    };
  });

  // `showModal`, `close`, `returnValue`, `reset` and `elements` are the five members the narrowed
  // dialog and form handles exist for. Each is read unguarded somewhere on this page.
  expect(members.listDialogShowModal).toBe("function");
  expect(members.listDialogReturnValue).toBe("string");
  expect(members.itemDialogShowModal).toBe("function");
  expect(members.itemDialogClose).toBe("function");
  expect(members.itemFormReset).toBe("function");
  expect(members.itemFormElements).toBe("object");
});

// Runtime proof for 0.33.33.43.44.
//
// The page checked the list, item and link responses against the database column types, but the
// repository's row mappers booleanize `is_reusable` and parse `metadata_json` before anything is
// sent. Every real list was refused, and the page showed "The list collection could not be read."
// whenever a workspace had one. No spec loaded a list, so nothing noticed. This one does: a real
// list with a real item, created through the API in a workspace of its own, loaded by the page.
isolatedTest("a workspace's lists load into the index and open in the detail", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  const title = `Loaded list ${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;

  const created = await api.post("/api/lists", { data: { title, list_type: "checklist" } });
  expect(created.status(), await created.text()).toBe(201);
  const listId = (await created.json()).list.list_id;
  const item = await api.post(`/api/lists/${encodeURIComponent(listId)}/items`, { data: { item_name: "Loaded item" } });
  expect(item.status(), await item.text()).toBe(201);

  await page.goto("/lists.html");
  await expect(page.locator("main[data-lists-host]")).toBeVisible();
  await expect(page.locator("[data-list-detail]")).toContainText("Select a list.");
  await expect(page.locator("[data-list-detail]")).not.toContainText("could not be read");

  // The index lives in the slide-out sidebar, which is closed on load.
  await page.locator("[data-view-slideout-sidebar-trigger]").first().click();
  await expect(page.locator(".view-slideout-sidebar-drawer.is-open")).toBeVisible();
  const indexButton = page.locator(".view-index-list-button", { hasText: title });
  await expect(indexButton).toBeVisible();

  await indexButton.click();
  const detail = page.locator("[data-list-detail]");
  await expect(detail).toContainText(title);
  await expect(detail).toContainText("Loaded item");
  expect(errors).toEqual([]);
});

// Runtime proof for 0.33.33.43.45.
//
// The Lists dialog opens on other pages through the footer Capture action, which lazily imports
// this controller and takes its synchronous dialog-only bootstrap. That bootstrap sat above the
// module's `let` handles and threw "Cannot access 'pageTitle' before initialization", so the
// import rejected and Capture reported the error instead of opening the dialog. This drives the
// product's own path, Workbench -> Capture -> List, and saves a list through it.
isolatedTest("Capture opens and saves a list on a page without the Lists workspace", async ({ isolatedWorkspace }, testInfo) => {
  const { page, api } = isolatedWorkspace;
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  const title = `Captured list ${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}`;

  await page.goto("/workbench.html");
  await expect(page.locator("[data-lists-host]")).toHaveCount(0);
  await page.locator("[data-quick-action-toggle]").click();
  await page.locator('[data-quick-action-id="list"]').click();

  const listDialog = page.locator("[data-list-dialog]");
  await expect(listDialog).toBeVisible();
  await expect(page.locator("[data-quick-action-status]")).not.toContainText("before initialization");
  await expect(page.locator("[data-list-dialog-title]")).toHaveText("Create List");
  await page.locator("[data-list-title]").fill(title);
  await page.locator("[data-list-save]").click();
  await expect(listDialog).toBeHidden();

  await expect.poll(async () => {
    const response = await api.get("/api/lists");
    return JSON.stringify(await response.json());
  }).toContain(title);
  expect(errors).toEqual([]);
});
