// Scratch-only mutation campaign for the helper's recovery before any data change (never merged).
// Each mutation weakens one part of that recovery; the executable harness must fail the named
// scenarios. The helper is restored from its saved bytes after every mutation.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const helper = "scripts/release/longtail-forge-compose-deploy-host.example";
const original = readFileSync(helper);
const originalHash = createHash("sha256").update(original).digest("hex");
const source = original.toString("utf8");
const deployFaults = [
  "a failed pre-upgrade backup (create)",
  "a failed pre-upgrade backup (key-backup)",
  "a failed pre-upgrade backup (inspect)",
  "a failed pre-upgrade backup (missing-archive)",
  "an interrupted pre-upgrade backup",
  "a prior-state copy that fails after the backup",
  "DEMO_MODE=true: a failed pre-upgrade backup",
];
const mutations = [
  {
    label: "the deploy window opens without its exit trap",
    from: "  PRELIMINARY_PHASE=true\n  trap 'recover_before_data_change \"$?\"' EXIT\n",
    to: "  PRELIMINARY_PHASE=true\n",
    expectFail: [...deployFaults, "whose restart cannot be verified"],
  },
  {
    label: "the rollback window opens without its exit trap",
    from: "\nPRELIMINARY_PHASE=true\ntrap 'recover_before_data_change \"$?\"' EXIT\n",
    to: "\nPRELIMINARY_PHASE=true\n",
    expectFail: ["a failed pre-rollback backup", "a rollback record unreadable"],
  },
  {
    label: "signals are not converted to a failing exit",
    from: "trap 'exit 130' HUP INT TERM\n",
    to: "",
    all: true,
    expectFail: ["an interrupted pre-upgrade backup"],
  },
  {
    label: "the curtain lifts before the restart verifies",
    from: "      && verify_runtime \"$RELEASE_ROOT/${restart_digest#sha256:}.json\" \"$restart_env\" \\\n      && clear_marker ); then",
    to: "      && clear_marker \\\n      && verify_runtime \"$RELEASE_ROOT/${restart_digest#sha256:}.json\" \"$restart_env\" ); then",
    expectFail: ["whose restart cannot be verified"],
  },
  {
    label: "the current release is not restarted",
    from: "      && compose \"$restart_env\" up -d --no-deps --force-recreate longtail-forge \\\n",
    to: "",
    expectFail: deployFaults,
  },
  {
    label: "the restart selects the candidate",
    from: "compose \"$restart_env\" up -d",
    to: "compose \"$RELEASE_ENV\" up -d",
    expectFail: deployFaults,
  },
  {
    label: "the rollback window closes before the state reads",
    from: "backup_with_state \"$CURRENT_STATE\" \"$CURRENT_BACKUP\"\ncurrent_digest=",
    to: "backup_with_state \"$CURRENT_STATE\" \"$CURRENT_BACKUP\"\ntrap - EXIT HUP INT TERM\nPRELIMINARY_PHASE=false\ncurrent_digest=",
    expectFail: ["a rollback record unreadable"],
  },
  {
    label: "the deploy window closes before the prior-state copy",
    from: "  install -o root -g root -m 0600 \"$CURRENT_STATE\" \"$OPERATION_DIR/prior-state.json\"\n  trap - EXIT HUP INT TERM\n",
    to: "  trap - EXIT HUP INT TERM\n  install -o root -g root -m 0600 \"$CURRENT_STATE\" \"$OPERATION_DIR/prior-state.json\"\n",
    expectFail: ["a prior-state copy that fails after the backup"],
  },
];

if (process.argv[2] === "--check-anchors") {
  for (const mutation of mutations) {
    const count = source.split(mutation.from).length - 1;
    console.log(`${(mutation.all ? count >= 1 : count === 1) ? "ok  " : "BAD "} ${count} ${mutation.label}`);
  }
  process.exit(0);
}

let caught = 0;
for (const mutation of mutations) {
  const count = source.split(mutation.from).length - 1;
  if (mutation.all ? count < 1 : count !== 1) throw new Error(`${mutation.label}: anchor matched ${count} times`);
  writeFileSync(helper, mutation.all ? source.split(mutation.from).join(mutation.to) : source.replace(mutation.from, () => mutation.to));
  const result = spawnSync(process.execPath, ["scripts/release/compose-helper-contract-harness.mjs"], { encoding: "utf8" });
  writeFileSync(helper, original);
  if (createHash("sha256").update(readFileSync(helper)).digest("hex") !== originalHash) throw new Error("helper was not restored");
  const failedLines = String(result.stdout).split("\n").filter((line) => line.startsWith("FAIL "));
  const missing = mutation.expectFail.filter((name) => !failedLines.some((line) => line.includes(name)));
  const ok = result.status !== 0 && missing.length === 0;
  if (ok) caught += 1;
  console.log(`${ok ? "CAUGHT  " : "SURVIVED"} ${mutation.label}: exit ${result.status}; failing scenarios ${failedLines.length}${missing.length ? `; expected but passing: ${missing.join(" | ")}` : ""}`);
  for (const line of failedLines) console.log(`    ${line}`);
}
console.log(`${caught}/${mutations.length} recovery mutations caught by the executable harness; helper restored byte for byte.`);
if (caught !== mutations.length) process.exitCode = 1;
