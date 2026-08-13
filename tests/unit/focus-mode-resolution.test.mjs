import { describe, expect, it } from "vitest";
import {
  FOCUS_MODE_IDS,
  listFocusModes,
  resolveFocusMode,
} from "../../src/services/work-focus-modes.service.js";

// These tests pass workspaceType through input so no workspace row lookup
// (and therefore no database) is involved: context resolution stays pure.

describe("resolveFocusMode", () => {
  it("resolves the default start-my-day mode with its ranked candidate query", async () => {
    const resolved = await resolveFocusMode({}, { workspaceType: "business" });
    expect(resolved.id).toBe(FOCUS_MODE_IDS.startMyDay);
    expect(resolved.scope.type).toBe("workspace");
    expect((resolved.candidateQuery.rankBuckets || []).length).toBeGreaterThan(0);
    expect(resolved.candidateQuery.excludeStatusFilters).toEqual(["blocked"]);
    expect(resolved.summary).toContain("as of");
  });

  it("accepts dual-cased mode id inputs", async () => {
    const camel = await resolveFocusMode({}, { modeId: "in-progress", workspaceType: "business" });
    const snake = await resolveFocusMode({}, { mode_id: "in-progress", workspaceType: "business" });
    expect(camel.id).toBe("in-progress");
    expect(snake.id).toBe(camel.id);
  });

  it("falls back to start-my-day for an unknown mode id", async () => {
    const resolved = await resolveFocusMode({}, { modeId: "not-a-mode", workspaceType: "business" });
    expect(resolved.id).toBe(FOCUS_MODE_IDS.startMyDay);
  });

  it("rejects a mode that is unavailable for the workspace type", async () => {
    await expect(resolveFocusMode({}, { modeId: FOCUS_MODE_IDS.clientFocus, workspaceType: "personal" }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it("reports the required selection for client focus without reading hierarchy data", async () => {
    const modes = await listFocusModes({}, { workspaceType: "business" });
    const clientFocus = modes.find((mode) => mode.id === FOCUS_MODE_IDS.clientFocus);
    expect(clientFocus?.requiredSelection).toBe("client");
    expect(clientFocus?.scope).toBe("client");
  });

  it("reserves blocked candidates for the blocked-review mode", async () => {
    const blocked = await resolveFocusMode({}, {
      modeId: FOCUS_MODE_IDS.reviewBlockedWork,
      workspaceType: "business",
    });
    const due = await resolveFocusMode({}, {
      modeId: FOCUS_MODE_IDS.whatsDueNext,
      workspaceType: "business",
    });

    expect(blocked.candidateQuery.statusFilters).toEqual(["blocked"]);
    expect(blocked.candidateQuery.excludeStatusFilters).toBeUndefined();
    expect(due.candidateQuery.excludeStatusFilters).toEqual(["blocked"]);
  });
});

describe("listFocusModes", () => {
  it("offers client focus only where the workspace type supports clients", async () => {
    const business = (await listFocusModes({}, { workspaceType: "business" })).map((mode) => mode.id);
    const personal = (await listFocusModes({}, { workspaceType: "personal" })).map((mode) => mode.id);

    expect(business).toContain(FOCUS_MODE_IDS.clientFocus);
    expect(personal).not.toContain(FOCUS_MODE_IDS.clientFocus);
    expect(personal).toContain(FOCUS_MODE_IDS.startMyDay);
  });
});
