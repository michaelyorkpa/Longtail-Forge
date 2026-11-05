import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  PUBLIC_DEMO_ACTIVATION_CONTRACT,
  PUBLIC_DEMO_ACTIVE_OPERATION,
  PUBLIC_DEMO_FAILED_PREFIX,
  PUBLIC_DEMO_PREVIOUS_PREFIX,
  PUBLIC_DEMO_PRUNING_PREFIX,
  PUBLIC_DEMO_RETAINED_UNITS,
  parsePublicDemoActivationArgs,
  runPublicDemoActivationOperation,
} from "../../scripts/lib/public-demo-baseline-activation.mjs";
import { assertPublicDemoUnitScansClean } from "../../scripts/lib/public-demo-baseline-candidate.mjs";

const environment = Object.freeze({
  DEMO_MODE: "true",
  LONGTAIL_DEPLOYMENT_MODE: "compose",
  LONGTAIL_ENV: "production",
  LONGTAIL_PUBLIC_URL: "https://demo.longtailforge.com",
});
// Completed resets, oldest first. The newest identity completed earliest, so a prune that ordered by
// completion time instead of by the identity's timestamp would keep the wrong units.
const COMPLETED = Object.freeze([
  { operationId: "20261104T220944Z-manual-3701280", completedAt: "2026-11-04T22:17:30.000Z" },
  { operationId: "20261104T230001Z-scheduled-3710052", completedAt: "2026-11-04T23:04:01.000Z" },
  { operationId: "20261105T000314Z-boot-1233", completedAt: "2026-11-05T00:07:51.000Z" },
  { operationId: "20261105T010000Z-scheduled-11208", completedAt: "2026-11-05T00:00:00.000Z" },
]);
const NEWEST_TWO = ["20261105T010000Z-scheduled-11208", "20261105T000314Z-boot-1233"];
const OLDER = ["20261104T230001Z-scheduled-3710052", "20261104T220944Z-manual-3701280"];
const INCIDENT = "20261102T160001Z-scheduled-3631091";
const FAILED = `${PUBLIC_DEMO_FAILED_PREFIX}20261104T220944Z-manual-3701280-stale-candidate`;
const FORBIDDEN = "Forbidden-Value-31415-retention";

/** @type {string} */
let dataRoot;

/** @param {string} unitRoot @param {string} label @param {{ sidecars?: boolean }} [options] */
async function createUnit(unitRoot, label, { sidecars = false } = {}) {
  await fs.mkdir(path.join(unitRoot, "files", "seed"), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(unitRoot, "longtail-forge.db"), label, { mode: 0o600 });
  await fs.writeFile(path.join(unitRoot, "files", "seed", "label.txt"), label, { mode: 0o600 });
  await fs.writeFile(path.join(unitRoot, ".longtail-demo-data.json"), JSON.stringify({ label }), { mode: 0o600 });
  if (sidecars) {
    await fs.writeFile(path.join(unitRoot, "longtail-forge.db-wal"), `${label}-wal`, { mode: 0o600 });
    await fs.writeFile(path.join(unitRoot, "longtail-forge.db-shm"), `${label}-shm`, { mode: 0o600 });
  }
}

/**
 * A retired unit as a completed reset leaves it, with its operation record.
 * @param {string} operationId @param {{ completedAt?: string, phase?: string, record?: boolean, sidecars?: boolean }} [options]
 */
async function retireUnit(operationId, { completedAt = "2026-11-04T00:00:00.000Z", phase = "completed", record = true, sidecars = false } = {}) {
  const unitRoot = path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${operationId}`);
  await createUnit(unitRoot, `retired ${operationId}`, { sidecars });
  if (record) {
    await fs.writeFile(path.join(unitRoot, "reset-operation.json"), `${JSON.stringify({
      contract: PUBLIC_DEMO_ACTIVATION_CONTRACT,
      generatedAt: "2026-11-04T00:00:00.000Z",
      operationId,
      phase,
      state: "active",
      target: "rt-ltf-demo",
      ...(phase === "completed" ? { completedAt } : {}),
      ...(phase === "recovered" ? { recoveredAt: completedAt } : {}),
    }, null, 2)}\n`, { mode: 0o600 });
  }
  return unitRoot;
}

/**
 * A directory link. Windows creates a junction, which needs no privilege and which `lstat` also
 * reports as a symbolic link.
 * @param {string} target @param {string} linkPath
 */
function directoryLink(target, linkPath) {
  return fs.symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}

/** @param {"apply" | "plan"} mode @param {string} [maxRemovals] */
function prune(mode, maxRemovals) {
  return runPublicDemoActivationOperation({
    action: "prune",
    dataRoot,
    environment,
    maxRemovals,
    mode,
    requireCanonicalDataRoot: false,
    requireRoot: false,
    target: "rt-ltf-demo",
  });
}

/** Every path beneath the data root, so a test can prove that nothing changed. @param {string} [root] @returns {Promise<string[]>} */
async function tree(root = dataRoot) {
  /** @type {string[]} */
  const found = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    found.push(path.relative(dataRoot, entryPath));
    if (entry.isDirectory()) found.push(...await tree(entryPath));
  }
  return found.sort();
}

/** @param {string} operationId */
function retiredExists(operationId) {
  return fs.access(path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${operationId}`)).then(() => true, () => false);
}

beforeEach(async () => {
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-demo-retention-"));
  await createUnit(dataRoot, "active");
  for (const { operationId, completedAt } of COMPLETED) await retireUnit(operationId, { completedAt });
  await retireUnit(INCIDENT, { phase: "recovered" });
  await fs.mkdir(path.join(dataRoot, FAILED, "candidate"), { recursive: true });
  await fs.writeFile(path.join(dataRoot, FAILED, "stale-candidate.json"), "{}\n");
});

afterEach(async () => {
  await fs.rm(dataRoot, { recursive: true, force: true });
});

describe("pruning retired public-demo units", () => {
  it("keeps the units of the two newest completed resets", () => {
    expect(PUBLIC_DEMO_RETAINED_UNITS).toBe(2);
  });

  it("plans the selection by the identity's timestamp, and changes nothing", async () => {
    const before = await tree();
    const plan = await prune("plan");
    expect(plan).toMatchObject({ mode: "plan", removed: 0, selected: 2, skipped: 1, status: "prune-planned", tombstones: 0 });
    expect(plan.retainedOperations).toEqual(NEWEST_TWO);
    expect(plan.selectedOperations).toEqual(OLDER);
    expect(await tree()).toEqual(before);
  });

  it("removes exactly the older completed units, and leaves everything else", async () => {
    const result = await prune("apply");
    expect(result).toMatchObject({ mode: "apply", removed: 2, selected: 2, skipped: 1, status: "pruned" });
    expect(result.retainedOperations).toEqual(NEWEST_TWO);
    expect(result).not.toHaveProperty("selectedOperations");
    for (const operationId of NEWEST_TWO) expect(await retiredExists(operationId)).toBe(true);
    for (const operationId of OLDER) expect(await retiredExists(operationId)).toBe(false);
    expect(await retiredExists(INCIDENT)).toBe(true);
    const entries = (await fs.readdir(dataRoot)).sort();
    expect(entries).toContain(FAILED);
    expect(entries).toEqual(expect.arrayContaining(["longtail-forge.db", "files", ".longtail-demo-data.json"]));
    expect(entries.filter((entry) => entry.startsWith(PUBLIC_DEMO_PRUNING_PREFIX))).toEqual([]);
    expect(await fs.readFile(path.join(dataRoot, "longtail-forge.db"), "utf8")).toBe("active");
  });

  it("removes a retired unit's SQLite sidecars with it", async () => {
    await retireUnit("20261104T210000Z-scheduled-1", { sidecars: true });
    expect(await prune("apply")).toMatchObject({ removed: 3 });
    expect(await retiredExists("20261104T210000Z-scheduled-1")).toBe(false);
  });

  it("is idempotent", async () => {
    await prune("apply");
    const after = await tree();
    expect(await prune("apply")).toMatchObject({ removed: 0, selected: 0, status: "pruned" });
    expect(await tree()).toEqual(after);
  });

  it("never selects an incident or an unrecorded unit, however old", async () => {
    await retireUnit("20260808T010000Z-reset-1", { record: false });
    await retireUnit("20260808T020000Z-reset-2", { phase: "activated" });
    const plan = await prune("plan");
    expect(plan.skipped).toBe(3);
    expect(plan.selectedOperations).toEqual(OLDER);
  });

  it("never selects a unit whose record names another operation", async () => {
    const unitRoot = await retireUnit("20260808T030000Z-reset-3");
    const record = path.join(unitRoot, "reset-operation.json");
    await fs.writeFile(record, (await fs.readFile(record, "utf8")).replace("20260808T030000Z-reset-3", "20260808T030000Z-reset-4"));
    expect((await prune("plan")).selectedOperations).toEqual(OLDER);
  });

  it("never follows a link named as a retired unit", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-demo-retention-outside-"));
    try {
      // A complete retired unit with a valid completed record, so only the link refuses it.
      await createUnit(outside, "outside");
      await fs.writeFile(path.join(outside, "reset-operation.json"), JSON.stringify({
        contract: PUBLIC_DEMO_ACTIVATION_CONTRACT, completedAt: "2026-08-08T04:05:00.000Z", generatedAt: "2026-08-08T04:00:00.000Z",
        operationId: "20260808T040000Z-reset-5", phase: "completed", state: "active", target: "rt-ltf-demo",
      }));
      await directoryLink(outside, path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}20260808T040000Z-reset-5`));
      expect(await prune("apply")).toMatchObject({ removed: 2, skipped: 2 });
      expect(await fs.readFile(path.join(outside, "longtail-forge.db"), "utf8")).toBe("outside");
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("removes nothing when a selected unit contains a link", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-demo-retention-outside-"));
    try {
      await directoryLink(outside, path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${OLDER[1]}`, "files", "linked"));
      const before = await tree();
      await expect(prune("apply")).rejects.toThrow(/symbolic link/);
      expect(await tree()).toEqual(before);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("removes nothing when a selected unit has an unexpected entry", async () => {
    await fs.writeFile(path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${OLDER[1]}`, "notes.txt"), "operator note");
    const before = await tree();
    await expect(prune("apply")).rejects.toThrow(/unexpected shape; nothing was removed/);
    expect(await tree()).toEqual(before);
  });

  it("removes nothing when a selected unit is incomplete", async () => {
    await fs.rm(path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${OLDER[0]}`, "files"), { recursive: true });
    const before = await tree();
    await expect(prune("apply")).rejects.toThrow(/unexpected shape; nothing was removed/);
    expect(await tree()).toEqual(before);
  });

  it("refuses while a reset operation is active", async () => {
    await fs.writeFile(path.join(dataRoot, PUBLIC_DEMO_ACTIVE_OPERATION), "{}\n");
    const before = await tree();
    await expect(prune("plan")).rejects.toThrow(/operation is active/);
    await expect(prune("apply")).rejects.toThrow(/operation is active/);
    expect(await tree()).toEqual(before);
  });

  it("removes nothing when the selection exceeds the cap", async () => {
    const before = await tree();
    expect(await prune("apply", "1")).toMatchObject({ removed: 0, selected: 2, status: "prune-cap-exceeded" });
    expect(await tree()).toEqual(before);
    expect(await prune("apply", "2")).toMatchObject({ removed: 2, status: "pruned" });
  });

  it("finishes a tombstone an interrupted prune left, and plans it without touching it", async () => {
    const tombstone = path.join(dataRoot, `${PUBLIC_DEMO_PRUNING_PREFIX}20260901T000000Z-scheduled-7`);
    await createUnit(tombstone, "half-deleted");
    expect(await prune("plan")).toMatchObject({ tombstones: 1 });
    expect((await fs.readdir(dataRoot)).includes(path.basename(tombstone))).toBe(true);
    expect(await prune("apply")).toMatchObject({ removed: 2, tombstones: 1 });
    expect((await fs.readdir(dataRoot)).includes(path.basename(tombstone))).toBe(false);
  });

  it("removes nothing when a tombstone is unexpected", async () => {
    await fs.mkdir(path.join(dataRoot, `${PUBLIC_DEMO_PRUNING_PREFIX}not-an-operation`));
    const before = await tree();
    await expect(prune("apply")).rejects.toThrow(/tombstone has an unexpected name/);
    expect(await tree()).toEqual(before);
  });

  it("removes nothing when a tombstone contains a link", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-demo-retention-outside-"));
    try {
      const tombstone = path.join(dataRoot, `${PUBLIC_DEMO_PRUNING_PREFIX}20260901T000000Z-scheduled-8`);
      await fs.mkdir(tombstone);
      await directoryLink(outside, path.join(tombstone, "linked"));
      const before = await tree();
      await expect(prune("apply")).rejects.toThrow(/symbolic link/);
      expect(await tree()).toEqual(before);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});

describe("the prune command line", () => {
  const base = ["--target", "rt-ltf-demo", "--data-root", path.resolve("/var/lib/longtail-forge")];

  it("accepts a plan and a capped apply", () => {
    expect(parsePublicDemoActivationArgs(["prune", ...base, "--mode", "plan"])).toMatchObject({ action: "prune", mode: "plan" });
    expect(parsePublicDemoActivationArgs(["prune", ...base, "--mode", "apply", "--max-removals", "3"])).toMatchObject({ maxRemovals: "3", mode: "apply" });
  });

  it.each([
    [[], /requires --mode plan or --mode apply/],
    [["--mode", "delete"], /requires --mode plan or --mode apply/],
    [["--mode", "apply", "--max-removals", "0"], /from 1 through 999/],
    [["--mode", "apply", "--max-removals", "1000"], /from 1 through 999/],
    [["--mode", "apply", "--operation-id", "20261105T010000Z-scheduled-1"], /not accepted for prune/],
    [["--mode", "apply", "--confirm-quiescent", "COMPOSE SQLITE USERS STOPPED"], /accepted only for activate or recover/],
  ])("refuses %j", (extra, expected) => {
    expect(() => parsePublicDemoActivationArgs(["prune", ...base, ...extra])).toThrow(expected);
  });

  it("keeps the prune options to prune", () => {
    expect(() => parsePublicDemoActivationArgs(["inspect", ...base, "--mode", "plan"])).toThrow(/accepted only for prune/);
    expect(() => parsePublicDemoActivationArgs(["inspect", ...base, "--max-removals", "3"])).toThrow(/accepted only for prune/);
  });
});

describe("the live-data check's scan scope", () => {
  it("ignores a protected value or a link in a retained prior unit or failed evidence", async () => {
    await fs.writeFile(path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${OLDER[0]}`, "longtail-forge.db"), `visitor ${FORBIDDEN}`);
    await fs.writeFile(path.join(dataRoot, FAILED, "candidate", "longtail-forge.db"), FORBIDDEN);
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-demo-retention-outside-"));
    try {
      await directoryLink(outside, path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${OLDER[1]}`, "files", "linked"));
      await expect(assertPublicDemoUnitScansClean(dataRoot, [FORBIDDEN], { activeUnitOnly: true })).resolves.toBeUndefined();
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("still scans the whole root of a candidate", async () => {
    await fs.writeFile(path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${OLDER[0]}`, "longtail-forge.db"), FORBIDDEN);
    await expect(assertPublicDemoUnitScansClean(dataRoot, [FORBIDDEN], { activeUnitOnly: false })).rejects.toThrow(/protected credential material/);
  });

  it.each([
    ["the database", "longtail-forge.db"],
    ["a stored file", path.join("files", "seed", "label.txt")],
    ["the marker", ".longtail-demo-data.json"],
    ["the write-ahead log", "longtail-forge.db-wal"],
    ["the shared-memory file", "longtail-forge.db-shm"],
  ])("catches a protected value in the active unit's %s", async (_label, entry) => {
    await fs.writeFile(path.join(dataRoot, entry), `served ${FORBIDDEN}`);
    await expect(assertPublicDemoUnitScansClean(dataRoot, [FORBIDDEN], { activeUnitOnly: true })).rejects.toThrow(/protected credential material/);
  });

  it("catches a link in the active unit's Files root", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-demo-retention-outside-"));
    try {
      await directoryLink(outside, path.join(dataRoot, "files", "linked"));
      await expect(assertPublicDemoUnitScansClean(dataRoot, [FORBIDDEN], { activeUnitOnly: true })).rejects.toThrow(/symbolic link/);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});
