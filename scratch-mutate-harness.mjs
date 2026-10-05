// Scratch-only mutation campaign for the executable helper harness (never merged). Each mutation
// reverts one 0.33.33.50 guarantee in the repaired helper; the harness must fail the named scenarios.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const helper = "scripts/release/longtail-forge-compose-deploy-host.example";
const original = readFileSync(helper, "utf8");
const mutations = [
  {
    label: "native execution check removed",
    from: 'verify_native_dependency "$IMAGE_REFERENCE"\ncompose "$RELEASE_ENV" config --quiet',
    to: 'compose "$RELEASE_ENV" config --quiet',
    expectFail: ["reviewed native claim that the pulled digest does not execute", "digest whose native driver cannot load"],
  },
  {
    label: "profiles reverted to the original 13.0.1 pin",
    from: "readonly NATIVE_DEPENDENCY_PROFILES='13.0.1:3.53.3 13.0.3:3.53.4'",
    to: "readonly NATIVE_DEPENDENCY_PROFILES='13.0.1:3.53.3'",
    expectFail: ["repaired helper deploys the 13.0.3 release", "explicit rollback restores the previous 13.0.1 release"],
  },
  {
    label: "profiles narrowed to the new pin only (rollback broken)",
    from: "readonly NATIVE_DEPENDENCY_PROFILES='13.0.1:3.53.3 13.0.3:3.53.4'",
    to: "readonly NATIVE_DEPENDENCY_PROFILES='13.0.3:3.53.4'",
    expectFail: ["explicit rollback restores the previous 13.0.1 release"],
  },
  {
    label: "rollback target mismatch precondition removed",
    from: `  test "$(jq -er '.commitSha' "$PREVIOUS_STATE")" = "$EXPECTED_COMMIT" || fail "rollback target does not match the recorded previous release"\n`,
    to: "",
    expectFail: ["rollback target other than the recorded previous release"],
  },
  {
    label: "classification accepts TRUE",
    from: "  true|false) readonly PUBLIC_DEMO",
    to: "  true|TRUE|false) readonly PUBLIC_DEMO",
    expectFail: ['DEMO_MODE "TRUE"'],
  },
  {
    label: "verified recovery leaves the curtain",
    from: "      RECOVERY_SUCCEEDED=true\n      clear_marker\n",
    to: "      RECOVERY_SUCCEEDED=true\n",
    expectFail: ["a failed candidate is recovered automatically"],
  },
  {
    label: "deployment marker never asserted",
    from: 'verify_candidate_scanner "$RELEASE_ENV"\nassert_marker\n',
    to: 'verify_candidate_scanner "$RELEASE_ENV"\n',
    expectFail: ["repaired helper deploys the 13.0.3 release"],
  },
];
let caught = 0;
for (const mutation of mutations) {
  const count = original.split(mutation.from).length - 1;
  if (count !== 1) throw new Error(`${mutation.label}: anchor matched ${count} times`);
  writeFileSync(helper, original.split(mutation.from).join(mutation.to));
  const result = spawnSync(process.execPath, ["scripts/release/compose-helper-contract-harness.mjs"], { encoding: "utf8" });
  writeFileSync(helper, original);
  const failedLines = String(result.stdout).split("\n").filter((line) => line.startsWith("FAIL "));
  const missing = mutation.expectFail.filter((name) => !failedLines.some((line) => line.includes(name)));
  const ok = result.status !== 0 && missing.length === 0;
  if (ok) caught += 1;
  console.log(`${ok ? "CAUGHT  " : "SURVIVED"} ${mutation.label}: exit ${result.status}; failing scenarios: ${failedLines.length}${missing.length ? `; expected but passing: ${missing.join(" | ")}` : ""}`);
  for (const line of failedLines) console.log(`    ${line}`);
}
if (readFileSync(helper, "utf8") !== original) throw new Error("helper not restored");
console.log(`${caught}/${mutations.length} mutations caught by the executable harness.`);
if (caught !== mutations.length) process.exitCode = 1;
