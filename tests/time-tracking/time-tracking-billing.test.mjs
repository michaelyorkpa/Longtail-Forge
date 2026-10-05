import { describe, expect, it } from "vitest";
import {
  buildBillingScopes,
  normalizeBillingSessionTimezone,
  normalizeTimeEntries,
  summarizeBillingScopesForRange,
  summarizeProjectBillingRows,
} from "../../src/modules/time-tracking/time-tracking-billing.service.js";

/** @type {import("../../src/types/time-tracking-contracts.d.ts").BillingSettings} */
const baseSettings = {
  workspaceName: "Forge",
  workspaceType: "business",
  defaultBillingRate: "120",
  billingRounding: { enabled: false, increment: "nearestQuarterHour" },
};

/** @param {import("../../src/types/time-tracking-contracts.d.ts").BillingProjectInput[]} projects @returns {import("../../src/types/time-tracking-contracts.d.ts").BillingClientProjectData} */
function clientData(projects) {
  return {
    workspaceProjects: [],
    clients: [{
      id: "client-1",
      name: "Acme",
      status: "Active",
      billable: "yes",
      billing_rate: "100",
      projects,
    }],
  };
}

/** @param {string} id @param {Partial<import("../../src/types/time-tracking-contracts.d.ts").BillingProjectInput>} [overrides] @returns {import("../../src/types/time-tracking-contracts.d.ts").BillingProjectInput} */
function project(id, overrides = {}) {
  return {
    id,
    name: id,
    status: "Active",
    billable: "yes",
    billing_rate: "",
    parent_project_id: "",
    ...overrides,
  };
}

describe("Time Tracking billing pure helpers", () => {
  it("normalizes billing session timezones through the canonical fallback", () => {
    expect(normalizeBillingSessionTimezone({ timezone: "America/Los_Angeles" }))
      .toBe("America/Los_Angeles");
    expect(normalizeBillingSessionTimezone({ timezone: "Not/A_Timezone" }))
      .toBe("America/New_York");
    expect(normalizeBillingSessionTimezone({ timezone: "" }))
      .toBe("America/New_York");
    expect(normalizeBillingSessionTimezone(null))
      .toBe("America/New_York");
  });

  it("normalizes stored entries without changing billable split semantics", () => {
    const entries = normalizeTimeEntries([
      {
        client_id: "client-1",
        client_name: "Acme",
        project_id: "project-1",
        project_name: "Launch",
        task_id: "task-1",
        end_time: "2026-07-14T14:00:00.000Z",
        duration_seconds: "1800",
        billable: "no",
        tags: [{ tag_id: "tag-1" }],
      },
      {
        project_id: "project-2",
        end_time: "not-a-date",
        duration_seconds: "not-a-number",
        billable: "yes",
      },
    ]);

    const firstEntry = first(entries);
    expect(firstEntry).toMatchObject({
      clientId: "client-1",
      projectId: "project-1",
      taskId: "task-1",
      durationSeconds: 1800,
      billable: "no",
    });
    expect(firstEntry.endTime).toEqual(new Date("2026-07-14T14:00:00.000Z"));
    const secondEntry = first(entries.slice(1));
    expect(secondEntry.durationSeconds).toBe(0);
    expect(Number.isNaN(secondEntry.endTime.getTime())).toBe(true);
  });

  it("decorates project hierarchy descendants", () => {
    const scope = first(buildBillingScopes(clientData([
      project("parent"),
      project("child", { parent_project_id: "parent" }),
      project("grandchild", { parent_project_id: "child" }),
    ]), baseSettings));

    expect(required(scope.projects.find((item) => item.id === "parent")).childProjectIds)
      .toEqual(["child", "grandchild"]);
    expect(required(scope.projects.find((item) => item.id === "child")).childProjectIds)
      .toEqual(["grandchild"]);
    expect(required(scope.projects.find((item) => item.id === "grandchild")).childProjectIds)
      .toEqual([]);
  });

  it("summarizes a direct leaf project with billable and non-billable seconds", () => {
    const scopes = buildBillingScopes(clientData([project("leaf")]), baseSettings);
    const entries = normalizeTimeEntries([
      { client_id: "client-1", project_id: "leaf", end_time: "2026-07-14T10:00:00.000Z", duration_seconds: 1800, billable: "yes" },
      { client_id: "client-1", project_id: "leaf", end_time: "2026-07-14T11:00:00.000Z", duration_seconds: 900, billable: "no" },
    ]);
    const summary = first(summarizeBillingScopesForRange(baseSettings, scopes, entries, {
      start: new Date("2026-07-01T00:00:00.000Z"),
      end: new Date("2026-08-01T00:00:00.000Z"),
    }));

    expect(summary.rawSeconds).toBe(2700);
    expect(summary.billableSeconds).toBe(1800);
    expect(summary.displaySeconds).toBe(1800);
    expect(summary.amount).toBe(50);
    expect(summary.projectSummaries).toHaveLength(1);
    expect(first(summary.projectSummaries).project.id).toBe("leaf");
  });

  it("uses an inclusive start and exclusive end range", () => {
    const scopes = buildBillingScopes(clientData([project("leaf")]), baseSettings);
    const entries = normalizeTimeEntries([
      { client_id: "client-1", project_id: "leaf", end_time: "2026-06-30T23:59:59.999Z", duration_seconds: 10, billable: "yes" },
      { client_id: "client-1", project_id: "leaf", end_time: "2026-07-01T00:00:00.000Z", duration_seconds: 20, billable: "yes" },
      { client_id: "client-1", project_id: "leaf", end_time: "2026-07-31T23:59:59.999Z", duration_seconds: 30, billable: "yes" },
      { client_id: "client-1", project_id: "leaf", end_time: "2026-08-01T00:00:00.000Z", duration_seconds: 40, billable: "yes" },
    ]);
    const summary = first(summarizeBillingScopesForRange(baseSettings, scopes, entries, {
      start: new Date("2026-07-01T00:00:00.000Z"),
      end: new Date("2026-08-01T00:00:00.000Z"),
    }));

    expect(summary.rawSeconds).toBe(50);
    expect(summary.billableSeconds).toBe(50);
  });

  it("applies the effective project rounding and inherited billing rate", () => {
    const settings = {
      ...baseSettings,
      billingRounding: { enabled: true, increment: "nearestQuarterHour" },
    };
    const scopes = buildBillingScopes(clientData([project("leaf")]), settings);
    const entries = normalizeTimeEntries([
      { client_id: "client-1", project_id: "leaf", end_time: "2026-07-14T10:00:00.000Z", duration_seconds: 500, billable: "yes" },
      { client_id: "client-1", project_id: "leaf", end_time: "2026-07-14T11:00:00.000Z", duration_seconds: 200, billable: "no" },
    ]);
    const summary = first(summarizeBillingScopesForRange(settings, scopes, entries, {
      start: new Date("2026-07-01T00:00:00.000Z"),
      end: new Date("2026-08-01T00:00:00.000Z"),
    }));

    expect(summary.rawSeconds).toBe(700);
    expect(summary.billableSeconds).toBe(900);
    expect(summary.displaySeconds).toBe(900);
    expect(summary.amount).toBe(25);
    expect(first(summary.projectSummaries).rate).toBe(100);
  });

  it("prices and rounds every project directly before recursively aggregating its branch", () => {
    const scope = first(buildBillingScopes(clientData([
      project("parent", {
        billing_rate: "100",
        billing_rounding: { enabled: true, increment: "nearestQuarterHour" },
      }),
      project("child", {
        parent_project_id: "parent",
        billing_rate: "200",
        billing_rounding: { enabled: true, increment: "nearestHalfHour" },
      }),
      project("grandchild", {
        parent_project_id: "child",
        billing_rate: "300",
        billing_rounding: { enabled: false, increment: "nearestQuarterHour" },
      }),
    ]), baseSettings));
    const entries = normalizeTimeEntries([
      reportEntry("parent", 500, "2026-07-20T10:00:00.000Z"),
      reportEntry("child", 1000, "2026-07-20T11:00:00.000Z"),
      reportEntry("grandchild", 2000, "2026-07-20T12:00:00.000Z"),
    ]);
    const summary = summarizeProjectBillingRows(baseSettings, scope, [first(scope.projects)], entries, {
      period: "custom",
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    }, { includeDescendants: true });
    const parentRow = first(summary.rows);
    const childRow = first(parentRow.childRows || []);
    const grandchildRow = first(childRow.childRows || []);

    expect(parentRow.rawSeconds).toBe(3500);
    expect(parentRow.billableSeconds).toBe(4700);
    expect(parentRow.displaySeconds).toBe(4700);
    expect(parentRow.amount).toBeCloseTo(291.6666667);
    expect(childRow.rawSeconds).toBe(3000);
    expect(childRow.billableSeconds).toBe(3800);
    expect(childRow.amount).toBeCloseTo(266.6666667);
    expect(grandchildRow.rawSeconds).toBe(2000);
    expect(grandchildRow.billableSeconds).toBe(2000);
    expect(grandchildRow.amount).toBeCloseTo(166.6666667);
    expect(summary.totals.seconds).toBe(4700);
    expect(summary.totals.amount).toBeCloseTo(291.6666667);
  });

  it("uses each project's effective billing period for current-period recursive totals", () => {
    const scope = first(buildBillingScopes(clientData([
      project("calendar-parent", { billing_period: { type: "calendarMonth", startDay: 1 } }),
      project("custom-child", {
        parent_project_id: "calendar-parent",
        billing_period: { type: "custom", startDay: 15 },
      }),
    ]), baseSettings));
    const entries = normalizeTimeEntries([
      reportEntry("calendar-parent", 600, "2026-07-10T10:00:00.000Z"),
      reportEntry("custom-child", 700, "2026-07-10T11:00:00.000Z"),
      reportEntry("custom-child", 800, "2026-07-16T11:00:00.000Z"),
    ]);
    const summary = summarizeProjectBillingRows(baseSettings, scope, [first(scope.projects)], entries, {
      period: "current",
    }, {
      includeDescendants: true,
      today: new Date("2026-07-20T12:00:00.000Z"),
    });

    const parentRow = first(summary.rows);
    expect(parentRow.rawSeconds).toBe(1400);
    expect(first(parentRow.childRows || []).rawSeconds).toBe(800);
    expect(summary.totals.seconds).toBe(1400);
  });

  it("keeps descendant-client projects on their owning client's billing defaults", () => {
    const scopes = buildBillingScopes({
      workspaceProjects: [],
      clients: [
        {
          id: "parent-client",
          name: "Parent Client",
          status: "Active",
          billable: "yes",
          billing_rate: "100",
          childScopeIds: ["child-client"],
          projects: [project("parent-project")],
        },
        {
          id: "child-client",
          name: "Child Client",
          status: "Active",
          billable: "yes",
          billing_rate: "250",
          parent_client_id: "parent-client",
          projects: [project("child-client-project")],
        },
      ],
    }, baseSettings);
    const entries = normalizeTimeEntries([
      reportEntry("parent-project", 3600, "2026-07-20T10:00:00.000Z", "parent-client"),
      reportEntry("child-client-project", 3600, "2026-07-20T11:00:00.000Z", "child-client"),
    ]);
    const summaries = summarizeBillingScopesForRange(baseSettings, scopes, entries, {
      start: new Date("2026-07-01T00:00:00.000Z"),
      end: new Date("2026-08-01T00:00:00.000Z"),
    });
    const parent = required(summaries.find((summary) => summary.scope.id === "parent-client"));
    const child = required(summaries.find((summary) => summary.scope.id === "child-client"));

    expect(parent.rawSeconds).toBe(7200);
    expect(parent.amount).toBe(350);
    expect(child.rawSeconds).toBe(3600);
    expect(child.amount).toBe(250);
  });
});

/** @param {string} projectId @param {number} durationSeconds @param {string} endTime @param {string} [clientId] */
function reportEntry(projectId, durationSeconds, endTime, clientId = "client-1") {
  return {
    client_id: clientId,
    project_id: projectId,
    end_time: endTime,
    duration_seconds: durationSeconds,
    billable: "yes",
  };
}

/** @template Item @param {Item[]} items @returns {Item} */
function first(items) {
  if (items.length === 0) {
    throw new Error("Expected at least one item.");
  }
  return /** @type {Item} */ (items[0]);
}

/** @template Item @param {Item | null | undefined} value @returns {Item} */
function required(value) {
  if (value === null || value === undefined) {
    throw new Error("Expected a value.");
  }
  return value;
}
