/* global window */
// The addInitScript and page.evaluate callbacks below run in the browser, not Node.

// Cold-load proof for 0.33.33.35.1.1.
//
// Notes, Lists, Files, and Tasks build their workspace surface from a server-delivered view
// descriptor. Before this checkpoint the shell was built synchronously at script evaluation,
// against a workspace context hydrated from `localStorage.lf_workspace_context` — which is
// legitimately absent on a first visit, in a private window, after cleared site data, or
// straight after a logout. On that path the module rendered its own local fallback descriptor
// instead of what the server delivered, and nothing re-rendered when the real context arrived.
//
// This spec pins the path the fallback was hiding. `0.33.33.35.1.2` deletes those fallbacks,
// and it is safe to do so only while these assertions hold.
//
// The cold state is produced deliberately rather than assumed: navigation.js writes the
// context back to localStorage during the very first load, so reading storage after a
// navigation proves nothing about what the module script saw. The spec clears storage, then
// records the pre-script value from an init script that runs ahead of every page script, so
// the precondition is observed at the moment that matters.

import { expect, test } from "@playwright/test";
import { requireSmokeSurface } from "./support/surfaces.mjs";

const WORKSPACE_CONTEXT_STORAGE_KEY = "lf_workspace_context";
const COLD_LOAD_PROBE_KEY = "ltf_e2e_workspace_context_at_load";

/**
 * Anatomy each module's descriptor render produces. The protected views ship only the empty
 * host element, so every selector below exists solely because the shell was built.
 * @type {ReadonlyArray<{ surface: string, rendered: string }>}
 */
const DESCRIPTOR_SURFACES = [
  { surface: "Notes", rendered: "[data-notes-list]" },
  { surface: "Lists", rendered: "[data-lists-list]" },
  { surface: "Files", rendered: "[data-file-list]" },
  { surface: "Tasks", rendered: "[data-task-list]" },
];

for (const { surface, rendered } of DESCRIPTOR_SURFACES) {
  test(`${surface} builds its view shell on a cold load with no stored workspace context`, async ({ page }) => {
    const smoke = requireSmokeSurface(surface);

    // Force the cold state ahead of every page script, then read it back so the precondition
    // is observed rather than assumed. Clearing after a navigation would race the writes the
    // first load has already started, and the document element does not exist yet at
    // document-start, so the observation is parked in session storage - which is also typed,
    // and this spec belongs to a program that is permanently at zero strict diagnostics.
    await page.addInitScript(({ key, probe }) => {
      const storedAtLoad = window.localStorage.getItem(key);
      window.localStorage.removeItem(key);
      window.sessionStorage.setItem(probe, storedAtLoad === null ? "absent" : "present");
    }, { key: WORKSPACE_CONTEXT_STORAGE_KEY, probe: COLD_LOAD_PROBE_KEY });

    await page.goto(smoke.path);

    const contextAtLoad = await page.evaluate((probe) => window.sessionStorage.getItem(probe), COLD_LOAD_PROBE_KEY);
    expect(
      contextAtLoad,
      `${surface} must be exercised with no stored workspace context when its script runs`,
    ).toBe("absent");

    await expect(page.locator(smoke.host)).toBeVisible();
    await expect(page.locator(rendered)).toBeAttached();
  });
}
