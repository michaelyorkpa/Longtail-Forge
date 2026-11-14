import { describe, expect, it } from "vitest";
import {
  DURABILITY_PATCH_CHECKPOINT,
  DURABILITY_PATCH_DECLARATIONS,
  DURABILITY_PATCH_DEPENDENCY_UPDATES,
  NODE_SECURITY_PATCH_CHECKPOINT,
  RESET_RETENTION_PATCH_CHECKPOINT,
  RESTART_RECOVERY_PATCH_CHECKPOINT,
  validateCheckpointCommit,
} from "../../scripts/release/checkpoint-commits.mjs";

/** @typedef {{ version: string, engines: Record<string, string>, dependencies: Record<string, string>, devDependencies: Record<string, string> }} FixtureManifest */

/**
 * The application as the reset-retention release left it, before and after the reviewed fold, in both
 * package files. Every reviewed lock entry is present on the side where it exists.
 */
function fixture() {
  /** @type {FixtureManifest} */
  const before = { version: RESET_RETENTION_PATCH_CHECKPOINT, engines: { node: ">=24.22.1 <25" }, dependencies: { unrelated: "1.0.0" }, devDependencies: {} };
  /** @type {FixtureManifest} */
  const after = structuredClone(before);
  for (const [group, name, previous, reviewed] of DURABILITY_PATCH_DECLARATIONS) {
    before[group][name] = previous;
    after[group][name] = reviewed;
  }
  /** @type {Record<string, unknown>} */
  const beforePackages = { "": structuredClone(before), "node_modules/unrelated": { version: "1.0.0", integrity: "fixed" } };
  /** @type {Record<string, unknown>} */
  const afterPackages = { "": structuredClone(after), "node_modules/unrelated": { version: "1.0.0", integrity: "fixed" } };
  for (const [packagePath, update] of Object.entries(DURABILITY_PATCH_DEPENDENCY_UPDATES)) {
    if (update.before !== null) beforePackages[packagePath] = structuredClone(update.before);
    if (update.after !== null) afterPackages[packagePath] = structuredClone(update.after);
  }
  return {
    before,
    after,
    lockBefore: { version: before.version, lockfileVersion: 3, packages: beforePackages },
    lockAfter: { version: after.version, lockfileVersion: 3, packages: afterPackages },
  };
}

/**
 * @param {(values: ReturnType<typeof fixture>) => void} [change]
 * @param {string} [checkpoint]
 * @param {string[]} [paths]
 */
function foldErrors(change = () => {}, checkpoint = DURABILITY_PATCH_CHECKPOINT, paths = ["package.json", "package-lock.json"]) {
  const values = fixture();
  change(values);
  return validateCheckpointCommit({
    message: `Take the reviewed fold\n\nLTF-Checkpoint: ${checkpoint}\nLTF-Summary: Take the reviewed Dependabot fold\nLTF-Docs: No docs change needed: synthetic boundary test.`,
    paths,
    packageBeforeSource: JSON.stringify(values.before),
    packageAfterSource: JSON.stringify(values.after),
    lockBeforeSource: JSON.stringify(values.lockBefore),
    lockAfterSource: JSON.stringify(values.lockAfter),
    roadmapSource: `### ${checkpoint} - Synthetic patch`,
  }).errors;
}

/** @param {string} packagePath */
function reviewed(packagePath) {
  const update = DURABILITY_PATCH_DEPENDENCY_UPDATES[packagePath];
  if (!update) throw new Error(`${packagePath} is not in the reviewed fold`);
  return update;
}

const FOLD_LOCK_ERROR = `package-lock.json under ${DURABILITY_PATCH_CHECKPOINT} may change only its application version fields, to exactly ${DURABILITY_PATCH_CHECKPOINT}, or take its reviewed dependency fold`;
const FOLD_PACKAGE_ERROR = `package.json under ${DURABILITY_PATCH_CHECKPOINT} may change only the application version, to exactly ${DURABILITY_PATCH_CHECKPOINT}, or scripts`;

describe("the durability dependency fold", () => {
  it("is the patch after reset retention", () => {
    // Named relative to its predecessor: the version guard refuses the current version as a literal.
    const at = RESET_RETENTION_PATCH_CHECKPOINT.lastIndexOf(".");
    const next = `${RESET_RETENTION_PATCH_CHECKPOINT.slice(0, at)}.${Number(RESET_RETENTION_PATCH_CHECKPOINT.slice(at + 1)) + 1}`;
    expect(DURABILITY_PATCH_CHECKPOINT).toBe(next);
  });

  it("admits the complete reviewed transition at the unchanged application version", () => {
    expect(foldErrors()).toEqual([]);
  });

  it("holds exactly the declarations the roadmap reviewed", () => {
    // The fixture is built from these, so only a literal pin catches a wrong range.
    expect(DURABILITY_PATCH_DECLARATIONS).toEqual([
      ["dependencies", "express", "^5.2.1", "^5.3.0"],
      ["dependencies", "express-rate-limit", "^8.7.0", "^8.7.4"],
      ["devDependencies", "@types/node", "^26.6.5", "^26.6.6"],
      ["devDependencies", "eslint", "^10.13.0", "^10.14.0"],
      ["devDependencies", "vitest", "^4.1.12", "^5.1.0"],
    ]);
  });

  it("holds the transitions the roadmap reviewed, with Vite and Rolldown kept", () => {
    expect(Object.keys(DURABILITY_PATCH_DEPENDENCY_UPDATES)).toHaveLength(72);
    expect(reviewed("node_modules/express").after?.version).toBe("5.3.0");
    expect(reviewed("node_modules/express-rate-limit").after?.version).toBe("8.7.4");
    expect(reviewed("node_modules/eslint").after?.version).toBe("10.14.0");
    expect(reviewed("node_modules/@types/node").after?.version).toBe("26.6.6");
    expect(reviewed("node_modules/vitest").after?.version).toBe("5.1.0");
    expect(reviewed("node_modules/body-parser/node_modules/content-type").after).toBeNull();
    expect(reviewed("node_modules/@vitest/expect").after).toBeNull();
    for (const packagePath of ["node_modules/vite", "node_modules/rolldown"]) {
      const { before, after } = reviewed(packagePath);
      expect(after?.version).toBe(before?.version);
      expect(after?.peer).toBe(true);
    }
  });

  it.each(Object.keys(DURABILITY_PATCH_DEPENDENCY_UPDATES))("refuses leaving %s behind", (packagePath) => {
    expect(foldErrors(({ lockAfter }) => {
      const previous = reviewed(packagePath).before;
      if (previous === null) delete lockAfter.packages[packagePath];
      else lockAfter.packages[packagePath] = structuredClone(previous);
    })).toContain(FOLD_LOCK_ERROR);
  });

  it.each(["integrity", "resolved", "license", "dev"])("refuses a changed %s beside a reviewed version", (field) => {
    expect(foldErrors(({ lockAfter }) => {
      const entry = /** @type {Record<string, unknown>} */ (lockAfter.packages["node_modules/express"]);
      entry[field] = "unexpected";
    })).toContain(FOLD_LOCK_ERROR);
  });

  it("refuses a different target than the reviewed one, as Dependabot's fuller Vitest proposal would be", () => {
    expect(foldErrors(({ lockAfter }) => {
      lockAfter.packages["node_modules/vite"] = { ...structuredClone(reviewed("node_modules/vite").after), version: "8.3.5" };
    })).toContain(FOLD_LOCK_ERROR);
  });

  it("refuses an unreviewed resolved package and an unreviewed declaration", () => {
    expect(foldErrors(({ lockAfter }) => {
      lockAfter.packages["node_modules/unrelated"] = { version: "2.0.0", integrity: "fixed" };
    })).toContain(FOLD_LOCK_ERROR);
    expect(foldErrors(({ after }) => { after.dependencies.unrelated = "2.0.0"; })).toContain(FOLD_PACKAGE_ERROR);
    expect(foldErrors(({ after }) => { after.engines.node = ">=24"; })).toContain(FOLD_PACKAGE_ERROR);
  });

  it.each(DURABILITY_PATCH_DECLARATIONS.map(([group, name]) => [group, name]))("refuses leaving %s %s undeclared", (group, name) => {
    const declaration = DURABILITY_PATCH_DECLARATIONS.find(([, candidate]) => candidate === name);
    expect(foldErrors(({ after }) => { after[/** @type {"dependencies" | "devDependencies"} */ (group)][name] = declaration?.[2] ?? ""; })).toContain(FOLD_PACKAGE_ERROR);
  });

  it("refuses the fold when the root lock entry disagrees with the manifest", () => {
    expect(foldErrors(({ lockAfter }) => {
      const root = /** @type {FixtureManifest} */ (lockAfter.packages[""]);
      root.dependencies.express = "^5.2.1";
    })).toContain(FOLD_LOCK_ERROR);
  });

  it("refuses taking the fold from any other starting version, or while moving the version", () => {
    expect(foldErrors(({ before, lockBefore }) => {
      before.version = RESTART_RECOVERY_PATCH_CHECKPOINT;
      lockBefore.version = before.version;
    })).toContain(FOLD_LOCK_ERROR);
    expect(foldErrors(({ after, lockAfter }) => {
      after.version = DURABILITY_PATCH_CHECKPOINT;
      lockAfter.version = after.version;
    })).toContain(FOLD_PACKAGE_ERROR);
  });

  it.each([RESTART_RECOVERY_PATCH_CHECKPOINT, DURABILITY_PATCH_CHECKPOINT])("refuses the complete fold when both sides are application version %s", (version) => {
    /** @param {ReturnType<typeof fixture>} values */
    const setVersion = ({ before, after, lockBefore, lockAfter }) => {
      for (const manifest of [before, after, lockBefore, lockAfter, lockBefore.packages[""], lockAfter.packages[""]]) {
        /** @type {FixtureManifest} */ (manifest).version = version;
      }
    };
    expect(foldErrors(setVersion, undefined, ["package.json"])).toContain(FOLD_PACKAGE_ERROR);
    expect(foldErrors(setVersion, undefined, ["package-lock.json"])).toContain(FOLD_LOCK_ERROR);
  });

  it("refuses a lock whose top-level version is another identity on both sides", () => {
    expect(foldErrors(({ lockBefore, lockAfter }) => {
      lockBefore.version = RESTART_RECOVERY_PATCH_CHECKPOINT;
      lockAfter.version = RESTART_RECOVERY_PATCH_CHECKPOINT;
    }, undefined, ["package-lock.json"])).toContain(FOLD_LOCK_ERROR);
  });

  it.each([RESET_RETENTION_PATCH_CHECKPOINT, RESTART_RECOVERY_PATCH_CHECKPOINT])("keeps the fold to its own checkpoint, not %s", (checkpoint) => {
    expect(foldErrors(undefined, checkpoint, ["package.json"]).length).toBeGreaterThan(0);
    expect(foldErrors(undefined, checkpoint, ["package-lock.json"]).length).toBeGreaterThan(0);
  });
});

describe("the durability release identity", () => {
  /** @param {string} version */
  function bumpErrors(version) {
    const { after, lockAfter } = fixture();
    const nextPackage = { ...after, version };
    const nextRoot = /** @type {FixtureManifest} */ (lockAfter.packages[""]);
    const nextLock = { ...lockAfter, version, packages: { ...lockAfter.packages, "": { ...nextRoot, version } } };
    return validateCheckpointCommit({
      message: `Set the release identity\n\nLTF-Checkpoint: ${DURABILITY_PATCH_CHECKPOINT}\nLTF-Summary: Set the patch's own release identity\nLTF-Docs: No docs change needed: synthetic boundary test.`,
      paths: ["package.json", "package-lock.json"],
      packageBeforeSource: JSON.stringify(after),
      packageAfterSource: JSON.stringify(nextPackage),
      lockBeforeSource: JSON.stringify(lockAfter),
      lockAfterSource: JSON.stringify(nextLock),
      roadmapSource: `### ${DURABILITY_PATCH_CHECKPOINT} - Synthetic patch`,
    }).errors;
  }

  it("admits moving the version to exactly its own identity after the fold", () => {
    expect(bumpErrors(DURABILITY_PATCH_CHECKPOINT)).toEqual([]);
  });

  it("refuses any other identity", () => {
    expect(bumpErrors(`${DURABILITY_PATCH_CHECKPOINT}.1`)).toContain(FOLD_PACKAGE_ERROR);
  });
});

describe("the durability decisions", () => {
  /** @param {string} checkpoint @param {string[]} paths */
  function pathErrors(checkpoint, paths) {
    const { after, lockAfter } = fixture();
    return validateCheckpointCommit({
      message: `Record the decisions\n\nLTF-Checkpoint: ${checkpoint}\nLTF-Summary: Record a patch's decisions\nLTF-Docs: No docs change needed: synthetic boundary test.`,
      paths,
      packageBeforeSource: JSON.stringify(after),
      packageAfterSource: JSON.stringify(after),
      lockBeforeSource: JSON.stringify(lockAfter),
      lockAfterSource: JSON.stringify(lockAfter),
      roadmapSource: `### ${checkpoint} - Synthetic patch`,
    }).errors;
  }

  it("admits DECISIONS.md, which records the durability decisions", () => {
    expect(pathErrors(DURABILITY_PATCH_CHECKPOINT, ["DECISIONS.md"])).toEqual([]);
  });

  it("keeps DECISIONS.md reserved for a patch that was not given it", () => {
    expect(pathErrors(NODE_SECURITY_PATCH_CHECKPOINT, ["DECISIONS.md"]).join("\n")).toContain("DECISIONS.md is reserved");
  });

  it("keeps the two-ceremony-file ceiling, DECISIONS.md included", () => {
    expect(pathErrors(DURABILITY_PATCH_CHECKPOINT, ["DECISIONS.md", "ROADMAP.md", "ROADMAP-ARCHIVE.md"]).join("\n"))
      .toContain("changes 3 ceremony files");
  });
});
