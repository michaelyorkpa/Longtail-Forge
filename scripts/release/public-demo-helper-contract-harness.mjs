#!/usr/bin/env node
// Executable contract for the public-demo boot, alert, scheduler, and reset-hold paths (the
// restart-recovery post-release patch).
//
// The boot helper decides whether a demo may start after a host restart, and the alert helper is
// the only path by which a failure leaves the host. Source-text pins cannot show that a refusal
// happens before anything starts, or that a webhook URL never reaches argv or output. This harness
// runs the actual helper bytes as root, with the real bash, jq, coreutils, flock, and find. Docker,
// HTTP, `ip`, the scanner probe, the clock, the journal, the isolation helper, and the reset the boot
// calls are fakes, and every fake call records whether the curtain was up at that moment. A deadline
// a helper puts around Docker runs the real timeout, so it really ends a Docker fake that stalls.
//
// It needs native Linux and passwordless sudo. It writes the helpers' fixed paths under
// /etc/longtail-forge, /usr/local/sbin, and /var/backups/longtail-forge, and refuses a host where any
// of them already exists. Run it only on a disposable machine, such as the maintenance rehearsal's
// clean runner.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");
const BOOT_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-boot-host.example");
const ALERT_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-reset-alert.example");
const SCHEDULER_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-reset-scheduler-host.example");
const RESET_HELPER = path.join(repoRoot, "scripts/release/longtail-forge-public-demo-reset-host.example");
const ETC = "/etc/longtail-forge";
const FIXED = Object.freeze({
  hold: `${ETC}/public-demo-hold`,
  webhook: `${ETC}/public-demo-alert-webhook`,
  heartbeat: `${ETC}/public-demo-heartbeat-url`,
  schedulerEnv: `${ETC}/public-demo-reset-scheduler.env`,
  installedReset: "/usr/local/sbin/longtail-forge-public-demo-reset",
  installedAlert: "/usr/local/sbin/longtail-forge-public-demo-reset-alert",
});
const BACKUP_PARENT = "/var/backups/longtail-forge";
const BACKUP_ROOT = `${BACKUP_PARENT}/compose`;
const OWNERSHIP_MARKER = `${BACKUP_PARENT}/.ltf-demo-helper-harness`;
const DEMO_ORIGIN = "https://demo.longtailforge.com";
const GATEWAY = "172.30.31.1";
// Synthetic values in the exact shapes the alert helper accepts. No real endpoint is ever contacted.
// The webhook's identifying parts. Leak checks look for these rather than for the host name, which
// would read as an incomplete URL check.
const WEBHOOK_ID = "123456789012345678";
const WEBHOOK_TOKEN = `${"Ab9_-".repeat(13)}xyz`;
const WEBHOOK_URL = `https://discord.com/api/webhooks/${WEBHOOK_ID}/${WEBHOOK_TOKEN}`;
const HEARTBEAT_URL = "https://uptime.harness.test/api/push/HarnessToken123?status=up&msg=OK&ping=";
const IMAGE = `ghcr.io/michaelyorkpa/longtail-forge@sha256:${"a".repeat(64)}`;
const IDENTITY = Object.freeze({ version: "1.2.3.4", commitSha: "c".repeat(40), artifact: "d".repeat(64) });
const DEMO_NETWORK = "longtail-forge-public-demo-internal";
const DEMO_VOLUME = "longtail-forge-public-demo-data";
// Secrets no evidence, output, or log may ever contain: one in the application environment, which
// only Compose reads, one among the demo role passwords, and one double-quoted in the host environment.
const CANARY = "Canary-Secret-987-harness";
const ROLE_CANARY = "Role-Canary-654-harness";
const HOST_CANARY = "Host-Canary-321-harness";
const RESET_CONFIRMATION = "RESET RT-LTF-DEMO COMPOSE DATA";
const RETENTION_CONFIRMATION = "PRUNE RT-LTF-DEMO RESET HISTORY";
// What a visitor typed into the shared account's profile. The pre-reset login answers with it, and
// no reset evidence may keep it.
const VISITOR_CANARY = "Visitor-Display-Name-2718-harness";
// The container user, which owns the backup root and every backup it writes, as on the real host.
const CONTAINER_UID = 10001;
// The helpers' bound on any one request, and the point at which a stalled request that ignored it is
// cut off by the harness instead, so that an unbounded request fails a scenario rather than hanging.
const REQUEST_LIMIT_SECONDS = 15;
const STALL_SAFETY_MS = 25_000;
// The longest deadline a helper may put on a Docker command that stops a service or proves it
// stopped, and the point at which a stalled Docker command that ignored its deadline gives up.
const DOCKER_LIMIT_SECONDS = 45;
const DOCKER_STALL_SAFETY_MS = 30_000;
/** The two blocks the boot and the reset must carry byte for byte. */
const SHARED_BLOCKS = Object.freeze([
  { label: "the exact-profile program", start: "readonly EXACT_PROFILE_PROGRAM='\n", end: "\n'\n" },
  { label: "the environment-file parser", start: "secret_values_from_env_file() {\n", end: "    }' \"$1\"\n}\n" },
]);
// The port of the harness's stall server, set before any scenario runs.
let stallPort = 0;

// Each seed is one defect in a real helper, with the scenario that must catch it. The harness applies
// it to a copy of the helper, reruns every scenario, and fails if the named one still passes.
/** @typedef {{ label: string, helper: "boot" | "alert" | "scheduler" | "reset", from: string, to: string, caughtBy: string }} Seed */
/** @type {readonly Seed[]} */
const SEEDS = Object.freeze([
  { label: "the boot ignores an operator hold", helper: "boot", from: "if test -e \"$OPERATOR_HOLD\" || test -L \"$OPERATOR_HOLD\"; then\n  stop_with_alert 'boot-held'", to: "if false; then\n  stop_with_alert 'boot-held'", caughtBy: "an operator hold stops the boot" },
  { label: "the boot ignores a deployment marker", helper: "boot", from: "if test -e \"$DEPLOYMENT_MARKER\" || test -L \"$DEPLOYMENT_MARKER\"; then\n  stop_with_alert 'boot-marker-present'", to: "if false; then\n  stop_with_alert 'boot-marker-present'", caughtBy: "a deployment marker stops the boot" },
  {
    label: "the boot does not check the database",
    helper: "boot",
    // Every database check goes, or a remaining one would still refuse the missing file.
    from: "  test -f \"$mountpoint/longtail-forge.db\" && test ! -L \"$mountpoint/longtail-forge.db\"\n  test -d \"$mountpoint/files\" && test ! -L \"$mountpoint/files\"\n  test \"$(stat -c '%u' \"$mountpoint/longtail-forge.db\")\" = '10001'\n  test \"$(stat -c '%u' \"$mountpoint/files\")\" = '10001'\n  test -s \"$mountpoint/longtail-forge.db\"\n",
    to: "  test -d \"$mountpoint/files\" && test ! -L \"$mountpoint/files\"\n  test \"$(stat -c '%u' \"$mountpoint/files\")\" = '10001'\n",
    caughtBy: "a missing database stops the boot",
  },
  { label: "the boot does not check the cached image", helper: "boot", from: "  docker image inspect --format '{{.Id}}' \"$IMAGE_REFERENCE\" >/dev/null\n", to: "", caughtBy: "an image missing from the local cache" },
  { label: "the boot skips its scanner wait", helper: "boot", from: "wait_until scanner \"$SCANNER_WAIT\" scanner_answers ||", to: "true ||", caughtBy: "a scanner that never answers" },
  { label: "the boot starts without enforcing isolation", helper: "boot", from: "run_check isolation public_demo_isolation enforce", to: "run_check isolation true", caughtBy: "a boot with no missed boundary" },
  { label: "the boot starts without the curtain", helper: "boot", from: "install -o root -g root -m 0644 /dev/null \"$DEPLOYMENT_MARKER\"\nstart_and_verify() {", to: "true\nstart_and_verify() {", caughtBy: "a boot with no missed boundary" },
  { label: "the boot never resets after a missed boundary", helper: "boot", from: "[[ \"$LATEST_COMPLETED\" < \"$LAST_BOUNDARY\" ]]", to: "[[ \"$LATEST_COMPLETED\" < \"0\" ]]", caughtBy: "a missed boundary runs a fresh reset" },
  { label: "the boot's reset does not inherit the lock", helper: "boot", from: "--caller boot --confirm \"$RESET_CONFIRMATION\" > \"$WORK/reset.out\"", to: "--caller boot --confirm \"$RESET_CONFIRMATION\" 9>&- > \"$WORK/reset.out\"", caughtBy: "a missed boundary runs a fresh reset" },
  { label: "the boot's reset is not its delegate", helper: "boot", from: "    --caller boot --confirm", to: "    --confirm", caughtBy: "a missed boundary runs a fresh reset" },
  { label: "the boot accepts a second network", helper: "boot", from: "    and (.networks | type == \"object\" and length == 1 and ((.[] // {}) == {}))\n", to: "", caughtBy: "an extra network stops the boot" },
  { label: "the boot accepts another data volume", helper: "boot", from: "      and $root.volumes[$mounts[1].source] == {name: $volume})", to: "      and true)", caughtBy: "another data volume stops the boot" },
  { label: "the boot accepts another image", helper: "boot", from: "    and .image == $image\n", to: "", caughtBy: "an image other than the recorded release stops the boot" },
  { label: "the boot accepts a volume subpath", helper: "boot", from: "    (if .volume == {} then del(.volume) else . end)\n", to: "    del(.volume)\n", caughtBy: "a volume subpath stops the boot" },
  { label: "the boot accepts inherited and secret mounts", helper: "boot", from: "    ((keys - [\"cap_drop\",", to: "    (([] - [\"cap_drop\",", caughtBy: "inherited mounts stop the boot" },
  { label: "the reset accepts a volume subpath", helper: "reset", from: "    (if .volume == {} then del(.volume) else . end)\n", to: "    del(.volume)\n", caughtBy: "the reset refuses a volume subpath" },
  { label: "the reset's profile program drifts from the boot's", helper: "reset", from: "    and .user == \"10001:10001\"\n", to: "    and .user != \"\"\n", caughtBy: "the boot and the reset carry the same profile program" },
  { label: "the boot may pull", helper: "boot", from: "--force-recreate --pull never \"${SQLITE_SERVICES[@]}\"", to: "--force-recreate \"${SQLITE_SERVICES[@]}\"", caughtBy: "a boot with no missed boundary" },
  { label: "the boot leaves an unverified container running", helper: "boot", from: "  run_check stop-unverified stop_unverified\n", to: "", caughtBy: "a container that fails its post-start isolation check" },
  { label: "the boot ignores a failed stop", helper: "boot", from: "  test \"$CHECK_STATUS\" -eq 0 || stop_with_alert 'boot-stop-failed'", to: "  true || stop_with_alert 'boot-stop-failed'", caughtBy: "an unverified container that cannot be stopped" },
  { label: "the boot trusts compose stop's exit status", helper: "boot", from: "  bounded_compose \"$STOP_LIMIT\" stop --timeout 30 \"${SQLITE_SERVICES[@]}\" ||", to: "  bounded_compose \"$STOP_LIMIT\" stop --timeout 30 \"${SQLITE_SERVICES[@]}\" && return 0 ||", caughtBy: "a stop that leaves the unverified container running" },
  { label: "the boot never escalates to a kill", helper: "boot", from: "  bounded_compose \"$KILL_LIMIT\" kill \"${SQLITE_SERVICES[@]}\" ||", to: "  true ||", caughtBy: "a stop that leaves the unverified container running" },
  { label: "the boot takes a failed state query for a stop", helper: "boot", from: "  running=\"$(bounded_compose \"$QUERY_LIMIT\" ps --status running -q \"$@\")\" || return 1\n", to: "  running=\"$(bounded_compose \"$QUERY_LIMIT\" ps --status running -q \"$@\")\" || true\n", caughtBy: "a failed state query after the stop" },
  { label: "the boot's stop has no deadline", helper: "boot", from: "bounded_compose \"$STOP_LIMIT\" stop --timeout 30", to: "compose stop --timeout 30", caughtBy: "a stop that leaves the unverified container running" },
  { label: "the boot's kill has no deadline", helper: "boot", from: "bounded_compose \"$KILL_LIMIT\" kill", to: "compose kill", caughtBy: "a kill that never returns" },
  { label: "the boot's state query has no deadline", helper: "boot", from: "  running=\"$(bounded_compose \"$QUERY_LIMIT\" ps", to: "  running=\"$(compose ps", caughtBy: "a state query that never returns" },
  { label: "the boot's deadlines never escalate to a kill", helper: "boot", from: "  timeout --kill-after=5 \"$limit\" docker compose", to: "  timeout \"$limit\" docker compose", caughtBy: "a stop that leaves the unverified container running" },
  { label: "the boot lets a failed reset lift its curtain", helper: "boot", from: "    ensure_curtain\n", to: "", caughtBy: "a failed fresh reset that lifted the curtain" },
  { label: "the boot keeps raw check output", helper: "boot", from: "  keep_redacted \"$WORK/check.err\" \"$OPERATION_DIR/$name.err\"", to: "  cp \"$WORK/check.err\" \"$OPERATION_DIR/$name.err\"", caughtBy: "a check's diagnostics are redacted" },
  { label: "the boot keeps the Compose parser's output", helper: "boot", from: "  compose config --format json > \"$WORK/resolved.json\" 2>/dev/null \\\n", to: "  compose config --format json > \"$WORK/resolved.json\" \\\n", caughtBy: "a Compose parser error is not kept by the boot" },
  { label: "the boot collects no secret from the resolved environment", helper: "boot", from: "  jq -r '.services[]?.environment // {}", to: "  true || jq -r '.services[]?.environment // {}", caughtBy: "a check's diagnostics are redacted" },
  { label: "the boot misses the role passwords", helper: "boot", from: "jq -er '.passwords | objects | [.[] | strings | select(length > 0)] | if length > 0 then .[] else error(\"no role password\") end'", to: "jq -r '.. | objects | .password? // empty | strings'", caughtBy: "a check's diagnostics are redacted" },
  { label: "the boot tolerates missing role credentials", helper: "boot", from: "  require_root_owned_private_file \"$ROLE_CREDENTIALS\" 'public-demo role credentials'\n", to: "  test -f \"$ROLE_CREDENTIALS\" || return 0\n", caughtBy: "missing role credentials stop the boot" },
  { label: "the boot skips the host environment", helper: "boot", from: "  secret_values_from_env_file \"$COMPOSE_HOST_ENV\" >> \"$WORK/redactions\"\n", to: "", caughtBy: "a check's diagnostics are redacted" },
  { label: "the boot keeps a host secret's quotes", helper: "boot", from: "      } else if (quote == \"\\\"\") {", to: "      } else if (quote == \"never\") {", caughtBy: "a check's diagnostics are redacted" },
  { label: "the boot's readiness probe has no time limit", helper: "boot", from: "--max-time \"$REQUEST_LIMIT\" http://127.0.0.1:8001/readyz", to: "http://127.0.0.1:8001/readyz", caughtBy: "a stalled readiness response is abandoned" },
  { label: "the boot's identity probe has no time limit", helper: "boot", from: "--max-time \"$REQUEST_LIMIT\" http://127.0.0.1:8001/api/app-info", to: "http://127.0.0.1:8001/api/app-info", caughtBy: "a boot with no missed boundary" },
  { label: "alerts allow mentions", helper: "alert", from: "allowed_mentions:{parse:[]}", to: "allowed_mentions:{parse:[\"everyone\"]}", caughtBy: "notify posts the bounded fields" },
  { label: "the URL reaches curl's argv", helper: "alert", from: "printf 'url = \"%s\"\\n' \"$url\" | curl --config -", to: "printf '' | curl \"$url\" --config -", caughtBy: "notify posts the bounded fields" },
  { label: "a readable webhook file is accepted", helper: "alert", from: "test \"$(stat -c '%u:%g:%a' \"$file\")\" = '0:0:600' ||", to: "true ||", caughtBy: "notify refuses a webhook file another user could read" },
  { label: "any https URL passes as a Discord webhook", helper: "alert", from: "  [[ \"$url\" =~ $pattern ]] || fail", to: "  true || fail", caughtBy: "notify refuses a non-Discord host" },
  { label: "the scheduler ignores an operator hold", helper: "scheduler", from: "if test -e \"$OPERATOR_HOLD\" || test -L \"$OPERATOR_HOLD\"; then\n  append_event 'finished' 'skipped-held'", to: "if false; then\n  append_event 'finished' 'skipped-held'", caughtBy: "the scheduler records a held run" },
  { label: "the boot sends no heartbeat", helper: "boot", from: "\"$ALERT_HELPER\" heartbeat --target \"$DEMO_TARGET\"", to: "true heartbeat --target \"$DEMO_TARGET\"", caughtBy: "a missed boundary runs a fresh reset" },
  { label: "the scheduler sends no heartbeat", helper: "scheduler", from: "    \"$ALERT_HELPER\" heartbeat --target", to: "    true heartbeat --target", caughtBy: "the scheduler sends the heartbeat" },
  { label: "the reset ignores an operator hold", helper: "reset", from: "if test -e \"$OPERATOR_HOLD\" || test -L \"$OPERATOR_HOLD\"; then fail", to: "if false; then fail", caughtBy: "the reset helper refuses under a hold" },
  { label: "a boot-delegated recovery lifts the curtain", helper: "reset", from: "    if test \"$LIFT_CURTAIN_ON_RECOVERY\" = true; then\n      clear_marker", to: "    if true; then\n      clear_marker", caughtBy: "a boot-delegated reset that fails verification" },
  { label: "a boot-delegated reset verifies the public edge", helper: "reset", from: "  test \"$CALLER\" != 'boot' || return 0\n", to: "", caughtBy: "a boot-delegated reset ignores a failing public edge" },
  { label: "a boot-delegated reset lifts the curtain itself", helper: "reset", from: "if test \"$CALLER\" != 'boot'; then clear_marker; fi", to: "clear_marker", caughtBy: "a boot-delegated reset leaves the curtain to the boot" },
  { label: "a stopped-app start lifts the curtain before the fresh baseline", helper: "reset", from: "  assert_marker\n  start_sqlite_users\n  verify_runtime\n}\n", to: "  assert_marker\n  start_sqlite_users\n  verify_runtime\n  clear_marker\n}\n", caughtBy: "a reset that starts a stopped app keeps the curtain up" },
  { label: "a recovery after a stopped-app start lifts the curtain", helper: "reset", from: "  APP_STARTED_BY_RESET=true\n  LIFT_CURTAIN_ON_RECOVERY=false\n", to: "  APP_STARTED_BY_RESET=true\n", caughtBy: "a reset that started a stopped app restores the prior unit behind its curtain" },
  { label: "the reset keeps the Compose parser's output", helper: "reset", from: "compose config --quiet >/dev/null 2>&1 \\\n", to: "compose config --quiet \\\n", caughtBy: "the reset keeps no Compose parser output" },
  { label: "the reset collects no secret from the resolved environment", helper: "reset", from: "jq -r '.services[]?.environment // {}", to: "true || jq -r '.services[]?.environment // {}", caughtBy: "a reset step's diagnostics are redacted" },
  { label: "the reset misses the role passwords", helper: "reset", from: "jq -er '.passwords | objects | [.[] | strings | select(length > 0)] | if length > 0 then .[] else error(\"no role password\") end'", to: "jq -r '.. | objects | .password? // empty | strings'", caughtBy: "a reset step's diagnostics are redacted" },
  { label: "the reset's role proof has no time limit", helper: "reset", from: "--max-time \"$REQUEST_LIMIT\" --cookie \"$SESSION_ROOT/post-reset.cookie\" \\\n    --cookie-jar \"$SESSION_ROOT/post-reset.cookie\" http://127.0.0.1:8001/api/csrf-token", to: "--cookie \"$SESSION_ROOT/post-reset.cookie\" \\\n    --cookie-jar \"$SESSION_ROOT/post-reset.cookie\" http://127.0.0.1:8001/api/csrf-token", caughtBy: "a stalled role proof is abandoned" },
  { label: "the reset's session capture has no time limit", helper: "reset", from: "--max-time \"$REQUEST_LIMIT\" --output /dev/null", to: "--output /dev/null", caughtBy: "a standalone reset lifts the curtain" },
  { label: "the reset keeps the pre-reset login's body", helper: "reset", from: "--output /dev/null --write-out", to: "--output \"$OPERATION_DIR/pre-reset-login-body.json\" --write-out", caughtBy: "the reset keeps no visitor-entered content" },
  { label: "retention keeps three backups", helper: "reset", from: "readonly RETAINED_BACKUPS=2\n", to: "readonly RETAINED_BACKUPS=3\n", caughtBy: "retention apply keeps the newest backups" },
  { label: "retention keeps every evidence directory", helper: "reset", from: "readonly RETAINED_EVIDENCE=168\n", to: "readonly RETAINED_EVIDENCE=1000\n", caughtBy: "retention apply keeps the newest backups" },
  { label: "retention keeps the oldest resets", helper: "reset", from: "| LC_ALL=C sort -r)", to: "| LC_ALL=C sort)", caughtBy: "retention apply keeps the newest backups" },
  { label: "retention takes an incident for a completed reset", helper: "reset", from: ".operationId == $id and .phase == \"completed\"'", to: ".operationId == $id and .phase != \"\"'", caughtBy: "retention apply keeps the newest backups" },
  { label: "the automatic step ignores its cap", helper: "reset", from: "elif test -n \"$cap\" && {", to: "elif false && {", caughtBy: "the automatic step removes nothing beyond its cap" },
  { label: "a retention plan removes", helper: "reset", from: "if test \"$mode\" = 'plan'; then\n    status='planned'", to: "if false; then\n    status='planned'", caughtBy: "retention plan reports the selection" },
  { label: "retention accepts a backup another user owns", helper: "reset", from: "  test \"$owner\" = \"$root_owner\" && test \"$links\" = '1'\n", to: "  test \"$links\" = '1'\n", caughtBy: "retention refuses a backup the container user does not own" },
  { label: "retention removes evidence holding a link", helper: "reset", from: "\\( -type l -o ! \\( -type f -o -type d \\) -o ! -user 0 \\)", to: "\\( ! -user 0 \\)", caughtBy: "retention refuses evidence holding a link" },
  { label: "the automatic step runs behind the curtain", helper: "reset", from: "RETENTION_SUMMARY='{\"status\":\"failed\"}'\nif test \"$RETENTION_INTERRUPTED\" = false; then", to: "assert_marker\nRETENTION_SUMMARY='{\"status\":\"failed\"}'\nif test \"$RETENTION_INTERRUPTED\" = false; then", caughtBy: "a completed reset prunes its history automatically" },
  { label: "a retention failure fails the reset", helper: "reset", from: "  set +e\n  step retention retain_history", to: "  set -e\n  step retention retain_history", caughtBy: "a failed retention step never fails the completed reset" },
  { label: "a boot-delegated reset skips retention", helper: "reset", from: "if test \"$RETENTION_INTERRUPTED\" = false; then\n  set +e", to: "if test \"$CALLER\" != 'boot' && test \"$RETENTION_INTERRUPTED\" = false; then\n  set +e", caughtBy: "a boot-delegated reset leaves the curtain to the boot" },
  { label: "retention rebuilds the firewall", helper: "reset", from: "  step isolation-check public_demo_isolation check\n", to: "  step isolation-check public_demo_isolation enforce\n", caughtBy: "retention plan reports the selection and changes nothing" },
  { label: "retention trusts a failed history listing", helper: "reset", from: "    || fail 'the reset history could not be listed; nothing was removed'", to: "    || true", caughtBy: "retention refuses when its history listing fails" },
  { label: "retention trusts a failed evidence traversal", helper: "reset", from: "-print -quit)\" || return 1", to: "-print -quit)\" || true", caughtBy: "retention refuses when an evidence traversal fails" },
  { label: "retention trusts a failed backup listing", helper: "reset", from: "    || fail 'the backup root could not be listed; nothing was removed'", to: "    || true", caughtBy: "retention refuses when its backup listing fails" },
  { label: "retention accepts a linked history root", helper: "reset", from: "  test -d \"$OPERATION_ROOT\" && test ! -L \"$OPERATION_ROOT\" && test \"$(stat -c '%u' \"$OPERATION_ROOT\")\" = '0' \\\n    || fail 'the reset history root is not a root-owned real directory; nothing was removed'\n", to: "", caughtBy: "the automatic step refuses a reset history root that is a link" },
  { label: "the cap ignores evidence tombstones", helper: "reset", from: "test \"$((${#evidence_operations[@]} + ${#tombstones[@]}))\" -gt \"$cap\"", to: "test \"${#evidence_operations[@]}\" -gt \"$cap\"", caughtBy: "the automatic step counts evidence tombstones against its cap" },
  { label: "the cap ignores in-volume tombstones", helper: "reset", from: "test \"$((unit_selected + unit_tombstones))\" -gt \"$cap\"", to: "test \"$unit_selected\" -gt \"$cap\"", caughtBy: "the automatic step counts in-volume tombstones against its cap" },
  { label: "retention removes the backup of the reset it belongs to", helper: "reset", from: "    test \"$operation_id\" != \"$OPERATION_ID\" || fail 'the current reset ranks outside the retained history; nothing was removed'\n", to: "", caughtBy: "the automatic step never removes the reset it belongs to" },
  { label: "retention removes the retired unit of the reset it belongs to", helper: "reset", from: "    || fail 'the current reset ranks among the retired units to remove; nothing was removed'", to: "    || true", caughtBy: "the automatic step never removes the retired unit of the reset it belongs to" },
  { label: "a signal during retention fails the completed reset", helper: "reset", from: "trap 'RETENTION_INTERRUPTED=true' HUP INT TERM\n", to: "", caughtBy: "a signal during retention leaves the completed reset completed" },
  { label: "the exit handler rewrites a completed reset", helper: "reset", from: "  if test \"$RESET_COMPLETED\" = true; then\n    cleanup_session_material\n    return \"$status\"\n  fi\n", to: "", caughtBy: "a completed reset whose result cannot be written" },
  { label: "retention keeps legacy login bodies", helper: "reset", from: "printf '%s\\n' \"$LEGACY_LOGIN_RECORD\" > \"$file.tmp\"\n      mv -T -- \"$file.tmp\" \"$file\"", to: "true", caughtBy: "retention apply replaces the legacy login records" },
  { label: "the scheduler takes a retention failure for success", helper: "scheduler", from: "if test \"$RETENTION_STATUS\" = 'failed' || test \"$RETENTION_STATUS\" = 'capped'; then", to: "if false; then", caughtBy: "the scheduler records a retention failure" },
  { label: "the alert refuses the retention class", helper: "alert", from: "|reset-failed-unrecovered|retention-failed|", to: "|reset-failed-unrecovered|", caughtBy: "the scheduler records a retention failure" },
  { label: "the reset takes a failed state query for a stop", helper: "reset", from: "  running=\"$(bounded_compose \"$QUERY_LIMIT\" ps --status running -q \"$@\")\" || return 1\n", to: "  running=\"$(bounded_compose \"$QUERY_LIMIT\" ps --status running -q \"$@\")\" || true\n", caughtBy: "a reset whose state query fails" },
  { label: "the reset's stop has no deadline", helper: "reset", from: "  bounded_compose \"$STOP_LIMIT\" stop \"${SQLITE_SERVICES[@]}\"", to: "  compose stop \"${SQLITE_SERVICES[@]}\"", caughtBy: "a standalone reset lifts the curtain" },
  { label: "the reset's recovery keeps a step's diagnostics unredacted", helper: "reset", from: "  step recovery-stop stop_sqlite_users\n", to: "  stop_sqlite_users\n", caughtBy: "a recovery step's diagnostics are redacted" },
  { label: "the reset drops its redaction list before recovering", helper: "reset", from: "  local status=\"$1\"\n  if test \"$RESET_COMPLETED\" = true; then", to: "  local status=\"$1\"\n  rm -f -- \"$SESSION_ROOT/redactions\"\n  if test \"$RESET_COMPLETED\" = true; then", caughtBy: "a recovery step's diagnostics are redacted" },
  { label: "the reset leaves its session material after recovery", helper: "reset", from: "  ( run_recovery )\n  trap - HUP INT TERM\n  cleanup_session_material\n", to: "  ( run_recovery )\n  trap - HUP INT TERM\n", caughtBy: "a recovery step's diagnostics are redacted" },
  { label: "retention normalizes the roots it checks", helper: "reset", from: "if test \"${1:-}\" != 'retention'; then\n  install -d", to: "if true; then\n  install -d", caughtBy: "retention leaves every root it checks as it found it" },
  { label: "retention creates its evidence root before it holds the lock", helper: "reset", from: "flock -n 9 || lock_contended", to: "install -d -o root -g root -m 0700 \"$RETENTION_ROOT\"\nflock -n 9 || lock_contended", caughtBy: "retention waits for the lifecycle lock" },
  { label: "retention accepts a history root another user owns", helper: "reset", from: "  test \"$(stat -c '%u' \"$target\")\" = '0' || fail \"$label must be root-owned\"\n", to: "", caughtBy: "retention refuses a reset history root another user owns" },
  { label: "retention follows a linked history root", helper: "reset", from: " \"$OPERATION_ROOT:reset history root\"; do", to: "; do", caughtBy: "retention refuses a reset history root that is a link before" },
  {
    label: "the reset lifts its curtain before it holds signals or counts as finalized",
    helper: "reset",
    from: "trap 'RETENTION_INTERRUPTED=true' HUP INT TERM\nstep finalize run_activation finalize \"$OPERATION_DIR/finalize.json\"\nRECOVERY_ARMED=false\nRESET_COMPLETED=true\nrecord_phase 'finalized'\n# The boot lifts its own curtain once this reset reports success.\nif test \"$CALLER\" != 'boot'; then clear_marker; fi\n",
    to: "step finalize run_activation finalize \"$OPERATION_DIR/finalize.json\"\n# The boot lifts its own curtain once this reset reports success.\nif test \"$CALLER\" != 'boot'; then clear_marker; fi\nRECOVERY_ARMED=false\nRESET_COMPLETED=true\ntrap 'RETENTION_INTERRUPTED=true' HUP INT TERM\n",
    caughtBy: "a signal as the curtain lifts",
  },
  {
    label: "the reset holds signals only once finalizing has returned",
    helper: "reset",
    from: "trap 'RETENTION_INTERRUPTED=true' HUP INT TERM\nstep finalize run_activation finalize \"$OPERATION_DIR/finalize.json\"\n",
    to: "step finalize run_activation finalize \"$OPERATION_DIR/finalize.json\"\ntrap 'RETENTION_INTERRUPTED=true' HUP INT TERM\n",
    caughtBy: "a signal to the reset while it finalizes",
  },
  {
    label: "the reset lifts its curtain before it counts as finalized",
    helper: "reset",
    from: "RECOVERY_ARMED=false\nRESET_COMPLETED=true\nrecord_phase 'finalized'\n# The boot lifts its own curtain once this reset reports success.\nif test \"$CALLER\" != 'boot'; then clear_marker; fi\n",
    to: "# The boot lifts its own curtain once this reset reports success.\nif test \"$CALLER\" != 'boot'; then clear_marker; fi\nRECOVERY_ARMED=false\nRESET_COMPLETED=true\nrecord_phase 'finalized'\n",
    caughtBy: "a finalized reset whose curtain cannot be lifted",
  },
  { label: "retention finds its own replacement legacy again", helper: "reset", from: " or . == $replacement'", to: "'", caughtBy: "retention apply replaces the legacy login records" },
  { label: "the scheduler reads a curtained recovery as a lifted one", helper: "scheduler", from: "elif grep -Fq 'prior unit was restored and verified behind the retained maintenance curtain' \"$RUN_ROOT/reset.err\"; then", to: "elif false; then", caughtBy: "the scheduler records a recovery behind the retained curtain" },
]);

/**
 * @typedef {{ extraNetwork?: boolean, dataVolume?: string, image?: string, subpath?: boolean, secretMount?: boolean, volumesFrom?: boolean }} ProfileDrift
 * @typedef {{
 *   dockerDown?: boolean, imageMissing?: boolean, health?: string, bridgeAfter?: number | null, scannerAfter?: number | null,
 *   curlFails?: boolean, resetExit?: number, resetFailure?: "unrecovered" | "recovered" | "recovered-curtained", resetRemovesMarker?: boolean,
 *   profile?: ProfileDrift, configCanary?: boolean, imageInspectCanary?: boolean, isolationCheckFails?: boolean,
 *   running?: boolean, identityFailCalls?: number[], publicFails?: boolean, candidateBuildFails?: boolean, candidateBuildCanary?: boolean,
 *   roleCredentials?: "missing" | "empty", stall?: string, stopFails?: "error" | "silent", killFails?: boolean,
 *   stateQuery?: "fails" | "fails-after-kill", dockerStall?: "kill" | "first-state-query", stopCanary?: boolean,
 *   resetRetention?: string, unitsToPrune?: number, pruneFails?: boolean, unitTombstones?: number, pruneSignals?: boolean,
 *   pruneSelectsCurrent?: boolean, findFails?: "history" | "evidence" | "backups",
 *   curtainSignal?: boolean, finalizeSignals?: boolean, finalizeReplacesMarker?: boolean,
 * }} Scenario
 */
/** @typedef {{ running: boolean, isolationEnforced: boolean, probes: Record<string, number>, clock: number, identityCalls: number, stateQueries?: number, killed?: boolean }} Runtime */
/** @typedef {{ tool: string, markerPresent: boolean, args: string[], stdin?: string, lockInherited?: boolean, isolationEnforced?: boolean, stalled?: boolean, unboundedStall?: boolean }} Call */
/** @typedef {{ root: string, state: string, helperEnv: string, deployRoot: string, volume: string, marker: string, isolation: string }} Sandbox */

if (process.argv[2] === "--fake") {
  process.exitCode = runFake(String(process.argv[3]), process.argv.slice(4));
} else {
  await main();
}

// ---------------------------------------------------------------------------------------------
// Fakes. Each runs as a child of a helper, as root, and reads the scenario the harness wrote.
// ---------------------------------------------------------------------------------------------

/** @param {string} tool @param {string[]} args @returns {number} */
function runFake(tool, args) {
  const state = String(process.env.HARNESS_STATE || "");
  const scenario = /** @type {Scenario} */ (readJson(path.join(state, "scenario.json")));
  const runtime = /** @type {Runtime} */ (readJson(path.join(state, "runtime.json")));
  const markerPath = String(readJson(path.join(state, "paths.json")).marker);
  /** @param {Partial<Call>} extra */
  const record = (extra = {}) => {
    fs.appendFileSync(path.join(state, "calls.jsonl"), `${JSON.stringify({ tool, markerPresent: fs.existsSync(markerPath), args, ...extra })}\n`);
  };
  const save = () => fs.writeFileSync(path.join(state, "runtime.json"), JSON.stringify(runtime));
  /** @param {string} name @param {number | null | undefined} after */
  const available = (name, after) => {
    runtime.probes[name] = (runtime.probes[name] || 0) + 1;
    save();
    return after !== null && runtime.probes[name] > Number(after ?? 0);
  };

  if (tool === "sleep") {
    runtime.clock += Math.ceil(Number(args[0] || 0));
    save();
    return 0;
  }
  if (tool === "date") {
    if (args.length === 2 && args[0] === "-u" && args[1] === "+%s") return emit(`${runtime.clock}\n`);
    return spawnSync("/usr/bin/date", args, { stdio: "inherit" }).status ?? 1;
  }
  if (tool === "logger") {
    record();
    return 0;
  }
  if (tool === "ip") {
    record();
    if (!available("bridge", scenario.bridgeAfter)) return 1;
    return emit(`7: ltf-demo0    inet ${GATEWAY}/24 brd 172.30.31.255 scope global ltf-demo0\\       valid_lft forever preferred_lft forever\n`);
  }
  if (tool === "timeout") {
    record();
    // A deadline around Docker runs the real timeout, so the deadline really ends a stalled fake.
    if (args.includes("docker")) return spawnSync("/usr/bin/timeout", args, { stdio: "inherit" }).status ?? 1;
    return available("scanner", scenario.scannerAfter) ? emit("PONG") : 1;
  }
  if (tool === "find") {
    // The real find, unless the scenario makes one listing or traversal fail as an I/O error would:
    // with nothing on standard output.
    const failing = {
      history: String(args[0]).endsWith("/demo-reset-operations") && args.includes("-maxdepth"),
      evidence: args.includes("-quit"),
      backups: args[0] === BACKUP_ROOT,
    }[String(scenario.findFails || "")];
    if (failing) {
      process.stderr.write(`find: '${args[0]}': Input/output error\n`);
      return 1;
    }
    return spawnSync("/usr/bin/find", args, { stdio: "inherit" }).status ?? 1;
  }
  if (tool === "isolation") {
    if (args[0] === "enforce") runtime.isolationEnforced = true;
    save();
    record();
    return args[0] === "check" && args.includes("--container") && scenario.isolationCheckFails ? 1 : 0;
  }
  if (tool === "reset") {
    let lockInherited = false;
    try {
      const lockPath = String(readJson(path.join(state, "paths.json")).lock);
      const sameFile = fs.readlinkSync("/proc/self/fd/9") === lockPath;
      const held = spawnSync("flock", ["-n", "9"], { stdio: ["ignore", "ignore", "ignore", "ignore", "ignore", "ignore", "ignore", "ignore", "ignore", 9] }).status === 0;
      lockInherited = sameFile && held;
    } catch {
      lockInherited = false;
    }
    record({ lockInherited });
    if ((scenario.resetExit ?? 0) !== 0) {
      // A recovery that lifts the curtain, as a reset not acting for the boot would.
      if (scenario.resetRemovesMarker) fs.rmSync(markerPath, { force: true });
      const message = {
        unrecovered: "reset and automatic recovery failed; maintenance curtain and protected evidence remain",
        recovered: "reset failed; prior unit was restored and verified",
        "recovered-curtained": "reset failed; prior unit was restored and verified behind the retained maintenance curtain",
      }[scenario.resetFailure || "unrecovered"];
      process.stderr.write(`longtail-forge-public-demo-reset: ${message}\n`);
      return Number(scenario.resetExit);
    }
    // A reset acting for the boot leaves the curtain to it; any other lifts it on success.
    if (!args.includes("--caller")) fs.rmSync(markerPath, { force: true });
    return emit(`${JSON.stringify({
      ok: true, mode: "reset", target: "rt-ltf-demo", operationId: args[args.indexOf("--operation-id") + 1], semanticFingerprint: "f".repeat(64),
      ...(scenario.resetRetention ? { retention: { status: scenario.resetRetention } } : {}),
    })}\n`);
  }
  if (tool === "curl") return fakeCurl(args, scenario, runtime, record, save);
  if (tool === "docker") return fakeDocker(args, scenario, runtime, record, save, state);
  process.stderr.write(`unknown fake tool ${tool}\n`);
  return 2;
}

/**
 * @param {string[]} args @param {Scenario} scenario @param {Runtime} runtime
 * @param {(extra?: Partial<Call>) => void} record @param {() => void} save
 */
function fakeCurl(args, scenario, runtime, record, save) {
  if (args.includes("--config")) {
    const stdin = fs.readFileSync(0, "utf8");
    record({ stdin });
    return scenario.curlFails ? 22 : 0;
  }
  const url = String(args.findLast((arg) => /^https?:\/\//.test(arg)) || "");
  if (scenario.stall && url.startsWith("http://127.0.0.1:8001/") && new URL(url).pathname === scenario.stall) return stallRequest(args, url, record);
  record();
  const output = args.includes("--output") ? String(args[args.indexOf("--output") + 1]) : "";
  const isPublic = onDemoOrigin(url);
  if (isPublic && scenario.publicFails) return 7;
  if (url.endsWith("/readyz")) return emit('{"status":"ready"}\n');
  if (url.endsWith("/healthz")) return emit('{"status":"ok"}\n');
  if (url.endsWith("/api/app-info")) {
    let identity = IDENTITY;
    if (!isPublic) {
      // The direct runtime's identity calls are counted, so a scenario can fail exactly one of them.
      runtime.identityCalls += 1;
      save();
      if ((scenario.identityFailCalls || []).includes(runtime.identityCalls)) identity = { ...IDENTITY, commitSha: "0".repeat(40) };
    }
    return emit(`${JSON.stringify({ canonicalVersion: identity.version, sourceBranch: "main", commitSha: identity.commitSha, artifactSha256: identity.artifact })}\n`);
  }
  // The reset's session capture and its read-only role proof, through the direct runtime.
  if (url.endsWith("/api/public-demo/accounts")) {
    return emit(`${JSON.stringify({ accounts: [{ roleName: "Workspace Administrator", username: "admin@example.test", password: "HarnessPassword-42" }] })}\n`);
  }
  if (url.endsWith("/api/login") || url.endsWith("/api/session")) {
    // Before the reset, the login answers with the shared account's profile as a visitor left it.
    const preReset = args.includes("--cookie-jar") && String(args[args.indexOf("--cookie-jar") + 1]).endsWith("pre-reset.cookie");
    if (output) fs.writeFileSync(output, preReset ? `${JSON.stringify({ user: { displayName: VISITOR_CANARY } })}\n` : "{}\n");
    return emit(url.endsWith("/api/login") ? "200" : "401");
  }
  if (url.endsWith("/api/csrf-token")) return emit('{"csrfToken":"harness"}\n');
  if (url.includes("/api/files/attachments")) return emit('{"attachments":[{}]}\n');
  if (url.includes("/api/tasks") || url.endsWith("/api/client-projects") || url.endsWith("/api/logout")) return emit("{}\n");
  return 7;
}

/**
 * Sends one request through the real curl, with the helper's own arguments, to a server that accepts
 * the connection and never answers. Only the helper's time limit can end it; one that has none is cut
 * off by the harness and recorded as unbounded.
 * @param {string[]} args @param {string} url @param {(extra?: Partial<Call>) => void} record
 */
function stallRequest(args, url, record) {
  const port = Number(readJson(path.join(String(process.env.HARNESS_STATE || ""), "paths.json")).stallPort);
  const target = new URL(url);
  const stalled = `http://127.0.0.1:${port}${target.pathname}${target.search}`;
  const result = spawnSync("/usr/bin/curl", args.map((arg) => (arg === url ? stalled : arg)), { stdio: "inherit", timeout: STALL_SAFETY_MS, killSignal: "SIGKILL" });
  const unboundedStall = result.signal === "SIGKILL";
  record({ stalled: true, unboundedStall });
  return unboundedStall ? 28 : result.status ?? 1;
}

/**
 * The resolved Compose profile, in the shape `docker compose config --format json` gives for the
 * shipped compose.yaml and the exact demo environment, with any drift the scenario asks for. Each
 * drift has the shape Compose itself gives it.
 * @param {Scenario} scenario
 */
function resolvedProfile(scenario) {
  const drift = scenario.profile || {};
  /** @type {Record<string, unknown>} */
  const service = {
    cap_drop: ["ALL"],
    command: null,
    dns: ["127.0.0.1"],
    entrypoint: null,
    environment: {
      DEMO_MODE: "true", HOST: "0.0.0.0", PORT: "8001", LONGTAIL_ENV: "production", LONGTAIL_DEPLOYMENT_MODE: "compose",
      LONGTAIL_PUBLIC_URL: DEMO_ORIGIN, LONGTAIL_DATABASE_PROVIDER: "sqlite", LONGTAIL_STORAGE_PROVIDER: "local",
      LONGTAIL_FILE_SCANNER: "clamd", LONGTAIL_CLAMD_HOST: GATEWAY, LONGTAIL_CLAMD_PORT: "3310", LONGTAIL_WORKER_MODE: "inline",
      LONGTAIL_SUPPORT_VIEW_ENABLED: "false", LONGTAIL_DATA_DIR: "/var/lib/longtail-forge",
      LONGTAIL_DATABASE_FILE: "/var/lib/longtail-forge/longtail-forge.db", LONGTAIL_LOCAL_STORAGE_ROOT: "/var/lib/longtail-forge/files",
      LONGTAIL_WORKSPACE_BACKUP_ROOT: "/var/backups/longtail-forge/workspaces", SUPER_ADMIN_PASSWORD: CANARY,
    },
    healthcheck: { test: ["CMD", "node", "-e", "process.exit(0)"], timeout: "5s", interval: "15s", retries: 4, start_period: "30s" },
    image: drift.image || IMAGE,
    init: true,
    logging: { driver: "local", options: { "max-file": "7", "max-size": "10m" } },
    networks: drift.extraNetwork ? { demo: null, other: null } : { demo: null },
    ports: [{ mode: "ingress", host_ip: "127.0.0.1", target: 8001, published: "8001", protocol: "tcp" }],
    read_only: true,
    restart: "no",
    security_opt: ["no-new-privileges:true"],
    stop_grace_period: "30s",
    tmpfs: ["/tmp:rw,noexec,nosuid,nodev,size=512m,mode=0700,uid=10001,gid=10001"],
    user: "10001:10001",
    volumes: [
      { type: "volume", source: "data", target: "/var/lib/longtail-forge", volume: drift.subpath ? { subpath: "units/retained" } : {} },
      { type: "bind", source: BACKUP_ROOT, target: "/var/backups/longtail-forge" },
    ],
  };
  if (drift.volumesFrom) service.volumes_from = ["container:retained-unit"];
  if (drift.secretMount) service.secrets = [{ source: "demo", target: "/run/secrets/demo" }];
  return {
    name: "longtail-forge",
    networks: {
      demo: { name: DEMO_NETWORK, ipam: {}, external: true },
      ...(drift.extraNetwork ? { other: { name: "longtail-forge-other", ipam: {}, external: true } } : {}),
    },
    services: { "longtail-forge": service },
    volumes: { data: { name: drift.dataVolume || DEMO_VOLUME } },
    ...(drift.secretMount ? { secrets: { demo: { name: "longtail-forge_demo", file: "/etc/hosts" } } } : {}),
  };
}

/**
 * @param {string[]} args @param {Scenario} scenario @param {Runtime} runtime
 * @param {(extra?: Partial<Call>) => void} record @param {() => void} save @param {string} state
 */
function fakeDocker(args, scenario, runtime, record, save, state) {
  if (args[0] === "compose") {
    const sub = composeVerb(args);
    const stateQuery = isStateQuery(args);
    if (stateQuery) {
      runtime.stateQueries = (runtime.stateQueries || 0) + 1;
      save();
    }
    if ((sub === "kill" && scenario.dockerStall === "kill") || (stateQuery && scenario.dockerStall === "first-state-query" && runtime.stateQueries === 1)) {
      return stallDocker(record);
    }
    if (sub === "up") {
      record({ isolationEnforced: runtime.isolationEnforced });
      runtime.running = true;
      save();
      return 0;
    }
    record();
    if (sub === "config" && !args.includes("--services") && scenario.configCanary) {
      // Compose quotes the offending value when an environment file does not parse.
      process.stderr.write(`failed to read /etc/longtail-forge/public-demo.env: Invalid template: "${CANARY}"\n`);
      return 1;
    }
    if (sub === "config" && args.includes("--services")) return emit("longtail-forge\n");
    if (sub === "config" && args.includes("json")) return emit(JSON.stringify(resolvedProfile(scenario)));
    if (sub === "ps") {
      // A state query that fails prints nothing on standard output, as an empty answer would.
      if (stateQuery && (scenario.stateQuery === "fails" || (scenario.stateQuery === "fails-after-kill" && runtime.killed))) {
        process.stderr.write("Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n");
        return 1;
      }
      return emit(runtime.running ? `${"e".repeat(64)}\n` : "");
    }
    if (sub === "stop" || sub === "kill") {
      if (sub === "kill") {
        runtime.killed = true;
        save();
      }
      if (sub === "stop" && scenario.stopCanary) {
        process.stderr.write(`Error response from daemon: credentials ${CANARY} ${ROLE_CANARY} ${HOST_CANARY} were refused\n`);
      }
      // A failed stop exits non-zero; a silent one claims success, but either leaves the container running.
      const failure = sub === "stop" ? scenario.stopFails : scenario.killFails ? "error" : undefined;
      if (failure === "error") return 1;
      if (failure !== "silent") {
        runtime.running = false;
        save();
      }
      return 0;
    }
    if (sub === "run") return fakeComposeRun(args, scenario);
    return 0;
  }
  record();
  if (args[0] === "info") return scenario.dockerDown ? 1 : 0;
  if (args[0] === "volume" && args[1] === "inspect") return emit(`${String(readJson(path.join(state, "paths.json")).volume)}\n`);
  if (args[0] === "image" && args[1] === "inspect") {
    if (scenario.imageInspectCanary) {
      process.stderr.write(`Error response from daemon: registry credentials ${CANARY} ${ROLE_CANARY} ${HOST_CANARY} were refused\n`);
      return 1;
    }
    return scenario.imageMissing ? 1 : emit(`sha256:${"b".repeat(64)}\n`);
  }
  if (args[0] === "network" && args[1] === "inspect") return emit("[]\n");
  if (args[0] === "inspect") {
    if (args.join(" ").includes(".State.Running")) return emit(`${runtime.running ? "true" : "false"}\n`);
    return emit(`${scenario.health || "healthy"}\n`);
  }
  return 0;
}

/** The Compose subcommand in a docker call, or "" for any other call. @param {string[]} args */
function composeVerb(args) {
  if (args[0] !== "compose") return "";
  let index = 1;
  while (["--project-directory", "--file", "--env-file"].includes(String(args[index]))) index += 2;
  return String(args[index] || "");
}

/** Whether a docker call asks which services are running, the query that proves a stop. @param {string[]} args */
function isStateQuery(args) {
  return composeVerb(args) === "ps" && args.includes("--status");
}

/**
 * A Docker command that never returns. Only the helper's own deadline can end it; one that has none
 * runs until the harness's cut-off and is recorded as unbounded.
 * @param {(extra?: Partial<Call>) => void} record
 */
function stallDocker(record) {
  record({ stalled: true });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, DOCKER_STALL_SAFETY_MS);
  record({ unboundedStall: true });
  return 1;
}

/** The one-off containers a reset runs: candidate, activation, and backup. @param {string[]} args @param {Scenario} scenario */
function fakeComposeRun(args, scenario) {
  const at = args.indexOf("node");
  const script = String(args[at + 1] || "");
  const action = String(args[at + 2] || "");
  if (script.endsWith("public-demo-baseline-activation.mjs")) {
    if (action === "prune") return fakePrune(args, scenario);
    if (action === "finalize") {
      // A stop request to the reset alone, while it finalizes; or a curtain replaced by something
      // the reset may not remove, found only once finalizing has succeeded.
      if (scenario.finalizeSignals) signalHelper({ helperOnly: true });
      if (scenario.finalizeReplacesMarker) {
        const marker = String(readJson(path.join(String(process.env.HARNESS_STATE), "paths.json")).marker);
        fs.rmSync(marker, { force: true });
        fs.mkdirSync(marker, { mode: 0o700 });
      }
    }
    return emit(action === "inspect" ? '{"active":false}\n' : `${JSON.stringify({ ok: true, action, status: "no-stale-candidate", moved: 0 })}\n`);
  }
  if (script.endsWith("public-demo-baseline-candidate.mjs")) {
    if (action === "build" && scenario.candidateBuildFails) {
      process.stderr.write("candidate build failed\n");
      return 1;
    }
    if (action === "build" && scenario.candidateBuildCanary) {
      process.stderr.write(`candidate build failed: credentials ${CANARY} ${ROLE_CANARY} ${HOST_CANARY} were refused\n`);
      return 1;
    }
    return emit(`${JSON.stringify({ ok: true, action, semanticFingerprint: "f".repeat(64) })}\n`);
  }
  if (script.endsWith("backup.mjs")) {
    if (action === "create") {
      // The archive and its checksum sidecar, owned by the container user that writes them.
      const name = path.basename(String(args[args.indexOf("--output") + 1]));
      writeBackup(name, "archive\n");
      writeBackup(`${name}.sha256`, `${"0".repeat(64)}  ${name}\n`);
    }
    return emit('{"ok":true}\n');
  }
  return 0;
}

/**
 * The in-volume prune, which runs in the image. The harness reports a selection of the scenario's
 * size, honours plan mode and the cap as the real action does, and can refuse.
 * @param {string[]} args @param {Scenario} scenario
 */
function fakePrune(args, scenario) {
  if (scenario.pruneFails) {
    process.stderr.write("A retired public-demo unit selected for pruning has an unexpected shape; nothing was removed.\n");
    return 1;
  }
  const mode = String(args[args.indexOf("--mode") + 1]);
  if (mode === "plan" && scenario.pruneSignals) signalHelper();
  const cap = args.includes("--max-removals") ? Number(args[args.indexOf("--max-removals") + 1]) : null;
  const selected = scenario.unitsToPrune ?? 1;
  const tombstones = scenario.unitTombstones ?? 0;
  const status = mode === "plan" ? "prune-planned" : cap !== null && selected + tombstones > cap ? "prune-cap-exceeded" : "pruned";
  const selectedOperations = Array.from({ length: selected }, (_, index) => `20250101T${String(index).padStart(6, "0")}Z-scheduled-${index + 1}`);
  // The reset this prune runs for, if the scenario has its own retired unit selected: its evidence is
  // the newest directory in the reset history.
  if (scenario.pruneSelectsCurrent) {
    const history = path.join(path.dirname(String(readJson(path.join(String(process.env.HARNESS_STATE), "paths.json")).lock)), "demo-reset-operations");
    selectedOperations[0] = fs.readdirSync(history).sort().at(-1) || "";
  }
  return emit(`${JSON.stringify({
    contract: "longtail-forge-public-demo-prune-v1", mode, removed: status === "pruned" ? selected + tombstones : 0, retainedOperations: [],
    selected, ...(mode === "plan" ? { selectedOperations } : {}), skipped: 0, status, target: "rt-ltf-demo", tombstones,
  })}\n`);
}

/**
 * Sends TERM to the helper that ran this fake and to the step subshell between them, as a signal to
 * the reset's process group would; or, with `helperOnly`, to the helper alone, as `kill` of its
 * process would. Both are bash; the harness above them is not.
 * @param {{ helperOnly?: boolean }} [options]
 */
function signalHelper({ helperOnly = false } = {}) {
  /** @type {number[]} */
  const ancestors = [];
  let pid = process.ppid;
  while (pid > 1 && path.basename(fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0")[0]) === "bash") {
    ancestors.push(pid);
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    pid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
  }
  assert.ok(ancestors.length >= 2, "the fake must find the helper and its step subshell");
  for (const ancestor of helperOnly ? ancestors.slice(-1) : ancestors) process.kill(ancestor, "SIGTERM");
}

/** A file in the backup root, owned by the container user. @param {string} name @param {string} [content] */
function writeBackup(name, content = "archive\n") {
  const file = path.join(BACKUP_ROOT, name);
  fs.writeFileSync(file, content, { mode: 0o600 });
  fs.chownSync(file, CONTAINER_UID, CONTAINER_UID);
  return file;
}

/** Whether an argument is a URL on exactly the public demo's origin. @param {string} value */
function onDemoOrigin(value) {
  try {
    return new URL(value).origin === DEMO_ORIGIN;
  } catch {
    return false;
  }
}

/** @param {string} text */
function emit(text) {
  process.stdout.write(text);
  return 0;
}

/** @param {string} filePath @returns {Record<string, unknown>} */
function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// ---------------------------------------------------------------------------------------------
// Sandboxes and scenarios.
// ---------------------------------------------------------------------------------------------

async function main() {
  assert.equal(process.platform, "linux", "the public-demo helper harness requires native Linux");
  if (typeof process.getuid === "function" && process.getuid() !== 0) {
    const elevated = spawnSync("sudo", ["-n", process.execPath, scriptPath, ...process.argv.slice(2)], { stdio: "inherit" });
    process.exit(elevated.status ?? 1);
  }
  for (const command of ["bash", "jq", "flock", "find", "install", "stat"]) {
    assert.equal(spawnSync("bash", ["-c", `command -v ${command}`]).status, 0, `${command} is required`);
  }
  assert.ok(fs.existsSync("/usr/bin/curl"), "the real curl is required for the stalled-response scenarios");
  assert.ok(fs.existsSync("/usr/bin/timeout"), "the real timeout is required for the Docker deadline scenarios");
  assert.ok(fs.existsSync("/usr/bin/find"), "the real find is required beneath the failing-listing fake");
  assert.ok(fs.existsSync("/usr/bin/rm"), "the real rm is required beneath the curtain-signal fake");
  // A server that accepts each connection and never answers. The kernel completes the handshake even
  // while the scenarios block this process, so a request to it stalls until its own time limit.
  const stallServer = net.createServer(() => {});
  await new Promise((resolve) => stallServer.listen(0, "127.0.0.1", () => resolve(undefined)));
  stallServer.unref();
  const address = stallServer.address();
  stallPort = typeof address === "object" && address ? address.port : 0;
  assert.ok(stallPort > 0, "the stall server must listen");
  const created = prepareHost();
  const work = fs.mkdtempSync("/tmp/ltf-demo-helper-harness-");
  fs.chmodSync(work, 0o755);
  const fakeBin = path.join(work, "bin");
  fs.mkdirSync(fakeBin, { mode: 0o755 });
  for (const tool of ["docker", "curl", "ip", "timeout", "logger", "sleep", "date", "isolation", "reset", "find"]) {
    fs.writeFileSync(path.join(fakeBin, tool), `#!/usr/bin/env bash\nexec ${shellQuote(process.execPath)} ${shellQuote(scriptPath)} --fake ${tool} "$@"\n`, { mode: 0o755 });
  }
  install(path.join(fakeBin, "reset"), FIXED.installedReset, 0o755);
  install(ALERT_HELPER, FIXED.installedAlert, 0o755);

  /** @type {{ name: string, ok: boolean, detail?: string }[]} */
  const outcomes = [];
  let recorded = outcomes;
  let quiet = false;
  // While a seed is applied, only the scenario that must catch it runs.
  let focus = "";
  let ordinal = 0;
  const helpers = { boot: BOOT_HELPER, alert: ALERT_HELPER, scheduler: SCHEDULER_HELPER, reset: RESET_HELPER };
  /** @param {string} name @param {(box: Sandbox) => void} body @param {Scenario} [scenario] */
  const scenario = (name, body, scenario = {}) => {
    if (focus && !name.startsWith(focus)) return;
    const box = createSandbox(work, (ordinal += 1), scenario);
    try {
      body(box);
      recorded.push({ name, ok: true });
      if (!quiet) console.log(`PASS ${name}`);
    } catch (error) {
      recorded.push({ name, ok: false, detail: error instanceof Error ? error.stack || error.message : String(error) });
      if (!quiet) console.log(`FAIL ${name}\n${error instanceof Error ? error.message : String(error)}`);
    } finally {
      for (const fixed of [FIXED.hold, FIXED.webhook, FIXED.heartbeat, FIXED.schedulerEnv]) fs.rmSync(fixed, { force: true });
    }
  };
  /** @param {Sandbox} box @param {string} helper @param {string[]} args @param {{ stdout?: number }} [options] a descriptor for standard output */
  const runHelper = (box, helper, args, { stdout } = {}) => {
    // Tools of the scenario's own come first, when it has them.
    const own = path.join(box.root, "bin");
    const result = spawnSync("bash", [helper, ...args], {
      encoding: "utf8",
      env: {
        PATH: `${fs.existsSync(own) ? `${own}:` : ""}${fakeBin}:/usr/sbin:/usr/bin:/sbin:/bin`,
        HOME: "/root", LANG: "C.UTF-8", HARNESS_STATE: box.state, LTF_COMPOSE_HELPER_ENV: box.helperEnv,
      },
      timeout: 180_000,
      killSignal: "SIGKILL",
      ...(stdout === undefined ? {} : { stdio: /** @type {import("node:child_process").StdioOptions} */ (["pipe", stdout, "pipe"]) }),
    });
    assert.equal(result.signal, null, "the helper must finish on its own");
    const calls = readCalls(box);
    // Every request any helper makes carries its own time limit, in every scenario.
    for (const call of calls.filter((entry) => entry.tool === "curl")) {
      const limit = Number(call.args[call.args.indexOf("--max-time") + 1]);
      assert.ok(call.args.includes("--max-time") && limit > 0 && limit <= REQUEST_LIMIT_SECONDS, `every request must be bounded: ${JSON.stringify(call.args)}`);
      assert.notEqual(call.unboundedStall, true, `a stalled request ran past the harness's cut-off: ${JSON.stringify(call.args)}`);
    }
    // Every Docker command that stops a service or proves it stopped runs under a bounded deadline
    // that escalates to a kill, in every scenario.
    /** @type {string[]} */
    const deadlines = [];
    for (const call of calls) {
      if (call.tool === "timeout" && call.args.includes("docker")) {
        const at = call.args.indexOf("docker");
        const limit = Number(call.args[at - 1]);
        assert.ok(call.args.some((arg) => /^--kill-after=[1-9][0-9]*$/.test(arg)) && limit > 0 && limit <= DOCKER_LIMIT_SECONDS,
          `every Docker deadline must be bounded and escalate to a kill: ${JSON.stringify(call.args)}`);
        deadlines.push(JSON.stringify(call.args.slice(at + 1)));
      } else if (call.tool === "docker") {
        assert.notEqual(call.unboundedStall, true, `a stalled Docker command ran past the harness's cut-off: ${JSON.stringify(call.args)}`);
        if (!["stop", "kill"].includes(composeVerb(call.args)) && !isStateQuery(call.args)) continue;
        const at = deadlines.indexOf(JSON.stringify(call.args));
        assert.ok(at >= 0, `every stop, kill, and state query must run under a deadline: ${JSON.stringify(call.args)}`);
        deadlines.splice(at, 1);
      }
    }
    return { status: result.status ?? 1, stdout: String(result.stdout), stderr: String(result.stderr), calls };
  };
  /** @param {Sandbox} box */
  const boot = (box) => runHelper(box, helpers.boot, ["run"]);
  /** @param {Sandbox} box @param {string[]} [extra] @param {{ stdout?: number }} [options] */
  const reset = (box, extra = [], options = {}) => runHelper(box, helpers.reset, ["reset", "--target", "rt-ltf-demo", "--anchor-date", "today", ...extra, "--confirm", RESET_CONFIRMATION], options);
  /** @param {Sandbox} box @param {"plan" | "apply"} mode @param {string[]} [extra] */
  const retention = (box, mode, extra = []) => runHelper(box, helpers.reset, ["retention", mode, "--target", "rt-ltf-demo", ...extra]);
  /** @param {Sandbox} box */
  const applyRetention = (box) => retention(box, "apply", ["--confirm", RETENTION_CONFIRMATION]);
  /** The in-volume prunes a run asked for, as their mode and cap. @param {Call[]} calls */
  const prunes = (calls) => calls.filter((call) => call.tool === "docker" && call.args.includes("prune"))
    .map((call) => ({ markerPresent: call.markerPresent, arguments: call.args.slice(call.args.indexOf("--mode")) }));
  /** @param {Call[]} calls */
  const publicCalls = (calls) => calls.filter((call) => call.tool === "curl" && call.args.some(onDemoOrigin));
  /** The modes a run asked the isolation helper for. @param {Call[]} calls */
  const isolationModes = (calls) => calls.filter((call) => call.tool === "isolation").map((call) => call.args[0]);
  const notifyArgs = ["notify", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-scheduled-42", "--trigger", "scheduled",
    "--scheduled-boundary", "2026-11-03T17:00:00Z", "--failure-class", "reset-failed-unrecovered", "--recovery-status", "maintenance-curtain-retained", "--exit-code", "1"];

  const runScenarios = () => {
    // The alert boundary.
    scenario("notify posts the bounded fields to Discord, with mentions disabled and the URL only on standard input", (box) => {
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`);
      const result = runHelper(box, helpers.alert, notifyArgs);
      assert.equal(result.status, 0, result.stderr);
      const curl = only(result.calls, "curl");
      assert.equal(String(curl.stdin), `url = "${WEBHOOK_URL}"\n`);
      assert.ok(!curl.args.some((arg) => arg.includes(WEBHOOK_TOKEN) || arg.includes(WEBHOOK_ID)), "the webhook must never reach argv");
      const payload = JSON.parse(String(curl.args[curl.args.indexOf("--data-binary") + 1]));
      assert.deepEqual(payload.allowed_mentions, { parse: [] });
      assert.match(payload.content, /failureClass=reset-failed-unrecovered recoveryStatus=maintenance-curtain-retained exitCode=1$/);
      assert.ok(!`${result.stdout}${result.stderr}`.includes(WEBHOOK_TOKEN), "the webhook must never reach output");
      assert.match(only(result.calls, "logger").args.join(" "), /failureClass=reset-failed-unrecovered/);
    });
    scenario("notify without a webhook file reaches only the journal, and reports failure", (box) => {
      const result = runHelper(box, helpers.alert, notifyArgs);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /not configured; the alert reached only the local journal/);
      assert.equal(result.calls.filter((call) => call.tool === "curl").length, 0);
      assert.equal(result.calls.filter((call) => call.tool === "logger").length, 1);
    });
    scenario("notify refuses a webhook file another user could read, before any request", (box) => {
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`, 0o644);
      const result = runHelper(box, helpers.alert, notifyArgs);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /must be root:root with mode 0600/);
      assert.equal(result.calls.filter((call) => call.tool === "curl").length, 0);
    });
    for (const [label, url] of [["a non-Discord host", "https://discord.example.com/api/webhooks/123456789012345678/abc"], ["plain HTTP", WEBHOOK_URL.replace("https:", "http:")], ["a second line", `${WEBHOOK_URL}\n${WEBHOOK_URL}`]]) {
      scenario(`notify refuses ${label} in the webhook file, before any request`, (box) => {
        writeFixed(FIXED.webhook, `${url}\n`);
        const result = runHelper(box, helpers.alert, notifyArgs);
        assert.equal(result.status, 1);
        assert.equal(result.calls.filter((call) => call.tool === "curl").length, 0);
        assert.ok(!`${result.stdout}${result.stderr}`.includes("123456789012345678"), "a refused URL must not be echoed");
      });
    }
    scenario("a rejected delivery reports failure without naming the URL", (box) => {
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`);
      const result = runHelper(box, helpers.alert, notifyArgs);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Discord did not accept the alert/);
      assert.ok(!`${result.stdout}${result.stderr}`.includes(WEBHOOK_TOKEN), "the webhook must never reach output");
    }, { curlFails: true });
    scenario("notify refuses an unbounded field before the journal", (box) => {
      const result = runHelper(box, helpers.alert, notifyArgs.map((arg) => (arg === "reset-failed-unrecovered" ? "reset failed; see /etc/shadow" : arg)));
      assert.equal(result.status, 1);
      assert.match(result.stderr, /failure class is invalid/);
      assert.equal(result.calls.length, 0);
    });
    scenario("heartbeat sends one GET with the URL only on standard input", (box) => {
      writeFixed(FIXED.heartbeat, `${HEARTBEAT_URL}\n`);
      const result = runHelper(box, helpers.alert, ["heartbeat", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-boot-7", "--event", "boot"]);
      assert.equal(result.status, 0, result.stderr);
      const curl = only(result.calls, "curl");
      assert.equal(String(curl.stdin), `url = "${HEARTBEAT_URL}"\n`);
      assert.ok(!curl.args.some((arg) => arg.includes("HarnessToken123") || arg === "--data-binary"), "the heartbeat sends no data and no URL in argv");
    });
    scenario("heartbeat without a URL file reports not configured", (box) => {
      const result = runHelper(box, helpers.alert, ["heartbeat", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-boot-7", "--event", "reset"]);
      assert.equal(result.status, 2);
      assert.equal(result.calls.length, 0);
    });
    scenario("heartbeat refuses alert fields", (box) => {
      const result = runHelper(box, helpers.alert, ["heartbeat", "--target", "rt-ltf-demo", "--operation-id", "20261103T170000Z-boot-7", "--event", "boot", "--failure-class", "boot-held"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /heartbeat accepts only/);
    });

    // Boot refusals: each stops with its own class, before anything starts.
    /** @param {ReturnType<typeof runHelper>} result @param {number} status @param {string} failureClass */
    const assertRefused = (result, status, failureClass) => {
      assert.equal(result.status, status, `${failureClass}: ${result.stderr}`);
      assert.match(JSON.parse(lastLine(result.stdout)).failureClass, new RegExp(`^${failureClass}$`));
      assert.match(only(result.calls, "logger").args.join(" "), new RegExp(`trigger=boot .*failureClass=${failureClass} `));
      assert.equal(result.calls.filter((call) => call.tool === "docker" && call.args.includes("up")).length, 0, "nothing may start");
      assert.equal(result.calls.filter((call) => call.tool === "isolation" && call.args[0] === "enforce").length, 0, "nothing may be enforced");
    };
    scenario("an operator hold stops the boot with its own alert, before Docker is touched", (box) => {
      writeFixed(FIXED.hold, "");
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`);
      const result = boot(box);
      assertRefused(result, 3, "boot-held");
      assert.equal(result.calls.filter((call) => call.tool === "docker").length, 0);
      assert.match(JSON.parse(String(only(result.calls, "curl").args[only(result.calls, "curl").args.indexOf("--data-binary") + 1])).content, /failureClass=boot-held recoveryStatus=demo-stopped/);
      assert.equal(fs.existsSync(box.marker), false);
    });
    scenario("a deployment marker stops the boot", (box) => {
      fs.writeFileSync(box.marker, "");
      assertRefused(boot(box), 4, "boot-marker-present");
    });
    scenario("an uncertain recorded release stops the boot", (box) => {
      const state = readJson(path.join(box.deployRoot, "state", "current.json"));
      writePrivate(path.join(box.deployRoot, "state", "current.json"), JSON.stringify({ ...state, deployment: { releaseEnv: "/etc/passwd" } }));
      assertRefused(boot(box), 5, "boot-release-uncertain");
    });
    scenario("a missing database stops the boot and creates no substitute", (box) => {
      fs.rmSync(path.join(box.volume, "longtail-forge.db"));
      const result = boot(box);
      assertRefused(result, 7, "boot-storage-failed");
      assert.deepEqual(fs.readdirSync(box.volume).sort(), ["files"], "the boot must not create a database");
    });
    scenario("an image missing from the local cache stops the boot, which never pulls", (box) => {
      const result = boot(box);
      assertRefused(result, 7, "boot-storage-failed");
      assert.equal(result.calls.filter((call) => call.tool === "docker" && call.args[0] === "pull").length, 0);
    }, { imageMissing: true });
    scenario("an active reset marker in the data volume stops the boot", (box) => {
      fs.writeFileSync(path.join(box.volume, ".longtail-public-demo-reset-active.json"), "{}");
      assertRefused(boot(box), 4, "boot-marker-present");
    });
    scenario("Docker that never becomes available stops the boot after its bounded wait", (box) => {
      const result = boot(box);
      assertRefused(result, 6, "boot-dependency-unavailable");
      const waits = readJsonLines(path.join(box.deployRoot, "demo-boot-operations", bootOperation(box), "dependencies.jsonl"));
      assert.equal(waits[0].dependency, "docker");
      assert.equal(waits[0].outcome, "unavailable");
      assert.ok(Number(waits[0].attempts) >= 30, `the wait must retry within its bound, not ${waits[0].attempts} times`);
    }, { dockerDown: true });
    scenario("a scanner that never answers stops the boot before isolation or start", (box) => {
      assertRefused(boot(box), 6, "boot-dependency-unavailable");
    }, { scannerAfter: null });
    scenario("a start that does not become healthy keeps the curtain up", (box) => {
      const result = boot(box);
      assert.equal(result.status, 9, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-start-failed");
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { health: "unhealthy" });

    // The complete resolved profile is checked before anything starts.
    /** @param {Sandbox} box */
    const assertProfileRefused = (box) => {
      const result = boot(box);
      assertRefused(result, 11, "boot-profile-invalid");
      assert.equal(result.calls.filter((call) => call.tool === "ip").length, 0, "the profile must be refused before the dependency waits");
      assert.match(fs.readFileSync(path.join(bootDirectory(box), "profile-check.err"), "utf8"), /not the exact isolated public demo/);
    };
    scenario("an extra network stops the boot before anything starts", assertProfileRefused, { profile: { extraNetwork: true } });
    scenario("another data volume stops the boot before anything starts", assertProfileRefused, { profile: { dataVolume: "longtail-forge-other-data" } });
    scenario("an image other than the recorded release stops the boot before anything starts", assertProfileRefused, { profile: { image: IMAGE.replace(/a{64}$/, "b".repeat(64)) } });
    scenario("a volume subpath stops the boot before anything starts", assertProfileRefused, { profile: { subpath: true } });
    scenario("a secret mount stops the boot before anything starts", assertProfileRefused, { profile: { secretMount: true } });
    scenario("inherited mounts stop the boot before anything starts", assertProfileRefused, { profile: { volumesFrom: true } });
    scenario("the boot and the reset carry the same profile program and environment-file parser", () => {
      const boot = fs.readFileSync(helpers.boot, "utf8");
      const reset = fs.readFileSync(helpers.reset, "utf8");
      for (const shared of SHARED_BLOCKS) {
        assert.equal(sharedBlock(reset, shared), sharedBlock(boot, shared), `${shared.label} must be identical in both helpers`);
      }
    });
    scenario("a container that fails its post-start isolation check is stopped again, behind the curtain", (box) => {
      const result = boot(box);
      assert.equal(result.status, 9, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-start-failed");
      const started = result.calls.findIndex((call) => call.tool === "docker" && call.args.includes("up"));
      const stopped = result.calls.findIndex((call) => call.tool === "docker" && call.args.includes("stop"));
      assert.ok(started >= 0 && stopped > started, "the unverified container must be stopped after its start");
      assert.equal(readJson(path.join(box.state, "runtime.json")).running, false, "nothing may be left running");
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { isolationCheckFails: true });
    scenario("a stop that leaves the unverified container running is escalated to a kill", (box) => {
      const result = boot(box);
      assert.equal(result.status, 9, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-start-failed");
      assert.equal(result.calls.filter((call) => call.tool === "docker" && call.args.includes("kill")).length, 1, "the boot must kill what a stop left running");
      assert.equal(readJson(path.join(box.state, "runtime.json")).running, false, "nothing may be left running");
      assert.ok(fs.existsSync(box.marker));
    }, { isolationCheckFails: true, stopFails: "silent" });
    scenario("an unverified container that cannot be stopped raises its own alert, behind the curtain", (box) => {
      const result = boot(box);
      assert.equal(result.status, 12, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-stop-failed");
      assert.match(only(result.calls, "logger").args.join(" "), /failureClass=boot-stop-failed recoveryStatus=unverified-container-not-stopped exitCode=12/);
      assert.match(fs.readFileSync(path.join(bootDirectory(box), "stop-unverified.err"), "utf8"), /not proved stopped; killing it/);
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { isolationCheckFails: true, stopFails: "error", killFails: true });
    scenario("a failed state query after the stop is never taken as a stop, and is escalated to a kill", (box) => {
      const result = boot(box);
      assert.equal(result.status, 12, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-stop-failed");
      assert.equal(result.calls.filter((call) => call.tool === "docker" && call.args.includes("kill")).length, 1, "an unproved stop must be escalated to a kill");
      assert.match(fs.readFileSync(path.join(bootDirectory(box), "stop-unverified.err"), "utf8"), /could not be proved stopped/);
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { isolationCheckFails: true, stateQuery: "fails" });
    scenario("a failed state query after the kill is never taken as a stop", (box) => {
      const result = boot(box);
      assert.equal(result.status, 12, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-stop-failed");
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { isolationCheckFails: true, stopFails: "silent", stateQuery: "fails-after-kill" });
    scenario("a kill that never returns reaches its deadline, and the stop alert is raised", (box) => {
      const result = boot(box);
      assert.equal(result.status, 12, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-stop-failed");
      assert.equal(result.calls.filter((call) => call.stalled).length, 1, "the kill must have stalled");
      assert.match(fs.readFileSync(path.join(bootDirectory(box), "stop-unverified.err"), "utf8"), /kill failed or reached its deadline/);
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { isolationCheckFails: true, stopFails: "silent", dockerStall: "kill" });
    scenario("a state query that never returns reaches its deadline, and is not taken as a stop", (box) => {
      const result = boot(box);
      assert.equal(result.status, 9, result.stderr);
      assert.equal(result.calls.filter((call) => call.stalled).length, 1, "the first state query must have stalled");
      assert.equal(result.calls.filter((call) => call.tool === "docker" && call.args.includes("kill")).length, 1, "a query that reached its deadline proves nothing, so the stop is escalated");
      assert.equal(readJson(path.join(box.state, "runtime.json")).running, false, "nothing may be left running");
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { isolationCheckFails: true, dockerStall: "first-state-query" });
    scenario("a stalled readiness response is abandoned within the boot's bound, and the start is stopped", (box) => {
      completedReset(box, new Date());
      const result = boot(box);
      assert.equal(result.status, 9, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-start-failed");
      assert.equal(result.calls.filter((call) => call.stalled).length, 1, "the readiness request must have reached the stalled server");
      assert.equal(readJson(path.join(box.state, "runtime.json")).running, false, "nothing may be left running");
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { stall: "/readyz" });

    // Diagnostics reach evidence only redacted, and a Compose parser error never does.
    scenario("a Compose parser error is not kept by the boot, because it can quote a secret", (box) => {
      const result = boot(box);
      assertRefused(result, 11, "boot-profile-invalid");
      const directory = bootDirectory(box);
      assert.match(fs.readFileSync(path.join(directory, "profile-resolve.err"), "utf8"), /did not parse; its output is not kept/);
      for (const text of [readTree(directory), result.stdout, result.stderr]) {
        assert.ok(!text.includes(CANARY) && !text.includes("Invalid template"), "no part of the parser's output may be kept");
      }
    }, { configCanary: true });
    scenario("a check's diagnostics are redacted before they are kept, including every secret Compose and the role file hold", (box) => {
      const result = boot(box);
      assertRefused(result, 7, "boot-storage-failed");
      const directory = bootDirectory(box);
      assert.match(fs.readFileSync(path.join(directory, "storage-check.err"), "utf8"), /registry credentials \[redacted\] \[redacted\] \[redacted\] were refused/);
      for (const secret of [CANARY, ROLE_CANARY, HOST_CANARY]) {
        assert.ok(!readTree(directory).includes(secret), "a secret value must never reach the boot's evidence");
      }
    }, { imageInspectCanary: true });
    scenario("missing role credentials stop the boot before anything starts, because its redaction would be incomplete", (box) => {
      const result = boot(box);
      assertRefused(result, 11, "boot-profile-invalid");
      assert.match(fs.readFileSync(path.join(bootDirectory(box), "profile-resolve.err"), "utf8"), /role credentials must be a regular non-symbolic-link file/);
    }, { roleCredentials: "missing" });

    // Boot success paths.
    scenario("a boot with no missed boundary waits for its dependencies, isolates before starting, and lifts the curtain", (box) => {
      completedReset(box, new Date());
      const result = boot(box);
      assert.equal(result.status, 0, result.stderr);
      const outcome = JSON.parse(lastLine(result.stdout));
      assert.deepEqual([outcome.ok, outcome.baseline, outcome.heartbeatOutcome], [true, "not-required", "not-configured"]);
      const up = only(result.calls, "docker", (call) => call.args.includes("up"));
      assert.deepEqual([up.isolationEnforced, up.markerPresent], [true, true], "isolation and the curtain must precede the start");
      assert.deepEqual(up.args.slice(up.args.indexOf("--pull"), up.args.indexOf("--pull") + 2), ["--pull", "never"], "the boot must never pull");
      assert.equal(result.calls.filter((call) => call.tool === "reset").length, 0);
      assert.equal(fs.existsSync(box.marker), false, "the curtain must be lifted");
      const waits = readJsonLines(path.join(box.deployRoot, "demo-boot-operations", bootOperation(box), "dependencies.jsonl"));
      assert.deepEqual(waits.map((wait) => [wait.dependency, wait.outcome, Number(wait.attempts) > 1]), [["docker", "available", false], ["bridge", "available", true], ["scanner", "available", true]]);
    }, { bridgeAfter: 2, scannerAfter: 3 });
    scenario("a missed boundary runs a fresh reset that inherits the boot's lifecycle lock", (box) => {
      completedReset(box, new Date(Date.now() - 3 * 3_600_000));
      writeFixed(FIXED.heartbeat, `${HEARTBEAT_URL}\n`);
      const result = boot(box);
      assert.equal(result.status, 0, result.stderr);
      const outcome = JSON.parse(lastLine(result.stdout));
      assert.deepEqual([outcome.baseline, outcome.heartbeatOutcome], ["fresh-baseline", "delivered"]);
      assert.equal(String(only(result.calls, "curl", (call) => call.args.includes("--config")).stdin), `url = "${HEARTBEAT_URL}"\n`, "the boot's heartbeat must reach the push monitor");
      const reset = only(result.calls, "reset");
      assert.equal(reset.lockInherited, true, "the reset must run under the boot's own hold on the lock");
      assert.equal(reset.markerPresent, true, "the fresh reset runs behind the curtain");
      assert.match(reset.args.join(" "), /--operation-id \d{8}T\d{6}Z-boot-\d+ --caller boot /, "the reset must run as the boot's delegate");
      assert.equal(fs.existsSync(box.marker), false, "the boot lifts its own curtain after the fresh baseline");
    });
    scenario("a failed fresh reset stops the boot with its own alert", (box) => {
      const result = boot(box);
      assert.equal(result.status, 10, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-reset-failed");
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { resetExit: 1 });
    scenario("a failed fresh reset that lifted the curtain still leaves it up, and serves nobody", (box) => {
      const result = boot(box);
      assert.equal(result.status, 10, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).failureClass, "boot-reset-failed");
      assert.ok(fs.existsSync(box.marker), "the boot must put its curtain back");
      assert.match(only(result.calls, "logger").args.join(" "), /recoveryStatus=prior-unit-healthy-curtain-retained exitCode=10/);
    }, { resetExit: 1, resetFailure: "recovered", resetRemovesMarker: true });

    // The scheduler and the reset honour the hold.
    scenario("the scheduler records a held run, without a reset or an alert", (box) => {
      writeFixed(FIXED.hold, "");
      writeSchedulerEnv(box, fakeBin);
      const result = runHelper(box, helpers.scheduler, ["run", "--trigger", "scheduled"]);
      assert.equal(result.status, 0, result.stderr);
      const log = readJsonLines(path.join(box.root, "log", "public-demo-reset.jsonl"));
      assert.equal(log.at(-1)?.outcome, "skipped-held");
      assert.equal(result.calls.filter((call) => ["reset", "logger", "curl"].includes(call.tool)).length, 0);
    });
    scenario("the scheduler sends the heartbeat after a successful reset, and records it", (box) => {
      writeFixed(FIXED.heartbeat, `${HEARTBEAT_URL}\n`);
      writeSchedulerEnv(box, fakeBin);
      const result = runHelper(box, helpers.scheduler, ["run", "--trigger", "scheduled"]);
      assert.equal(result.status, 0, result.stderr);
      const finished = readJsonLines(path.join(box.root, "log", "public-demo-reset.jsonl")).at(-1);
      assert.deepEqual([finished?.outcome, finished?.heartbeatOutcome, finished?.retentionStatus, finished?.failureClass], ["succeeded", "delivered", "pruned", null]);
      assert.equal(String(only(result.calls, "curl").stdin), `url = "${HEARTBEAT_URL}"\n`, "the heartbeat must reach the push monitor, not only be recorded");
      assert.equal(result.calls.filter((call) => call.tool === "logger").length, 0, "a reset whose retention passed raises no alert");
    }, { resetRetention: "pruned" });
    scenario("the scheduler records a retention failure as a succeeded reset, with its alert and heartbeat", (box) => {
      writeFixed(FIXED.webhook, `${WEBHOOK_URL}\n`);
      writeFixed(FIXED.heartbeat, `${HEARTBEAT_URL}\n`);
      writeSchedulerEnv(box, fakeBin);
      const result = runHelper(box, helpers.scheduler, ["run", "--trigger", "scheduled"]);
      assert.equal(result.status, 0, result.stderr);
      const finished = readJsonLines(path.join(box.root, "log", "public-demo-reset.jsonl")).at(-1);
      assert.deepEqual(
        [finished?.outcome, finished?.health, finished?.failureClass, finished?.retentionStatus, finished?.alertOutcome, finished?.heartbeatOutcome],
        ["succeeded", "healthy", "retention-failed", "capped", "delivered", "delivered"],
      );
      assert.match(only(result.calls, "logger").args.join(" "), /failureClass=retention-failed recoveryStatus=not-required exitCode=0$/);
    }, { resetRetention: "capped" });
    scenario("the reset helper refuses under a hold before any Docker call", (box) => {
      writeFixed(FIXED.hold, "");
      const result = reset(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /an operator hold is in place/);
      assert.equal(result.calls.filter((call) => call.tool === "docker").length, 0);
    });
    scenario("the scheduler records a recovery behind the retained curtain", (box) => {
      writeSchedulerEnv(box, fakeBin);
      const result = runHelper(box, helpers.scheduler, ["run", "--trigger", "scheduled"]);
      const finished = readJsonLines(path.join(box.root, "log", "public-demo-reset.jsonl")).at(-1);
      assert.deepEqual([finished?.failureClass, finished?.recoveryStatus, finished?.rollbackStatus], ["reset-failed-recovered", "prior-unit-healthy-curtain-retained", "prior-unit-restored"]);
      assert.match(only(result.calls, "logger").args.join(" "), /recoveryStatus=prior-unit-healthy-curtain-retained /);
    }, { resetExit: 1, resetFailure: "recovered-curtained" });

    // The real reset, end to end, owning or not owning the curtain.
    /** @param {Sandbox} box */
    const resetDirectory = (box) => {
      const root = path.join(box.deployRoot, "demo-reset-operations");
      return path.join(root, fs.readdirSync(root).sort().at(-1) || "");
    };
    /** @param {Sandbox} box */
    const resetState = (box) => readJson(path.join(resetDirectory(box), "state.json"));
    scenario("a standalone reset lifts the curtain once its fresh baseline passes, with every runtime check bounded", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.existsSync(box.marker), false, "a standalone reset lifts its own curtain");
      const checks = result.calls.filter((call) => call.tool === "curl" && call.args.some((arg) => /\/(healthz|readyz|api\/app-info)$/.test(arg)));
      assert.ok(checks.length >= 6 && checks.every((call) => call.args.includes("--max-time")), "every runtime check must carry a time limit");
      assert.ok(publicCalls(result.calls).length >= 3, "a standalone reset still proves the public edge");
      assert.deepEqual([resetState(box).phase, JSON.parse(lastLine(result.stdout)).appStartedByReset], ["completed", false]);
    }, { running: true });
    scenario("a boot-delegated reset leaves the curtain to the boot, and never asks the public edge", (box) => {
      fs.writeFileSync(box.marker, "");
      const result = reset(box, ["--caller", "boot"]);
      assert.equal(result.status, 0, result.stderr);
      assert.ok(fs.existsSync(box.marker), "the boot lifts its own curtain");
      assert.equal(publicCalls(result.calls).length, 0);
      assert.equal(JSON.parse(lastLine(result.stdout)).retention.status, "pruned");
      assert.deepEqual(prunes(result.calls), [
        { markerPresent: true, arguments: ["--mode", "plan"] },
        { markerPresent: true, arguments: ["--mode", "apply", "--max-removals", "3"] },
      ], "the boot's delegate prunes too, behind the boot's curtain, within the cap");
    }, { running: true });
    scenario("a boot-delegated reset that fails verification restores the prior unit behind the boot's curtain", (box) => {
      fs.writeFileSync(box.marker, "");
      const result = reset(box, ["--caller", "boot"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /prior unit was restored and verified behind the retained maintenance curtain/);
      assert.ok(fs.existsSync(box.marker), "a failed fresh reset must never serve the prior unit");
      assert.deepEqual([resetState(box).phase, resetState(box).outcome], ["recovered", "prior-unit-healthy-curtain-retained"]);
    }, { running: true, identityFailCalls: [1] });
    scenario("a standalone reset that fails verification lifts the curtain on the restored prior unit", (box) => {
      const result = reset(box);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /reset failed; prior unit was restored and verified\n/);
      assert.equal(fs.existsSync(box.marker), false);
    }, { running: true, identityFailCalls: [1] });
    scenario("a boot-delegated reset ignores a failing public edge", (box) => {
      fs.writeFileSync(box.marker, "");
      const result = reset(box, ["--caller", "boot"]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(publicCalls(result.calls).length, 0);
    }, { running: true, publicFails: true });
    scenario("a boot-delegated reset refuses to run without the boot's curtain", (box) => {
      const result = reset(box, ["--caller", "boot"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /requires the boot's curtain/);
      assert.equal(result.calls.filter((call) => call.tool === "docker").length, 0);
    }, { running: true });
    scenario("a reset that starts a stopped app keeps the curtain up until its fresh baseline passes", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      const build = only(result.calls, "docker", (call) => call.args.includes("scripts/public-demo-baseline-candidate.mjs") && call.args.includes("build"));
      assert.equal(build.markerPresent, true, "the candidate is built behind the curtain the start raised");
      assert.equal(fs.existsSync(box.marker), false, "the fresh baseline lifts the curtain");
      assert.equal(JSON.parse(lastLine(result.stdout)).appStartedByReset, true);
    }, { running: false });
    scenario("a reset that started a stopped app restores the prior unit behind its curtain", (box) => {
      const result = reset(box);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /prior unit was restored and verified behind the retained maintenance curtain/);
      assert.ok(fs.existsSync(box.marker), "the stale unit the reset started must not be served");
    }, { running: false, identityFailCalls: [2] });
    scenario("a reset that fails after starting a stopped app keeps the curtain up", (box) => {
      const result = reset(box);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /reset failed after it started the stopped app; maintenance curtain and protected evidence remain/);
      assert.ok(fs.existsSync(box.marker));
      assert.deepEqual([resetState(box).phase, resetState(box).outcome], ["failed", "maintenance-curtain-retained"]);
    }, { running: false, candidateBuildFails: true });
    scenario("the reset refuses a volume subpath before it starts or stops anything", (box) => {
      const result = reset(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /not the exact production public demo/);
      assert.equal(result.calls.filter((call) => call.tool === "docker" && ["up", "stop", "run", "kill"].some((verb) => call.args.includes(verb))).length, 0);
    }, { running: true, profile: { subpath: true } });
    scenario("a reset step's diagnostics are redacted, including every secret Compose and the role file hold", (box) => {
      const result = reset(box);
      assert.notEqual(result.status, 0);
      const evidence = path.join(box.deployRoot, "demo-reset-operations");
      const operation = fs.readdirSync(evidence).sort().at(-1) || "";
      assert.match(fs.readFileSync(path.join(evidence, operation, "step-candidate-build.err"), "utf8"), /credentials \[redacted\] \[redacted\] \[redacted\] were refused/);
      for (const text of [readTree(evidence), result.stdout, result.stderr]) {
        for (const secret of [CANARY, ROLE_CANARY, HOST_CANARY]) assert.ok(!text.includes(secret), "a secret value must never reach the reset's evidence or output");
      }
    }, { running: true, candidateBuildCanary: true });
    scenario("a recovery step's diagnostics are redacted, and the session material is removed only after recovery", (box) => {
      const sessions = () => fs.readdirSync("/run").filter((name) => name.startsWith("longtail-forge-public-demo-reset."));
      const before = sessions();
      const result = reset(box);
      const left = sessions().filter((name) => !before.includes(name));
      for (const name of left) fs.rmSync(path.join("/run", name), { recursive: true, force: true });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /reset failed; prior unit was restored and verified\n/);
      assert.match(fs.readFileSync(path.join(resetDirectory(box), "step-recovery-stop.err"), "utf8"), /credentials \[redacted\] \[redacted\] \[redacted\] were refused/);
      for (const text of [readTree(path.join(box.deployRoot, "demo-reset-operations")), result.stdout, result.stderr]) {
        for (const secret of [CANARY, ROLE_CANARY, HOST_CANARY]) assert.ok(!text.includes(secret), "a secret value must never reach the recovery's evidence or output");
      }
      assert.deepEqual(left, [], "the session material must be removed once recovery is over");
    }, { running: true, identityFailCalls: [1], stopCanary: true });
    scenario("a reset whose state query fails never backs up, activates, or recovers, and keeps the curtain up", (box) => {
      const result = reset(box);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /reset and automatic recovery failed/);
      const replacing = result.calls.filter((call) => call.tool === "docker" && ["scripts/backup.mjs", "activate", "recover"].some((arg) => call.args.includes(arg)));
      assert.equal(replacing.length, 0, "nothing may be backed up, activated, or recovered without a proved stop");
      assert.match(fs.readFileSync(path.join(resetDirectory(box), "step-stop.err"), "utf8"), /not proved stopped/);
      assert.deepEqual([resetState(box).phase, resetState(box).outcome], ["unrecovered", "maintenance-curtain-retained"]);
      assert.ok(fs.existsSync(box.marker), "the curtain must stay up");
    }, { running: true, stateQuery: "fails" });
    scenario("a reset without any role password refuses before any Docker call", (box) => {
      const result = reset(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /role passwords could not be collected/);
      assert.equal(result.calls.filter((call) => call.tool === "docker").length, 0);
    }, { running: true, roleCredentials: "empty" });
    scenario("a stalled role proof is abandoned within the reset's bound, and the prior unit is restored", (box) => {
      const result = reset(box);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /reset failed; prior unit was restored and verified\n/);
      assert.equal(result.calls.filter((call) => call.stalled).length, 1, "the role proof must have reached the stalled server");
    }, { running: true, stall: "/api/csrf-token" });
    scenario("the reset keeps no Compose parser output, because it can quote a secret", (box) => {
      const result = reset(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /did not parse; its output is not kept/);
      for (const text of [readTree(path.join(box.deployRoot, "demo-reset-operations")), result.stdout, result.stderr]) {
        assert.ok(!text.includes(CANARY) && !text.includes("Invalid template"), "no part of the parser's output may be kept");
      }
    }, { running: true, configCanary: true });
    scenario("the reset keeps no visitor-entered content in its evidence", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(readJson(path.join(resetDirectory(box), "pre-reset-login.json")), { httpStatus: "200" });
      assert.ok(!readTree(resetDirectory(box)).includes(VISITOR_CANARY), "the shared account's profile, as a visitor left it, must not be kept");
    }, { running: true });

    // Retention of the reset history: the automatic step, and the supervised plan and apply.
    /** @param {Sandbox} box */
    const retentionRecords = (box) => readTree(path.join(box.deployRoot, "demo-retention-operations"));
    /** The roots retention reads, so a scenario can prove that a run left each as it was. @param {Sandbox} box */
    const rootMetadata = (box) => [box.deployRoot, ...["state", "releases", "demo-reset-operations"].map((name) => path.join(box.deployRoot, name))]
      .map((root) => {
        const stat = fs.lstatSync(root);
        return { root, mode: stat.mode, uid: stat.uid, gid: stat.gid };
      });
    /** Gives the roots modes that every check accepts but no reset sets, so a run that normalizes them shows. @param {Sandbox} box */
    const loosenRoots = (box) => {
      fs.chmodSync(box.deployRoot, 0o755);
      for (const name of ["state", "releases", "demo-reset-operations"]) fs.chmodSync(path.join(box.deployRoot, name), 0o750);
    };
    /** The steps a reset began, in order. @param {Sandbox} box */
    const stepNames = (box) => readJsonLines(path.join(resetDirectory(box), "steps.jsonl")).map((entry) => String(entry.step));
    /** @param {Sandbox} box */
    const retentionEvidenceExists = (box) => fs.existsSync(path.join(box.deployRoot, "demo-retention-operations"));
    scenario("a completed reset prunes its history automatically, after the curtain lifts, within its cap", (box) => {
      const history = Array.from({ length: 168 }, (_, hour) => historyId(box, hour));
      seedHistory(box, history.map((id, hour) => ({ id, backup: hour >= 166, sidecar: hour >= 166 })));
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(lastLine(result.stdout)).retention, { status: "pruned", units: 1, backups: 1, evidence: 1 });
      assert.ok(!evidenceExists(box, history[0]) && evidenceExists(box, history[1]), "only the evidence beyond the 168 newest resets goes");
      assert.ok(!backupExists(history[166]) && !sidecarExists(history[166]), "the third-newest backup and its sidecar go");
      assert.ok(backupExists(history[167]) && sidecarExists(history[167]), "the newest earlier backup stays beside this reset's own");
      assert.deepEqual(prunes(result.calls), [
        { markerPresent: false, arguments: ["--mode", "plan"] },
        { markerPresent: false, arguments: ["--mode", "apply", "--max-removals", "3"] },
      ], "retention runs once the curtain is down, and caps the in-volume prune");
      assert.equal(readJson(path.join(resetDirectory(box), "retention.json")).mode, "automatic");
      assert.equal(fs.existsSync(box.marker), false);
    }, { running: true });
    scenario("the automatic step removes nothing beyond its cap, and the reset still succeeds", (box) => {
      const history = Array.from({ length: 6 }, (_, hour) => historyId(box, hour));
      seedHistory(box, history.map((id) => ({ id })));
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).retention.status, "capped");
      for (const id of history) assert.ok(backupExists(id) && sidecarExists(id) && evidenceExists(box, id), `${id} must stay`);
      assert.deepEqual(prunes(result.calls).map((call) => call.arguments[1]), ["plan"], "a capped step never applies the in-volume prune");
      assert.equal(fs.existsSync(box.marker), false);
    }, { running: true });
    scenario("the automatic step removes nothing when the in-volume selection exceeds its cap", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).retention.status, "capped");
      assert.deepEqual(prunes(result.calls).map((call) => call.arguments[1]), ["plan"]);
    }, { running: true, unitsToPrune: 4 });
    scenario("a failed retention step never fails the completed reset", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(lastLine(result.stdout)).retention, { status: "failed" });
      assert.deepEqual([resetState(box).phase, resetState(box).outcome], ["completed", "baseline-healthy"]);
      assert.equal(fs.existsSync(box.marker), false);
      assert.match(fs.readFileSync(path.join(resetDirectory(box), "step-retention.err"), "utf8"), /unexpected shape; nothing was removed/);
    }, { running: true, pruneFails: true });
    scenario("retention plan reports the selection and changes nothing", (box) => {
      const history = Array.from({ length: 6 }, (_, hour) => historyId(box, hour));
      seedHistory(box, history.map((id) => ({ id })));
      const before = historySnapshot(box);
      const result = retention(box, "plan");
      assert.equal(result.status, 0, result.stderr);
      const summary = JSON.parse(lastLine(result.stdout));
      assert.deepEqual([summary.status, summary.units.selected, summary.backups.selected, summary.evidence.selected, summary.backups.removed],
        ["planned", 1, 4, 0, 0]);
      assert.deepEqual(historySnapshot(box), before, "a plan must change nothing");
      assert.deepEqual(prunes(result.calls).map((call) => call.arguments), [["--mode", "plan"]]);
      assert.deepEqual(isolationModes(result.calls), ["check"], "a plan checks the firewall and never rebuilds it");
    });
    scenario("retention apply keeps the newest backups and seven days of evidence, and leaves incidents, other backups, and orphans", (box) => {
      const completed = Array.from({ length: 171 }, (_, hour) => historyId(box, hour));
      const incident = historyId(box, 171);
      seedHistory(box, [...completed.map((id) => ({ id })), { id: incident, phase: "recovering" }]);
      // An archive already gone, its sidecar left behind; an orphaned archive; and a deployment backup.
      fs.rmSync(path.join(BACKUP_ROOT, `pre-demo-reset-${completed[3]}.ltfbackup.tgz`));
      const orphan = historyId(box, 900);
      writeBackup(`pre-demo-reset-${orphan}.ltfbackup.tgz`);
      const deployBackup = writeBackup(`pre-upgrade-${historyId(box, 901)}.ltfbackup.tgz`);
      const result = applyRetention(box);
      assert.equal(result.status, 0, result.stderr);
      const summary = JSON.parse(lastLine(result.stdout));
      assert.deepEqual([summary.status, summary.backups.removed, summary.evidence.removed, summary.evidence.incident], ["pruned", 169, 3, 1]);
      assert.ok(summary.backups.orphans >= 1, "an orphaned backup is reported");
      for (const id of completed.slice(169)) assert.ok(backupExists(id) && sidecarExists(id), `${id} is among the two newest completed resets`);
      for (const id of completed.slice(0, 169)) assert.ok(!backupExists(id) && !sidecarExists(id), `${id}'s backup must go`);
      for (const id of completed.slice(3)) assert.ok(evidenceExists(box, id), `${id} is within the 168 newest`);
      for (const id of completed.slice(0, 3)) assert.ok(!evidenceExists(box, id), `${id} is beyond the 168 newest`);
      assert.ok(evidenceExists(box, incident) && backupExists(incident) && sidecarExists(incident), "incident evidence and its backup stay");
      assert.ok(backupExists(orphan) && fs.existsSync(deployBackup), "orphaned and deployment backups stay");
      assert.deepEqual(historySnapshot(box).evidence.filter((name) => name.startsWith(".pruning-")), []);
      assert.deepEqual(prunes(result.calls).map((call) => call.arguments), [["--mode", "plan"], ["--mode", "apply"]], "a supervised apply is uncapped");
      assert.match(retentionRecords(box), /"mode": "apply"/);
      assert.deepEqual(isolationModes(result.calls), ["check"], "an apply checks the firewall and never rebuilds it");
    }, { unitsToPrune: 5 });
    scenario("retention apply refuses without its exact confirmation, before any Docker call", (box) => {
      const result = retention(box, "apply");
      assert.equal(result.status, 1);
      assert.match(result.stderr, /exact retention confirmation is required/);
      assert.equal(result.calls.filter((call) => call.tool === "docker").length, 0);
    });
    scenario("retention refuses evidence holding a link, and removes nothing", (box) => {
      const history = Array.from({ length: 170 }, (_, hour) => historyId(box, hour));
      seedHistory(box, history.map((id) => ({ id })));
      fs.symlinkSync("/etc/hostname", path.join(box.deployRoot, "demo-reset-operations", history[0], "linked"));
      const before = historySnapshot(box);
      const result = applyRetention(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /retention apply failed/);
      assert.match(retentionRecords(box), /not a root-owned directory free of links; nothing was removed/);
      assert.deepEqual(historySnapshot(box), before);
      assert.deepEqual(prunes(result.calls).map((call) => call.arguments[1]), ["plan"]);
    });
    scenario("retention refuses a backup the container user does not own, and removes nothing", (box) => {
      const history = Array.from({ length: 4 }, (_, hour) => historyId(box, hour));
      seedHistory(box, history.map((id) => ({ id })));
      fs.chownSync(path.join(BACKUP_ROOT, `pre-demo-reset-${history[0]}.ltfbackup.tgz`), 0, 0);
      const before = historySnapshot(box);
      const result = applyRetention(box);
      assert.equal(result.status, 1);
      assert.match(retentionRecords(box), /not a plain file owned by the backup root owner; nothing was removed/);
      assert.deepEqual(historySnapshot(box), before);
    });
    scenario("retention finishes an evidence tombstone an interrupted run left", (box) => {
      seedHistory(box, [{ id: historyId(box, 0) }]);
      const tombstone = path.join(box.deployRoot, "demo-reset-operations", `.pruning-${historyId(box, 1)}`);
      fs.mkdirSync(tombstone, { mode: 0o700 });
      writePrivate(path.join(tombstone, "state.json"), "{}");
      const result = applyRetention(box);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(fs.existsSync(tombstone), false);
      assert.ok(evidenceExists(box, historyId(box, 0)));
    });
    scenario("retention waits for the lifecycle lock, and changes nothing while another operation holds it", (box) => {
      const history = Array.from({ length: 4 }, (_, hour) => historyId(box, hour));
      seedHistory(box, history.map((id) => ({ id })));
      loosenRoots(box);
      const roots = rootMetadata(box);
      const lock = path.join(box.deployRoot, "compose-operation.lock");
      const holder = spawn("flock", [lock, "sleep", "30"], { stdio: "ignore", detached: true });
      try {
        const deadline = Date.now() + 10_000;
        while (spawnSync("flock", ["-n", lock, "true"]).status === 0) {
          assert.ok(Date.now() < deadline, "the harness must come to hold the lock");
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
        }
        const before = historySnapshot(box);
        const result = applyRetention(box);
        assert.equal(result.status, 75, result.stderr);
        assert.match(result.stderr, /holds the host lock/);
        assert.deepEqual(historySnapshot(box), before);
        assert.equal(result.calls.filter((call) => call.tool === "docker").length, 0);
        assert.deepEqual(rootMetadata(box), roots, "a run that cannot lock changes no root");
        assert.equal(retentionEvidenceExists(box), false, "a run that cannot lock creates no evidence");
      } finally {
        if (holder.pid) process.kill(-holder.pid, "SIGKILL");
      }
    });
    scenario("retention refuses when its history listing fails, and removes nothing", (box) => {
      seedHistory(box, Array.from({ length: 6 }, (_, hour) => ({ id: historyId(box, hour) })));
      const before = historySnapshot(box);
      const result = applyRetention(box);
      assert.equal(result.status, 1);
      assert.match(retentionRecords(box), /the reset history could not be listed; nothing was removed/);
      assert.deepEqual(historySnapshot(box), before);
      assert.deepEqual(prunes(result.calls).map((call) => call.arguments[1]), ["plan"], "a failed listing stops the in-volume apply too");
    }, { findFails: "history" });
    scenario("retention refuses when an evidence traversal fails, and removes nothing", (box) => {
      seedHistory(box, Array.from({ length: 170 }, (_, hour) => ({ id: historyId(box, hour) })));
      const before = historySnapshot(box);
      const result = applyRetention(box);
      assert.equal(result.status, 1);
      assert.match(retentionRecords(box), /not a root-owned directory free of links; nothing was removed/);
      assert.deepEqual(historySnapshot(box), before);
      assert.deepEqual(prunes(result.calls).map((call) => call.arguments[1]), ["plan"]);
    }, { findFails: "evidence" });
    scenario("retention refuses when its backup listing fails, and removes nothing", (box) => {
      seedHistory(box, Array.from({ length: 4 }, (_, hour) => ({ id: historyId(box, hour) })));
      const before = historySnapshot(box);
      const result = applyRetention(box);
      assert.equal(result.status, 1);
      assert.match(retentionRecords(box), /the backup root could not be listed; nothing was removed/);
      assert.deepEqual(historySnapshot(box), before);
      assert.deepEqual(prunes(result.calls).map((call) => call.arguments[1]), ["plan"]);
    }, { findFails: "backups" });
    scenario("retention refuses a reset history root that is a link before it writes anything, and leaves the link's target as it was", (box) => {
      seedHistory(box, Array.from({ length: 4 }, (_, hour) => ({ id: historyId(box, hour) })));
      const root = path.join(box.deployRoot, "demo-reset-operations");
      const real = path.join(box.deployRoot, "linked-history");
      fs.renameSync(root, real);
      fs.symlinkSync(real, root);
      fs.chmodSync(real, 0o750);
      const target = () => ({ entries: fs.readdirSync(real).sort(), mode: fs.statSync(real).mode, uid: fs.statSync(real).uid });
      const before = target();
      const result = retention(box, "plan");
      assert.equal(result.status, 1);
      assert.match(result.stderr, /reset history root must be a real directory/);
      assert.deepEqual(target(), before, "nothing may follow the link");
      assert.equal(retentionEvidenceExists(box), false, "a refused run creates no evidence");
      assert.deepEqual(prunes(result.calls), [], "nothing runs in the volume");
    });
    scenario("retention refuses a reset history root another user owns before it writes anything, and leaves its owner", (box) => {
      seedHistory(box, Array.from({ length: 4 }, (_, hour) => ({ id: historyId(box, hour) })));
      const root = path.join(box.deployRoot, "demo-reset-operations");
      fs.chownSync(root, CONTAINER_UID, CONTAINER_UID);
      const before = historySnapshot(box);
      const result = retention(box, "plan");
      assert.equal(result.status, 1);
      assert.match(result.stderr, /reset history root must be root-owned/);
      assert.equal(fs.statSync(root).uid, CONTAINER_UID, "a refused run changes no owner");
      assert.equal(retentionEvidenceExists(box), false, "a refused run creates no evidence");
      assert.deepEqual(historySnapshot(box), before);
      assert.deepEqual(prunes(result.calls), []);
    });
    scenario("retention leaves every root it checks as it found it, in plan and apply", (box) => {
      seedHistory(box, Array.from({ length: 6 }, (_, hour) => ({ id: historyId(box, hour) })));
      loosenRoots(box);
      const roots = rootMetadata(box);
      for (const [mode, run] of /** @type {[string, () => { status: number, stderr: string }][]} */ ([["plan", () => retention(box, "plan")], ["apply", () => applyRetention(box)]])) {
        const result = run();
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(rootMetadata(box), roots, `retention ${mode} must change no root's mode or owner`);
      }
    });
    scenario("the automatic step refuses a reset history root that is a link, and the reset still completes", (box) => {
      seedHistory(box, Array.from({ length: 4 }, (_, hour) => ({ id: historyId(box, hour) })));
      const root = path.join(box.deployRoot, "demo-reset-operations");
      const real = path.join(box.deployRoot, "linked-history");
      fs.renameSync(root, real);
      fs.symlinkSync(real, root);
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(lastLine(result.stdout)).retention, { status: "failed" });
      assert.match(fs.readFileSync(path.join(resetDirectory(box), "step-retention.err"), "utf8"),
        /the reset history root is not a root-owned real directory; nothing was removed/);
    }, { running: true });
    scenario("the automatic step counts evidence tombstones against its cap", (box) => {
      const history = Array.from({ length: 168 }, (_, hour) => historyId(box, hour));
      seedHistory(box, history.map((id) => ({ id, backup: false, sidecar: false })));
      const tombstones = [900, 901, 902].map((hour) => path.join(box.deployRoot, "demo-reset-operations", `.pruning-${historyId(box, hour)}`));
      for (const tombstone of tombstones) {
        fs.mkdirSync(tombstone, { mode: 0o700 });
        writePrivate(path.join(tombstone, "state.json"), "{}");
      }
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).retention.status, "capped", "one evidence directory and three tombstones are four removals");
      assert.ok(tombstones.every((tombstone) => fs.existsSync(tombstone)) && evidenceExists(box, history[0]), "a capped step removes nothing");
    }, { running: true });
    scenario("the automatic step counts in-volume tombstones against its cap", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(lastLine(result.stdout)).retention.status, "capped");
      assert.deepEqual(prunes(result.calls).map((call) => call.arguments[1]), ["plan"]);
    }, { running: true, unitsToPrune: 1, unitTombstones: 3 });
    scenario("the automatic step never removes the reset it belongs to, however its identity ranks", (box) => {
      const history = Array.from({ length: 3 }, (_, hour) => historyId(box, hour));
      seedHistory(box, history.map((id) => ({ id })));
      // An accepted identity older than the history, as a clock set back would give.
      const own = `20250101T000000Z-manual-${path.basename(box.root).replace("box-", "")}`;
      const result = reset(box, ["--operation-id", own]);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(lastLine(result.stdout)).retention, { status: "failed" });
      const evidence = path.join(box.deployRoot, "demo-reset-operations", own);
      assert.ok(fs.existsSync(path.join(evidence, "active-baseline.json")) && backupExists(own), "the reset keeps its own evidence and backup");
      assert.match(fs.readFileSync(path.join(evidence, "step-retention.err"), "utf8"), /the current reset ranks outside the retained history; nothing was removed/);
      for (const id of history) assert.ok(backupExists(id) && evidenceExists(box, id), `${id} must stay`);
    }, { running: true });
    scenario("the automatic step never removes the retired unit of the reset it belongs to", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(lastLine(result.stdout)).retention, { status: "failed" });
      assert.match(fs.readFileSync(path.join(resetDirectory(box), "step-retention.err"), "utf8"), /the current reset ranks among the retired units to remove/);
      assert.deepEqual(prunes(result.calls).map((call) => call.arguments[1]), ["plan"]);
    }, { running: true, pruneSelectsCurrent: true });
    scenario("a signal during retention leaves the completed reset completed, and the reset still reports it", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      const reported = JSON.parse(lastLine(result.stdout));
      assert.deepEqual([reported.ok, reported.appStartedByReset, reported.retention], [true, true, { status: "failed" }]);
      assert.deepEqual([resetState(box).phase, resetState(box).outcome], ["completed", "baseline-healthy"]);
      assert.equal(fs.existsSync(box.marker), false, "the completed reset's curtain stays down");
    }, { running: false, pruneSignals: true });
    scenario("a completed reset whose result cannot be written still records that it completed", (box) => {
      const full = fs.openSync("/dev/full", "w");
      try {
        const result = reset(box, [], { stdout: full });
        assert.notEqual(result.status, 0, "an unwritable result fails the run");
        assert.deepEqual([resetState(box).phase, resetState(box).outcome], ["completed", "baseline-healthy"]);
        assert.equal(fs.existsSync(box.marker), false);
      } finally {
        fs.closeSync(full);
      }
    }, { running: false });
    /** Steps that recover a reset, or run its retention. @param {Sandbox} box */
    const recoveryOrRetention = (box) => stepNames(box).filter((name) => name.startsWith("recovery") || name === "retention");
    scenario("a signal as the curtain lifts leaves the completed reset completed, and its demo serving", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      const reported = JSON.parse(lastLine(result.stdout));
      assert.deepEqual([reported.ok, reported.appStartedByReset, reported.retention], [true, true, { status: "failed" }]);
      assert.deepEqual([resetState(box).phase, resetState(box).outcome], ["completed", "baseline-healthy"]);
      assert.equal(fs.existsSync(box.marker), false, "the curtain stays down");
      assert.deepEqual(recoveryOrRetention(box), [], "nothing recovers the finalized reset, and the signal stops its retention");
    }, { running: false, curtainSignal: true });
    scenario("a signal to the reset while it finalizes lets it complete, and stops only its retention", (box) => {
      const result = reset(box);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(lastLine(result.stdout)).retention, { status: "failed" });
      assert.deepEqual([resetState(box).phase, resetState(box).outcome], ["completed", "baseline-healthy"]);
      assert.equal(fs.existsSync(box.marker), false, "the completed reset lifts its curtain");
      assert.deepEqual(recoveryOrRetention(box), []);
    }, { running: true, finalizeSignals: true });
    scenario("a finalized reset whose curtain cannot be lifted is recorded as finalized, and never recovers", (box) => {
      const result = reset(box);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /deployment marker is not a safe regular file/);
      assert.deepEqual([resetState(box).phase, resetState(box).outcome], ["finalized", ""]);
      assert.deepEqual(recoveryOrRetention(box), [], "nothing may restore the prior unit once the fresh one is final");
      assert.ok(fs.statSync(box.marker).isDirectory(), "the reset leaves what replaced the curtain for the operator");
    }, { running: true, finalizeReplacesMarker: true });
    scenario("retention apply replaces the legacy login records of retained completed resets, and leaves incident evidence its own", (box) => {
      const completed = Array.from({ length: 4 }, (_, hour) => historyId(box, hour));
      const incident = historyId(box, 4);
      seedHistory(box, [...completed.map((id) => ({ id, legacyLogin: true })), { id: incident, phase: "recovering", legacyLogin: true }]);
      const login = (/** @type {string} */ id) => fs.readFileSync(path.join(box.deployRoot, "demo-reset-operations", id, "pre-reset-login.json"), "utf8");
      const plan = retention(box, "plan");
      assert.equal(plan.status, 0, plan.stderr);
      assert.deepEqual(JSON.parse(lastLine(plan.stdout)).evidence.legacyLogins, { found: 4, replaced: 0 });
      for (const id of completed) assert.ok(login(id).includes(VISITOR_CANARY), "a plan changes nothing");
      const result = applyRetention(box);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(lastLine(result.stdout)).evidence.legacyLogins, { found: 4, replaced: 4 });
      for (const id of completed) assert.deepEqual(JSON.parse(login(id)), { httpStatus: "200", legacyBodyRemoved: true });
      assert.ok(login(incident).includes(VISITOR_CANARY), "incident evidence keeps its own record");
      // A replaced record is never found again, and a second apply rewrites none.
      const inodes = () => completed.map((id) => fs.statSync(path.join(box.deployRoot, "demo-reset-operations", id, "pre-reset-login.json")).ino);
      const replaced = inodes();
      const replan = retention(box, "plan");
      assert.equal(replan.status, 0, replan.stderr);
      assert.deepEqual(JSON.parse(lastLine(replan.stdout)).evidence.legacyLogins, { found: 0, replaced: 0 });
      const reapply = applyRetention(box);
      assert.equal(reapply.status, 0, reapply.stderr);
      assert.deepEqual(JSON.parse(lastLine(reapply.stdout)).evidence.legacyLogins, { found: 0, replaced: 0 });
      assert.deepEqual(inodes(), replaced, "a second apply must rewrite no record");
    });
  };

  /** @type {{ label: string, caught: boolean, failed: string[] }[]} */
  const seedResults = [];
  try {
    runScenarios();
    if (outcomes.every((outcome) => outcome.ok)) {
      for (const seed of SEEDS) {
        const source = fs.readFileSync(helpers[seed.helper], "utf8");
        const occurrences = source.split(seed.from).length - 1;
        assert.equal(occurrences, 1, `seed "${seed.label}": its anchor occurs ${occurrences} times`);
        const mutated = path.join(work, `seed-${seedResults.length + 1}-${path.basename(helpers[seed.helper])}`);
        fs.writeFileSync(mutated, source.replace(seed.from, () => seed.to), { mode: 0o755 });
        const original = helpers[seed.helper];
        helpers[seed.helper] = mutated;
        if (seed.helper === "alert") install(mutated, FIXED.installedAlert, 0o755);
        recorded = [];
        quiet = true;
        focus = seed.caughtBy;
        try {
          runScenarios();
        } finally {
          quiet = false;
          focus = "";
          helpers[seed.helper] = original;
          if (seed.helper === "alert") install(original, FIXED.installedAlert, 0o755);
        }
        const failed = recorded.filter((outcome) => !outcome.ok).map((outcome) => outcome.name);
        const caught = failed.some((name) => name.startsWith(seed.caughtBy));
        seedResults.push({ label: seed.label, caught, failed });
        console.log(`${caught ? "CAUGHT  " : "SURVIVED"} seed: ${seed.label}${caught ? "" : ` (failed: ${failed.join("; ") || "nothing"})`}`);
      }
    }
  } finally {
    restoreHost(work, created);
    stallServer.close();
  }

  const failures = outcomes.filter((outcome) => !outcome.ok);
  console.log(`\nPublic-demo helper contract: ${outcomes.length - failures.length}/${outcomes.length} scenarios passed.`);
  for (const failure of failures) console.log(`\n--- ${failure.name}\n${failure.detail}`);
  const survivors = seedResults.filter((seed) => !seed.caught);
  if (failures.length === 0) console.log(`Seeded helper defects: ${seedResults.length - survivors.length}/${SEEDS.length} caught.`);
  if (failures.length > 0 || survivors.length > 0 || seedResults.length !== SEEDS.length) process.exitCode = 1;
}

/**
 * A complete root-owned demo host: helper environment, recorded release, lock, data volume, and
 * curtain directory, all inside the work directory.
 * @param {string} work @param {number} ordinal @param {Scenario} scenario @returns {Sandbox}
 */
function createSandbox(work, ordinal, scenario) {
  const root = path.join(work, `box-${ordinal}`);
  const state = path.join(root, "harness");
  const deployRoot = path.join(root, "deploy");
  const volume = path.join(root, "volume");
  const maintenance = path.join(root, "maintenance");
  for (const [dir, mode] of /** @type {[string, number][]} */ ([
    [root, 0o755], [state, 0o777], [path.join(root, "etc"), 0o755], [path.join(root, "compose"), 0o755], [path.join(root, "secrets"), 0o700],
    [deployRoot, 0o711], [path.join(deployRoot, "state"), 0o700], [path.join(deployRoot, "releases"), 0o700],
    [volume, 0o755], [path.join(volume, "files"), 0o750], [maintenance, 0o711], [path.join(maintenance, "deployment"), 0o711],
    [path.join(root, "log"), 0o700],
  ])) {
    fs.mkdirSync(dir, { recursive: true });
    fs.chmodSync(dir, mode);
  }
  fs.writeFileSync(path.join(volume, "longtail-forge.db"), "SQLite format 3\0");
  fs.chownSync(path.join(volume, "longtail-forge.db"), 10001, 10001);
  fs.chownSync(path.join(volume, "files"), 10001, 10001);
  fs.writeFileSync(path.join(root, "compose", "compose.yaml"), "services: {}\n");
  const releaseEnv = path.join(deployRoot, "releases", "harness.env");
  writePrivate(releaseEnv, `LONGTAIL_IMAGE=${IMAGE}\nLONGTAIL_RELEASE_BRANCH=main\nLONGTAIL_RELEASE_COMMIT=${IDENTITY.commitSha}\nLONGTAIL_RELEASE_ARTIFACT_SHA256=${IDENTITY.artifact}\n`);
  writePrivate(path.join(deployRoot, "state", "current.json"), JSON.stringify({ version: IDENTITY.version, commitSha: IDENTITY.commitSha, artifact: { sha256: IDENTITY.artifact }, deployment: { releaseEnv, rollbackBackup: "" } }));
  writePrivate(path.join(deployRoot, "compose-operation.lock"), "");
  // The application environment file carries the canary secret. Only Compose reads it, so the fake
  // Compose resolves it into the environment, and the host environment names it with quotes, as
  // Compose allows: a helper that parsed the path itself would miss the file. The host environment
  // also carries a double-quoted secret of its own, and the role passwords one more.
  const appEnv = path.join(root, "etc", "public-demo.env");
  writePrivate(appEnv, `DEMO_MODE=true\nSUPER_ADMIN_PASSWORD=${CANARY}\n`);
  const hostEnv = path.join(root, "etc", "compose-host.env");
  writePrivate(hostEnv, `LONGTAIL_ENV_FILE="${appEnv}"\nLONGTAIL_HOST_PORT=8001\nLONGTAIL_HARNESS_SECRET="${HOST_CANARY}"\n`);
  const roleCredentials = path.join(root, "secrets", "demo-role-credentials.json");
  if (scenario.roleCredentials !== "missing") {
    writePrivate(roleCredentials, JSON.stringify({ version: 2, passwords: scenario.roleCredentials === "empty" ? {} : { super_admin: ROLE_CANARY } }));
  }
  const isolation = path.join(root, "isolation");
  fs.writeFileSync(isolation, `#!/usr/bin/env bash\nexec ${shellQuote(path.join(work, "bin", "isolation"))} "$@"\n`, { mode: 0o755 });
  const helperEnv = path.join(root, "etc", "compose-deploy-helper.env");
  writePrivate(helperEnv, [
    `LTF_COMPOSE_DIR=${path.join(root, "compose")}`,
    `LTF_COMPOSE_HOST_ENV=${hostEnv}`,
    `LTF_DEMO_ROLE_CREDENTIALS=${roleCredentials}`,
    `LTF_DEPLOY_ROOT=${deployRoot}`,
    `LTF_MAINTENANCE_STATE_ROOT=${maintenance}`,
    `LTF_PUBLIC_DEMO_ISOLATION_HELPER=${isolation}`,
    `LTF_PUBLIC_URL=${DEMO_ORIGIN}`,
    "",
  ].join("\n"));
  const marker = path.join(maintenance, "deployment", "maintenance.on");
  if (scenario.curtainSignal) {
    // The real rm, ahead of every other tool for this scenario alone, which signals the helper that
    // removed the curtain the moment it is gone, as a stop request arriving then would. Every other
    // scenario runs without it, because each rm would otherwise start a process of its own.
    fs.mkdirSync(path.join(root, "bin"), { mode: 0o755 });
    fs.writeFileSync(path.join(root, "bin", "rm"), [
      "#!/usr/bin/env bash",
      "/usr/bin/rm \"$@\" || exit",
      `for argument in "$@"; do if test "$argument" = ${shellQuote(marker)}; then kill -TERM "$PPID"; fi; done`,
      "",
    ].join("\n"), { mode: 0o755 });
  }
  fs.writeFileSync(path.join(state, "scenario.json"), JSON.stringify({ bridgeAfter: 0, scannerAfter: 0, ...scenario }));
  fs.writeFileSync(path.join(state, "runtime.json"), JSON.stringify({ running: Boolean(scenario.running), isolationEnforced: false, probes: {}, clock: Math.floor(Date.now() / 1000), identityCalls: 0 }));
  fs.writeFileSync(path.join(state, "paths.json"), JSON.stringify({ marker, volume, lock: path.join(deployRoot, "compose-operation.lock"), stallPort }));
  fs.writeFileSync(path.join(state, "calls.jsonl"), "");
  for (const file of ["scenario.json", "runtime.json", "paths.json", "calls.jsonl"]) fs.chmodSync(path.join(state, file), 0o666);
  return { root, state, helperEnv, deployRoot, volume, marker, isolation };
}

/** @param {Sandbox} box @param {Date} when */
function completedReset(box, when) {
  const stamp = when.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const dir = path.join(box.deployRoot, "demo-reset-operations", `${stamp}-scheduled-1`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  writePrivate(path.join(dir, "state.json"), JSON.stringify({ phase: "completed", outcome: "baseline-healthy" }));
}

/**
 * A synthetic reset identity `hour` hours after a fixed start. Its suffix carries the sandbox's
 * number, so that no two scenarios name the same backup in the shared backup root.
 * @param {Sandbox} box @param {number} hour
 */
function historyId(box, hour) {
  const stamp = new Date(Date.UTC(2026, 0, 1) + hour * 3_600_000).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-scheduled-${path.basename(box.root).replace("box-", "")}${String(hour).padStart(4, "0")}`;
}

/**
 * Synthetic reset history, as the reset leaves it: each operation's root-owned evidence with its
 * state, and its pre-reset backup and checksum sidecar, owned by the container user. A legacy login
 * is the pre-reset login record earlier helpers kept: the response body, with the visitor's profile.
 * @param {Sandbox} box @param {{ id: string, phase?: string, backup?: boolean, sidecar?: boolean, legacyLogin?: boolean }[]} operations
 */
function seedHistory(box, operations) {
  const root = path.join(box.deployRoot, "demo-reset-operations");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  for (const { id, phase = "completed", backup = true, sidecar = true, legacyLogin = false } of operations) {
    const directory = path.join(root, id);
    fs.mkdirSync(directory, { mode: 0o700 });
    writePrivate(path.join(directory, "state.json"), JSON.stringify({
      contract: "longtail-forge-public-demo-reset-v1", target: "rt-ltf-demo", operationId: id, anchorDate: "2026-01-01",
      phase, outcome: phase === "completed" ? "baseline-healthy" : "maintenance-curtain-retained",
    }));
    writePrivate(path.join(directory, "steps.jsonl"), `${JSON.stringify({ step: "finalize" })}\n`);
    writePrivate(path.join(directory, "pre-reset-login.json"), legacyLogin
      ? JSON.stringify({ user: { id: 3, username: "workspace.admin", displayName: VISITOR_CANARY } })
      : `${JSON.stringify({ httpStatus: "200" })}\n`);
    if (backup) writeBackup(`pre-demo-reset-${id}.ltfbackup.tgz`);
    if (sidecar) writeBackup(`pre-demo-reset-${id}.ltfbackup.tgz.sha256`, `${"0".repeat(64)}  pre-demo-reset-${id}.ltfbackup.tgz\n`);
  }
}

/** @param {string} id */
function backupExists(id) {
  return fs.existsSync(path.join(BACKUP_ROOT, `pre-demo-reset-${id}.ltfbackup.tgz`));
}

/** @param {string} id */
function sidecarExists(id) {
  return fs.existsSync(path.join(BACKUP_ROOT, `pre-demo-reset-${id}.ltfbackup.tgz.sha256`));
}

/** @param {Sandbox} box @param {string} id */
function evidenceExists(box, id) {
  return fs.existsSync(path.join(box.deployRoot, "demo-reset-operations", id));
}

/** The reset history and every backup, so a scenario can prove that nothing changed. @param {Sandbox} box */
function historySnapshot(box) {
  const root = path.join(box.deployRoot, "demo-reset-operations");
  return {
    evidence: fs.existsSync(root) ? fs.readdirSync(root).sort() : [],
    backups: fs.readdirSync(BACKUP_ROOT).sort(),
  };
}

/** @param {Sandbox} box @param {string} fakeBin */
function writeSchedulerEnv(box, fakeBin) {
  const reset = path.join(box.root, "scheduler-reset");
  fs.writeFileSync(reset, `#!/usr/bin/env bash\nexec ${shellQuote(path.join(fakeBin, "reset"))} "$@"\n`, { mode: 0o755 });
  writeFixed(FIXED.schedulerEnv, [
    `LTF_PUBLIC_DEMO_RESET_HELPER=${reset}`,
    `LTF_PUBLIC_DEMO_RESET_ALERT_HELPER=${FIXED.installedAlert}`,
    `LTF_PUBLIC_DEMO_RESET_LOG=${path.join(box.root, "log", "public-demo-reset.jsonl")}`,
    "",
  ].join("\n"));
}

/** @param {Sandbox} box */
function bootOperation(box) {
  return fs.readdirSync(path.join(box.deployRoot, "demo-boot-operations")).sort().at(-1) || "";
}

/** @param {Sandbox} box */
function bootDirectory(box) {
  return path.join(box.deployRoot, "demo-boot-operations", bootOperation(box));
}

/** Every regular file's text beneath a directory, so a leak check sees all of the evidence. @param {string} directory @returns {string} */
function readTree(directory) {
  if (!fs.existsSync(directory)) return "";
  return fs.readdirSync(directory, { withFileTypes: true }).map((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return readTree(entryPath);
    return entry.isFile() ? fs.readFileSync(entryPath, "utf8") : "";
  }).join("\n");
}

/** One block a helper must share with its sibling, from its opening line through its end marker. @param {string} source @param {{ label: string, start: string, end: string }} shared */
function sharedBlock(source, shared) {
  assert.equal(source.split(shared.start).length - 1, 1, `${shared.label} must open exactly once`);
  const from = source.indexOf(shared.start);
  const to = source.indexOf(shared.end, from + shared.start.length);
  assert.ok(to > from, `${shared.label} must close`);
  return source.slice(from, to + shared.end.length);
}

/** @param {Sandbox} box @returns {Call[]} */
function readCalls(box) {
  return /** @type {Call[]} */ (readJsonLines(path.join(box.state, "calls.jsonl")));
}

/** @param {string} filePath @returns {Record<string, unknown>[]} */
function readJsonLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

/** @param {Call[]} calls @param {string} tool @param {(call: Call) => boolean} [filter] */
function only(calls, tool, filter = () => true) {
  const matches = calls.filter((call) => call.tool === tool && filter(call));
  assert.equal(matches.length, 1, `expected exactly one ${tool} call, saw ${matches.length}: ${JSON.stringify(calls.filter((call) => call.tool === tool))}`);
  return matches[0];
}

/** @param {string} text */
function lastLine(text) {
  return text.trim().split("\n").at(-1) || "";
}

/** @returns {{ etc: boolean }} what the harness created, so that it removes only that */
function prepareHost() {
  for (const target of Object.values(FIXED)) {
    assert.equal(fs.existsSync(target), false, `${target} already exists; refusing to run where a real demo host may live`);
  }
  if (fs.existsSync(BACKUP_PARENT) && !fs.existsSync(OWNERSHIP_MARKER)) {
    throw new Error(`${BACKUP_PARENT} already exists; refusing to run where real Longtail Forge backups may live.`);
  }
  fs.mkdirSync(BACKUP_ROOT, { recursive: true, mode: 0o700 });
  // The deploy helper gives the backup root to the container user, which writes every backup.
  fs.chownSync(BACKUP_ROOT, CONTAINER_UID, CONTAINER_UID);
  fs.writeFileSync(OWNERSHIP_MARKER, "created by scripts/release/public-demo-helper-contract-harness.mjs\n");
  const etc = !fs.existsSync(ETC);
  fs.mkdirSync(ETC, { recursive: true, mode: 0o755 });
  fs.mkdirSync("/usr/local/sbin", { recursive: true, mode: 0o755 });
  return { etc };
}

/** @param {string} work @param {{ etc: boolean }} created */
function restoreHost(work, created) {
  for (const target of Object.values(FIXED)) fs.rmSync(target, { force: true });
  if (created.etc) fs.rmSync(ETC, { recursive: true, force: true });
  if (fs.existsSync(OWNERSHIP_MARKER)) fs.rmSync(BACKUP_PARENT, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
}

/** @param {string} source @param {string} target @param {number} mode */
function install(source, target, mode) {
  fs.writeFileSync(target, fs.readFileSync(source));
  fs.chownSync(target, 0, 0);
  fs.chmodSync(target, mode);
}

/** @param {string} target @param {string} content @param {number} [mode] */
function writeFixed(target, content, mode = 0o600) {
  fs.writeFileSync(target, content);
  fs.chownSync(target, 0, 0);
  fs.chmodSync(target, mode);
}

/** @param {string} filePath @param {string} content */
function writePrivate(filePath, content) {
  fs.writeFileSync(filePath, content);
  fs.chownSync(filePath, 0, 0);
  fs.chmodSync(filePath, 0o600);
}

/** @param {string} value */
function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
