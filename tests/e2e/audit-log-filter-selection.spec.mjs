// Rendered proof for the one filter behaviour the lifted fixture cannot observe.
//
// `replaceSelectOptions` rebuilds a catalogue and then restores the prior selection if the new
// catalogue still offers it. In `scripts/test-support/fake-dom.mjs` a select's `value` is a plain
// property that `replaceChildren` never disturbs, so the restore is indistinguishable from doing
// nothing. A real `<select>` derives `value` from its options and resets when they are replaced,
// which is the only place that restore is visible - so it is proven here rather than asserted
// wrongly in `tests/unit/audit-log-filter-query-contracts.test.mjs`.

import { expect, test } from "@playwright/test";

const FILTER_OPTIONS = {
  changeTypes: ["create", "soft_delete"],
  clients: [],
  projects: [{ label: "Project One", value: "p1" }],
  recordTypes: ["time_entry"],
  users: [
    { label: "Ada Lovelace", value: "u1" },
    { label: "Grace Hopper", value: "u2" },
  ],
  workspaces: [],
};

const ENVELOPE = {
  auditLogs: [],
  filterOptions: FILTER_OPTIONS,
  pagination: {
    hasMore: false,
    limit: 50,
    maxPageSize: 500,
    nextCursor: "",
    offset: 0,
    returned: 0,
    total: 0,
  },
  workspaceId: "",
};

test("the audit filter keeps a still-offered selection when the catalogues repaint", async ({ page }) => {
  /** @type {string[]} */
  const requestedActors = [];

  await page.route("**/api/audit-logs?**", async (route) => {
    requestedActors.push(new URL(route.request().url()).searchParams.get("actorUserId") || "");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(ENVELOPE) });
  });

  const response = await page.goto("/audit-log.html");
  if (!response) {
    throw new Error("page.goto(\"/audit-log.html\") returned no response");
  }
  expect(response.status()).toBe(200);

  const userFilter = page.locator("[data-audit-user-filter]");

  // The catalogue arrives from the envelope, so the load has completed before anything is chosen.
  await expect(userFilter.locator("option")).toHaveCount(3);
  await expect(userFilter.locator("option:checked")).toHaveText("All users");

  await userFilter.selectOption("u2");
  await expect(userFilter.locator("option:checked")).toHaveText("Grace Hopper");

  await page.locator("[data-audit-filters] button[type=submit]").click();

  // The repaint rebuilt every catalogue; the selection this page had must survive it.
  await expect.poll(() => requestedActors.length).toBeGreaterThan(1);
  expect(requestedActors.at(-1)).toBe("u2");
  await expect(userFilter.locator("option")).toHaveCount(3);
  await expect(userFilter.locator("option:checked")).toHaveText("Grace Hopper");

  // Both catalogues came back empty, so the page marks their controls hidden.
  //
  // The **attribute** is what is asserted, not visibility. `label { display: grid }` in
  // `public/css/longtail-forge.css` is an author rule, so it beats the user-agent stylesheet's
  // `[hidden] { display: none }`, and these two `<label hidden>` controls carry no `[hidden]`
  // safeguard rule of their own - the pattern this stylesheet uses elsewhere. They therefore
  // still render. That is pre-existing rendering behaviour on a surface this checkpoint only
  // types; asserting `toBeHidden()` here would fail, and asserting `toBeVisible()` would pin the
  // defect as intended. Neither is this spec's business, so it pins the decision the controller
  // actually makes.
  await expect(page.locator("[data-audit-client-filter-control]")).toHaveAttribute("hidden", "");
  await expect(page.locator("[data-audit-workspace-filter-control]")).toHaveAttribute("hidden", "");
});
