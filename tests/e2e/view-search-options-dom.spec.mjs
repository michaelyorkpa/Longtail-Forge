/* global document, window, Event, KeyboardEvent, HTMLElement, setTimeout */

import { expect, test } from "@playwright/test";

/**
 * The suggestion combobox on real Chromium nodes (`0.33.33.48.1`).
 *
 * `public/js/shared/view-search-options.js` is injected into every rendered page. These cases drive
 * its published `LongtailForge.viewSearchOptions` surface against real elements, so the paths its
 * types describe are exercised by the platform rather than by a fake: the popup is a real `<div>`
 * appended to the body, Enter clicks the first option through `HTMLElement.prototype.click`, and the
 * detached-control cleanup asks the real `document.body.contains`.
 */

/**
 * The dashboard, with the framework's injected search-options surface ready, and any page error
 * collected so a case can assert there was none.
 * @param {import("@playwright/test").Page} page
 */
async function dashboardWithSearchOptions(page) {
  /** @type {string[]} */
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto("/dashboard.html");
  if (!response) {
    throw new Error("page.goto(\"/dashboard.html\") returned no response");
  }
  expect(response.status()).toBe(200);
  await page.waitForFunction(() => Boolean(window.LongtailForge?.viewSearchOptions));
  return errors;
}

test("the combobox renders into a positioned popup, and Enter selects the first option", async ({ page }) => {
  const errors = await dashboardWithSearchOptions(page);
  const result = await page.evaluate(async () => {
    const searchOptions = window.LongtailForge?.viewSearchOptions;
    if (!searchOptions) throw new Error("LongtailForge.viewSearchOptions is not published");
    const input = document.createElement("input");
    input.type = "text";
    document.body.append(input);
    searchOptions.mountSearchOptions(input, [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta", color: "#123456" }], { minChars: 1 });
    const popupId = input.getAttribute("aria-controls") || "";
    const popup = document.getElementById(popupId);
    if (!popup) throw new Error("the mount created no popup");

    input.value = "a";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const rendered = {
      tagName: popup.tagName,
      inBody: popup.parentNode === document.body,
      role: popup.getAttribute("role"),
      hidden: popup.hidden,
      expanded: input.getAttribute("aria-expanded"),
      options: [...popup.querySelectorAll(".view-search-option")].map((option) => option.textContent),
      positioned: [popup.style.left, popup.style.top, popup.style.width, popup.style.maxHeight].every((value) => /^\d+(?:\.\d+)?px$/.test(value)),
    };

    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const afterEnter = {
      prevented: enter.defaultPrevented,
      value: input.value,
      selected: input.dataset.viewSearchOptionValue,
      hidden: popup.hidden,
      expanded: input.getAttribute("aria-expanded"),
      popupStillMounted: document.getElementById(popupId) === popup,
      cleanupStillInstalled: "_viewSearchOptionsCleanup" in input,
    };

    input.value = "b";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    input.dispatchEvent(escape);
    const afterEscape = { hidden: popup.hidden, expanded: input.getAttribute("aria-expanded"), prevented: escape.defaultPrevented };
    return { rendered, afterEnter, afterEscape };
  });

  expect(result.rendered).toEqual({
    tagName: "DIV",
    inBody: true,
    role: "listbox",
    hidden: false,
    expanded: "true",
    options: ["Alpha", "Beta"],
    positioned: true,
  });
  expect(result.afterEnter).toEqual({
    prevented: true,
    value: "Alpha",
    selected: "a",
    hidden: true,
    expanded: "false",
    popupStillMounted: true,
    cleanupStillInstalled: true,
  });
  expect(result.afterEscape).toEqual({ hidden: true, expanded: "false", prevented: false });
  expect(errors).toEqual([]);
});

test("a selection tears the popup down only when its control has left the document", async ({ page }) => {
  const errors = await dashboardWithSearchOptions(page);
  const result = await page.evaluate(async () => {
    const searchOptions = window.LongtailForge?.viewSearchOptions;
    if (!searchOptions) throw new Error("LongtailForge.viewSearchOptions is not published");
    /** Mount one control, type into it, and answer the control with its popup's id. */
    const mount = () => {
      const input = document.createElement("input");
      input.type = "text";
      document.body.append(input);
      searchOptions.mountSearchOptions(input, [{ value: "a", label: "Alpha" }], { minChars: 1 });
      input.value = "a";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return { input, popupId: input.getAttribute("aria-controls") || "" };
    };
    /** @param {{ popupId: string }} entry */
    const chooseFirstOption = (entry) => {
      const option = document.getElementById(entry.popupId)?.querySelector(".view-search-option");
      if (!(option instanceof HTMLElement)) throw new Error("the popup rendered no option");
      option.click();
    };

    const attached = mount();
    const detached = mount();
    chooseFirstOption(attached);
    chooseFirstOption(detached);
    // The cleanup check is deferred to a timer, so leaving the document now is what it sees.
    detached.input.remove();
    await new Promise((resolve) => setTimeout(resolve, 25));
    return {
      attachedPopupMounted: document.getElementById(attached.popupId) !== null,
      attachedCleanupInstalled: "_viewSearchOptionsCleanup" in attached.input,
      attachedValue: attached.input.value,
      detachedPopupMounted: document.getElementById(detached.popupId) !== null,
      detachedCleanupInstalled: "_viewSearchOptionsCleanup" in detached.input,
      detachedValue: detached.input.value,
    };
  });

  expect(result).toEqual({
    attachedPopupMounted: true,
    attachedCleanupInstalled: true,
    attachedValue: "Alpha",
    detachedPopupMounted: false,
    detachedCleanupInstalled: false,
    detachedValue: "Alpha",
  });
  expect(errors).toEqual([]);
});
