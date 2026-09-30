import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSourceBackup, runBoundedNode, runMutationCampaign } from "../../scripts/test-support/mutation-runner.mjs";
const result = runMutationCampaign({
  sourcePath: "public/js/lists.js",
  suites: ["tests/unit/lists-zero.test.mjs", "tests/unit/lists-editor-params-contracts.test.mjs"],
  cases: [
    { name: "BigInt result refusal removed", find: 'if (typeof difference === "bigint") {', replace: 'if (false) {' },
    { name: "BigInt result coerced", find: 'if (typeof difference === "bigint") {', replace: 'difference = Number(difference); if (typeof difference === "bigint") {' },
    { name: "Number-only comparator admits BigInt", find: "const leftNumeric = listSortNumeric(left);", replace: "return Number(left) - Number(right);\n    const leftNumeric = listSortNumeric(left);" },
    { name: "Conversion receives the wrong hint", find: 'Reflect.apply(Function.prototype.call, exotic, [value, "number"])', replace: 'Reflect.apply(Function.prototype.call, exotic, [value, "string"])' },
    { name: "Boxed dataset loses the primitive receiver", find: 'Reflect.set(Object(dataset), key, "", dataset)', replace: 'Reflect.set(Object(dataset), key, "")' },
    { name: "Required title hook disappears", find: 'setListsSurfaceHook(pageHeading, "listsTitle");', replace: 'void pageHeading;' },
    { name: "Deleted rows leak into progress", find: 'const visible = items.filter((item) => !item.deleted_at);', replace: 'const visible = items.filter(() => true);' },
  ],
});
if (result.caught.length !== 7) process.exitCode = 1;

// Optional rendered fault injection uses the lane's existing isolated Playwright configuration.
if (process.argv.includes("--browser")) {
  const config = process.env.LTF_MUTATION_E2E_CONFIG;
  if (!config) throw new Error("Set LTF_MUTATION_E2E_CONFIG to the isolated lane configuration.");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lists-zero-browser-breaks-"));
  const backup = createSourceBackup("public/js/lists.js");
  const cases = [
    { name: "callability", find: 'if (typeof method !== "function" && !(isListSortObject(method) && typeof new Proxy(method, {}) === "function")) continue;', replace: 'if (typeof method !== "function") continue;' },
    { name: "strict-nullish", find: 'if (exotic !== null && exotic !== undefined) {', replace: 'if (exotic != null) {' },
  ];
  /** @param {string} name */
  const run = (name) => {
    const result = runBoundedNode(["scripts/run-playwright-e2e.mjs", "--config", config, "--output", path.join(root, name), "lists-zero", "--project=desktop", "--workers=1"], { timeoutMs: 60000 });
    fs.writeFileSync(path.join(root, name + ".log"), result.stdout + result.stderr);
    return result;
  };
  try {
    const baseline = run("baseline");
    if (baseline.status !== 0) throw new Error("Rendered baseline failed; inspect " + root);
    for (const fault of cases) {
      try {
        if (backup.text().split(fault.find).length !== 2) throw new Error("Mutation anchor is not unique: " + fault.name);
        fs.writeFileSync("public/js/lists.js", backup.text().replace(fault.find, fault.replace));
        const result = run(fault.name);
        if (result.status === 0 || !result.stdout.includes("toEqual(expected)")) throw new Error("No comparison assertion caught " + fault.name + "; inspect " + root);
        console.log("CAUGHT rendered " + fault.name);
      } finally {
        backup.restore();
      }
    }
  } finally {
    backup.restore();
    backup.verifyBackup();
    console.log("Rendered restore SHA-256 " + backup.sha + "; artifacts " + root);
  }
}
