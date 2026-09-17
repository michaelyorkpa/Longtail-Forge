import { expect, test } from "./support/isolated-workspace.mjs";

/**
 * The one thing about `0.33.33.39.17` that a double cannot answer.
 *
 * `createActionButton` assigns `options.type` straight to `button.type`, and the DOM types that
 * property as three literals while the runtime accepts any string and **normalizes it on read**.
 * The checkpoint kept that assignment exactly - through the same setter, with no validation and
 * no substituted default - which is only checkable against a real `HTMLButtonElement`, because
 * the fake DOM stores whatever it is given.
 */
test("the action button assigns its type through the native setter, which normalizes on read", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => typeof globalThis.window.LongtailForge?.view?.createActionButton)).toBe("function");

  const observed = await page.evaluate(() => {
    const view = globalThis.window.LongtailForge?.view;
    if (!view) throw new Error("View factory unavailable");
    /** @param {unknown} type */
    const typeOf = (type) => view.createActionButton({ label: "Save", type }).type;
    return {
      defaulted: typeOf(undefined),
      submit: typeOf("submit"),
      reset: typeOf("reset"),
      button: typeOf("button"),
      // An unfamiliar value is assigned, not rejected: the DOM reflects it and the getter answers
      // its own normalization rather than anything this code chose.
      unfamiliar: typeOf("not-a-button-type"),
      numeric: typeOf(42),
      tagName: view.createActionButton({ label: "Save" }).tagName,
    };
  });

  expect(observed.defaulted).toBe("button");
  expect(observed.submit).toBe("submit");
  expect(observed.reset).toBe("reset");
  expect(observed.button).toBe("button");
  expect(observed.unfamiliar).toBe("submit");
  expect(observed.numeric).toBe("submit");
  expect(observed.tagName).toBe("BUTTON");
});

/**
 * The same reconciliation from the icon side, against the real icon module in a real document:
 * a falsy non-false flag is not a false one, and the accessible name follows from that.
 */
test("the real icon writer tells a literal false apart from a falsy non-false flag in a real document", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => typeof globalThis.window.LongtailForge?.icons?.createIconButton)).toBe("function");

  const observed = await page.evaluate(() => {
    const icons = globalThis.window.LongtailForge?.icons;
    if (!icons) throw new Error("Icon factory unavailable");
    /** @param {unknown} iconOnly */
    const build = (iconOnly) => {
      const button = icons.createIconButton({ icon: "save", label: "Save", iconOnly });
      return { iconOnly: button.classList.contains("icon-button"), label: button.getAttribute("aria-label") };
    };
    return { absent: build(undefined), zero: build(0), empty: build(""), literalFalse: build(false) };
  });

  expect(observed.absent).toEqual({ iconOnly: true, label: "Save" });
  expect(observed.zero).toEqual({ iconOnly: true, label: "Save" });
  expect(observed.empty).toEqual({ iconOnly: true, label: "Save" });
  expect(observed.literalFalse).toEqual({ iconOnly: false, label: null });
});
