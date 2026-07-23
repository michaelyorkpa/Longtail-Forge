/* global document, window */
// The page.evaluate callbacks below run in the browser, not Node.

// Interaction-dependent accessibility checks that axe cannot judge: keyboard
// reachability, visible focus, Escape/close behavior, modal focus
// containment and return, and no keyboard trap on the covered states. The
// mobile drawer's own focus-return contract is asserted in mobile-nav.spec.mjs.

import { expect, test } from "@playwright/test";
import { SHELL, SMOKE_SURFACES } from "./support/surfaces.mjs";

const dashboard = SMOKE_SURFACES.find((surface) => surface.name === "Dashboard");

async function activeElementInfo(page) {
  return page.evaluate(() => {
    const element = document.activeElement;

    if (!element || element === document.body) {
      return { tag: "body", visibleFocus: false, key: "body" };
    }

    const style = window.getComputedStyle(element);
    const visibleFocus =
      (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
      style.boxShadow !== "none";
    const accessibleLabel =
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.textContent?.trim().slice(0, 20) ||
      "";

    return {
      tag: element.tagName.toLowerCase(),
      key: `${element.tagName}#${element.id}.${element.className}@${accessibleLabel}`,
      visibleFocus,
      inDialog: Boolean(element.closest("dialog[open]")),
    };
  });
}

test("keyboard focus is reachable and visible on the app shell", async ({ page }) => {
  await page.goto(dashboard.path);
  await expect(page.locator(SHELL.primaryNav)).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Tabbing from the top of the document must reach interactive shell
  // controls, each showing a visible focus indicator.
  const seen = [];

  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press("Tab");
    const info = await activeElementInfo(page);

    if (info.tag === "body") {
      continue;
    }

    seen.push(info);
    expect(info.visibleFocus, `focused ${info.tag} must show a visible focus indicator`).toBe(true);
  }

  expect(seen.length, "tabbing must reach interactive controls in the shell").toBeGreaterThanOrEqual(4);
});

test("keyboard focus does not get trapped on the Tasks surface", async ({ page }) => {
  await page.goto("/tasks.html");
  await page.waitForLoadState("networkidle");

  const keys = [];

  for (let press = 0; press < 25; press += 1) {
    await page.keyboard.press("Tab");
    keys.push((await activeElementInfo(page)).key);
  }

  const distinct = new Set(keys);

  expect(distinct.size, "tab must keep moving through distinct controls").toBeGreaterThanOrEqual(5);
  for (let index = 2; index < keys.length; index += 1) {
    expect(
      keys[index] === keys[index - 1] && keys[index] === keys[index - 2] && keys[index] !== "body",
      `focus must not get stuck on ${keys[index]}`,
    ).toBe(false);
  }
});

test("the Add Task modal contains focus and returns it on Escape", async ({ page }) => {
  await page.goto("/tasks.html");
  await page.waitForLoadState("networkidle");

  const trigger = page.locator("button[data-add-task]");

  await trigger.click();
  await expect(page.locator("dialog[open]").last()).toBeVisible();

  // Native modal dialogs make the background inert: repeated Tab presses must
  // keep focus inside the dialog (containment, and no trap because Escape
  // exits below).
  for (let press = 0; press < 15; press += 1) {
    await page.keyboard.press("Tab");
    const info = await activeElementInfo(page);

    expect(info.inDialog, `focus must stay inside the open modal (landed on ${info.key})`).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(trigger, "focus must return to the Add Task trigger after Escape").toBeFocused();
});

test("the Tasks filter sidebar closes on Escape and returns focus", async ({ page }) => {
  await page.goto("/tasks.html");
  await page.waitForLoadState("networkidle");

  const trigger = page.locator("[data-view-slideout-sidebar-trigger]").first();

  await trigger.click();
  await expect(page.locator(".view-slideout-sidebar-drawer.is-open")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".view-slideout-sidebar-drawer.is-open")).toHaveCount(0);
  await expect(trigger, "focus must return to the sidebar trigger after Escape").toBeFocused();
});

test("the open mobile nav drawer has no keyboard trap", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the nav drawer only exists at the mobile viewport");

  await page.goto(dashboard.path);
  await page.locator(SHELL.navToggle).click();
  await expect(page.locator(SHELL.primaryMenu)).toBeVisible();

  // Focus stays within the drawer or on the visible toggle (deliberate
  // containment), and Escape releases it — containment without a trap.
  for (let press = 0; press < 12; press += 1) {
    await page.keyboard.press("Tab");
    const inScope = await page.evaluate(() => {
      const element = document.activeElement;
      const menu = document.getElementById("primary-menu");
      const toggle = document.querySelector("header.site-header .nav-toggle");

      return Boolean(element && (menu?.contains(element) || toggle === element));
    });

    expect(inScope, "focus must stay within the open drawer or on its toggle").toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(page.locator(SHELL.primaryMenu)).toBeHidden();
  await expect(page.locator(SHELL.navToggle)).toBeFocused();
});
