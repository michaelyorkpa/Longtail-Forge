import { expect, test } from "./support/isolated-workspace.mjs";

/**
 * A floating action menu's outside-dismissal, against real pointers, real SVG and a real realm.
 *
 * `0.33.33.39.23` narrowed the value `handlePointerDown` hands to `menu.contains` with the
 * builder's own `isNode`, which asks for a numeric `nodeType` rather than a realm's `Node`
 * constructor. The DOM double can prove the inside/outside/null/malformed rule, but only a real
 * browser has pointer dispatch, SVG from the real icon module, and a second realm - so these two
 * cases own that half. A guard written as `instanceof Node` would pass every case in the double
 * and fail the cross-realm one here.
 */

const MENU = ".e2e-floating-menu";

test("a real pointer inside the menu keeps it open, and one outside closes it", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => typeof globalThis.window.LongtailForge?.view?.createDetailActionMenu)).toBe("function");

  await page.evaluate(() => {
    const view = globalThis.window.LongtailForge?.view;
    if (!view) throw new Error("View factory unavailable");
    const doc = globalThis.document;
    const menu = view.createDetailActionMenu({
      actions: [{ label: "Edit", action: "edit", icon: "edit" }],
      ariaLabel: "E2E actions",
      className: "e2e-floating-menu",
    });
    // Fixed hosts, so both targets are on screen above the app shell wherever the page scrolled.
    const host = doc.createElement("div");
    host.style.cssText = "position:fixed;left:16px;top:96px;z-index:10000;background:#fff";
    host.append(menu);
    const outside = doc.createElement("div");
    outside.className = "e2e-outside";
    outside.textContent = "Outside";
    outside.style.cssText = "position:fixed;right:16px;bottom:16px;width:96px;height:40px;z-index:10000;background:#eee";
    doc.body.append(host, outside);
  });

  const isOpen = () => page.evaluate((selector) => {
    const menu = globalThis.document.querySelector(selector);
    return menu instanceof globalThis.HTMLDetailsElement && menu.open;
  }, MENU);

  await page.locator(`${MENU} > summary`).click();
  await expect.poll(isOpen).toBe(true);

  // Press on the icon inside the action button: the pointerdown target is SVG, and it is inside.
  const icon = page.locator(`${MENU} button svg`).first();
  await expect(icon).toBeVisible();
  await icon.hover();
  await page.mouse.down();
  expect(await isOpen(), "a pointer that lands on the SVG inside the menu leaves it open").toBe(true);
  // Releasing completes a click on the action button, which the menu's own click handler closes.
  await page.mouse.up();
  await expect.poll(isOpen).toBe(false);

  await page.locator(`${MENU} > summary`).click();
  await expect.poll(isOpen).toBe(true);
  await page.locator(".e2e-outside").click();
  await expect.poll(isOpen, { message: "a pointer that lands outside closes the menu" }).toBe(false);
});

test("a node from another realm is still a node, inside the menu or out", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => typeof globalThis.window.LongtailForge?.view?.createDetailActionMenu)).toBe("function");

  const observed = await page.evaluate(async () => {
    const view = globalThis.window.LongtailForge?.view;
    if (!view) throw new Error("View factory unavailable");
    const doc = globalThis.document;

    const frame = doc.createElement("iframe");
    doc.body.append(frame);
    const foreignDoc = frame.contentDocument;
    if (!foreignDoc) throw new Error("Same-origin frame document unavailable");

    const menu = view.createDetailActionMenu({ actions: [{ label: "Edit", action: "edit" }], ariaLabel: "E2E actions" });
    if (!(menu instanceof globalThis.HTMLDetailsElement)) throw new Error("Expected a details element");
    doc.body.append(menu);

    const opened = () => new Promise((resolve) => { menu.addEventListener("toggle", resolve, { once: true }); });
    /** @param {EventTarget} target */
    const press = (target) => target.dispatchEvent(new globalThis.PointerEvent("pointerdown", { bubbles: true, composed: true }));

    const firstOpen = opened();
    menu.open = true;
    await firstOpen;

    // Created in the frame's realm, then placed inside the menu in this document.
    const insideForeign = foreignDoc.createElement("span");
    insideForeign.textContent = "foreign inside";
    const list = menu.querySelector(".view-detail-action-menu-list");
    if (!list) throw new Error("Menu list unavailable");
    list.append(insideForeign);
    press(insideForeign);
    const openAfterInside = menu.open;

    const outsideForeign = foreignDoc.createElement("span");
    doc.body.append(outsideForeign);
    press(outsideForeign);
    const openAfterOutside = menu.open;

    return {
      // The property the guard must not depend on: this node is not an instance of this realm's Node.
      isThisRealmsNode: insideForeign instanceof globalThis.Node,
      nodeType: insideForeign.nodeType,
      openAfterInside,
      openAfterOutside,
    };
  });

  expect(observed.isThisRealmsNode, "the node really does belong to the frame's realm").toBe(false);
  expect(observed.nodeType).toBe(1);
  expect(observed.openAfterInside, "a cross-realm node inside the menu is inside").toBe(true);
  expect(observed.openAfterOutside, "a cross-realm node outside the menu is outside").toBe(false);
});
