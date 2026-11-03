import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  PUBLIC_DEMO_ACTIVE_OPERATION,
  PUBLIC_DEMO_CANDIDATE_DIRECTORY,
  parsePublicDemoActivationArgs,
  runPublicDemoActivationOperation,
} from "../../scripts/lib/public-demo-baseline-activation.mjs";

const environment = Object.freeze({
  DEMO_MODE: "true",
  LONGTAIL_DEPLOYMENT_MODE: "compose",
  LONGTAIL_ENV: "production",
  LONGTAIL_PUBLIC_URL: "https://demo.longtailforge.com",
});
const OPERATION = "20261103T170000Z-scheduled-4242";
const BUILD = ".longtail-public-demo-build-3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const EVIDENCE = `.longtail-public-demo-failed-${OPERATION}-stale-candidate`;

/** @type {string} */
let dataRoot;

/** @param {string} unitRoot @param {string} label */
async function createUnit(unitRoot, label) {
  await fs.mkdir(path.join(unitRoot, "files"), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(unitRoot, "longtail-forge.db"), label, { mode: 0o600 });
  await fs.writeFile(path.join(unitRoot, "files", "label.txt"), label, { mode: 0o600 });
  await fs.writeFile(path.join(unitRoot, ".longtail-demo-data.json"), JSON.stringify({ label }), { mode: 0o600 });
}

/**
 * A directory link. Windows creates a junction, which needs no privilege and which `lstat` also
 * reports as a symbolic link.
 * @param {string} target @param {string} linkPath
 */
function directoryLink(target, linkPath) {
  return fs.symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
}

/** @param {string} [operationId] */
function quarantine(operationId = OPERATION) {
  return runPublicDemoActivationOperation({
    action: "quarantine-stale",
    dataRoot,
    environment,
    operationId,
    requireCanonicalDataRoot: false,
    requireRoot: false,
    target: "rt-ltf-demo",
  });
}

/** @param {string} [root] */
async function listing(root = dataRoot) {
  return (await fs.readdir(root)).sort();
}

beforeEach(async () => {
  dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-stale-candidate-"));
  await createUnit(dataRoot, "active");
});

afterEach(async () => {
  await fs.rm(dataRoot, { recursive: true, force: true });
});

describe("stale public-demo candidate quarantine", () => {
  it("moves a leftover verified candidate into failed evidence and keeps the active unit", async () => {
    await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "stale");
    const result = await quarantine();
    expect(result).toEqual({ moved: 1, operationId: OPERATION, status: "stale-candidate-quarantined", target: "rt-ltf-demo" });
    expect(await listing()).toEqual([".longtail-demo-data.json", EVIDENCE, "files", "longtail-forge.db"]);
    expect(await fs.readFile(path.join(dataRoot, "longtail-forge.db"), "utf8")).toBe("active");
    expect(await fs.readFile(path.join(dataRoot, EVIDENCE, "candidate", "longtail-forge.db"), "utf8")).toBe("stale");
    const record = JSON.parse(await fs.readFile(path.join(dataRoot, EVIDENCE, "stale-candidate.json"), "utf8"));
    expect(record).toMatchObject({ contract: "longtail-forge-public-demo-stale-candidate-v1", moved: ["candidate"], operationId: OPERATION });
  });

  it("moves a partial candidate and a partial build together", async () => {
    await fs.mkdir(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY));
    await fs.writeFile(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY, "longtail-forge.db"), "partial");
    await createUnit(path.join(dataRoot, BUILD, "sanitized-demo"), "building");
    const result = await quarantine();
    expect(result.moved).toBe(2);
    expect(await listing(path.join(dataRoot, EVIDENCE))).toEqual([BUILD, "candidate", "stale-candidate.json"]);
    expect(await listing()).not.toContain(BUILD);
  });

  it("does nothing when no stale state exists", async () => {
    const before = await listing();
    expect(await quarantine()).toEqual({ moved: 0, operationId: OPERATION, status: "no-stale-candidate", target: "rt-ltf-demo" });
    expect(await listing()).toEqual(before);
  });

  it("refuses while a reset operation is active, because its recovery owns those paths", async () => {
    await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "candidate");
    await fs.writeFile(path.join(dataRoot, PUBLIC_DEMO_ACTIVE_OPERATION), "{}");
    await expect(quarantine()).rejects.toThrow(/recover it before moving a stale candidate/);
    expect(await listing()).toContain(PUBLIC_DEMO_CANDIDATE_DIRECTORY);
    expect(await listing()).not.toContain(EVIDENCE);
  });

  it.each([
    ["an unexpected entry in the candidate", async () => {
      await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "candidate");
      await fs.writeFile(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY, "notes.txt"), "x");
    }, /unexpected state/],
    ["a link inside the candidate", async () => {
      await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "candidate");
      await directoryLink(path.join(dataRoot, "files"), path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY, "files", "link"));
    }, /symbolic link/],
    ["a candidate that is itself a link", async () => {
      await createUnit(path.join(dataRoot, "elsewhere"), "elsewhere");
      await directoryLink(path.join(dataRoot, "elsewhere"), path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY));
    }, /real directory/],
    ["a link inside a build", async () => {
      await createUnit(path.join(dataRoot, BUILD, "sanitized-demo"), "building");
      await directoryLink(path.join(dataRoot, "files"), path.join(dataRoot, BUILD, "sanitized-demo", "files", "link"));
    }, /symbolic link/],
    ["a build with an unexpected name", async () => {
      await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "candidate");
      await fs.mkdir(path.join(dataRoot, ".longtail-public-demo-build-not-a-uuid"));
    }, /unexpected name/],
    ["a build that is a file", async () => {
      await fs.writeFile(path.join(dataRoot, BUILD), "x");
    }, /real directory/],
  ])("refuses %s, and moves nothing", async (_label, arrange, message) => {
    await arrange();
    const before = await listing();
    await expect(quarantine()).rejects.toThrow(message);
    expect(await listing()).toEqual(before);
  });

  it("refuses to overwrite earlier evidence for the same operation", async () => {
    await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "candidate");
    await fs.mkdir(path.join(dataRoot, EVIDENCE));
    await expect(quarantine()).rejects.toThrow(/refusing replacement/);
    expect(await listing()).toContain(PUBLIC_DEMO_CANDIDATE_DIRECTORY);
  });

  it("requires a valid operation identity", async () => {
    expect(() => parsePublicDemoActivationArgs(["quarantine-stale", "--target", "rt-ltf-demo", "--data-root", "/var/lib/longtail-forge"]))
      .toThrow(/requires --operation-id/);
    expect(() => parsePublicDemoActivationArgs(["quarantine-stale", "--target", "rt-ltf-demo", "--data-root", "/var/lib/longtail-forge", "--operation-id", "../escape"]))
      .toThrow(/--operation-id is invalid/);
    expect(() => parsePublicDemoActivationArgs(["quarantine-stale", "--target", "rt-ltf-demo", "--data-root", "/var/lib/longtail-forge", "--operation-id", OPERATION, "--confirm-quiescent", "COMPOSE SQLITE USERS STOPPED"]))
      .toThrow(/accepted only for activate or recover/);
    await expect(quarantine("not an id")).rejects.toThrow(/valid --operation-id/);
  });
});
