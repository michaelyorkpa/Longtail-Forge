export const regressionMeta = Object.freeze({
  id: "release.public-demo-reset-scheduler",
  area: "release",
  tier: "release-gate",
  tags: ["alerts", "compose", "demo", "scheduling", "security"],
  description: "Proves the external UTC hourly public-demo reset trigger, shared-lock behavior, bounded redacted evidence, alert invocation, and safe disable/recovery contract.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";

const paths = Object.freeze({
  alert: "scripts/release/longtail-forge-public-demo-reset-alert.example",
  attributes: ".gitattributes",
  changelog: "CHANGELOG.md",
  decisions: "DECISIONS.md",
  demoDocs: "docs/demo-data-operations.md",
  environment: "docs/longtail-forge-public-demo-reset-scheduler.env.example",
  manualRelease: ".github/workflows/manual-release.yml",
  previewDocs: "docs/preview-deployment.md",
  reset: "scripts/release/longtail-forge-public-demo-reset-host.example",
  roadmap: "ROADMAP.md",
  archive: "ROADMAP-ARCHIVE.md",
  runtimeDocs: "docs/runtime-configuration.md",
  scheduler: "scripts/release/longtail-forge-public-demo-reset-scheduler-host.example",
  service: "scripts/release/longtail-forge-public-demo-reset.service.example",
  timer: "scripts/release/longtail-forge-public-demo-reset.timer.example",
});

const entries = await Promise.all(Object.entries(paths).map(async ([key, filePath]) => [key, await fs.readFile(filePath, "utf8")]));
const source = Object.fromEntries(entries);

assert.match(source.timer, /^OnCalendar=\*-\*-\* \*:00:00 UTC$/m);
assert.match(source.timer, /^AccuracySec=1s$/m);
assert.match(source.timer, /^RandomizedDelaySec=0$/m);
assert.match(source.timer, /^Persistent=false$/m);
assert.match(source.timer, /^Unit=longtail-forge-public-demo-reset\.service$/m);
assert.match(source.service, /^Type=oneshot$/m);
assert.match(source.service, /^ExecStart=\/usr\/local\/sbin\/longtail-forge-public-demo-reset-scheduler run --trigger scheduled$/m);
assert.doesNotMatch(source.service, /longtail-forge\.service|server\.js|npm start|docker compose up/);

assert.match(source.scheduler, /SCHEDULER_ENV='\/etc\/longtail-forge\/public-demo-reset-scheduler\.env'/);
assert.match(source.scheduler, /require_root_owned_file "\$SCHEDULER_ENV" '600'/);
assert.match(source.scheduler, /unset LTF_PUBLIC_DEMO_RESET_ENABLED/);
assert.match(source.scheduler, /scheduler environment contains an invalid line/);
assert.match(source.scheduler, /printf -v "\$key" '%s' "\$value"/);
assert.match(source.scheduler, /LTF_PUBLIC_DEMO_RESET_ENABLED/);
assert.match(source.scheduler, /test "\$ENABLED" = 'false'/);
assert.match(source.scheduler, /TRIGGER" = 'scheduled'.*TRIGGER" = 'manual'/s);
assert.match(source.scheduler, /SCHEDULED_BOUNDARY="\$\(date -u \+%Y-%m-%dT%H:00:00Z\)"/);
assert.match(source.scheduler, /"\$RESET_HELPER" reset --target "\$DEMO_TARGET" --anchor-date today/);
assert.match(source.scheduler, /--operation-id "\$OPERATION_ID" --confirm "\$RESET_CONFIRMATION"/);
assert.match(source.scheduler, /RESET_STATUS" -eq 75/);
assert.match(source.scheduler, /FAILURE_CLASS='lifecycle-lock-contended'/);
assert.match(source.scheduler, /prior unit was restored and verified/);
assert.match(source.scheduler, /maintenance curtain and protected evidence remain/);
assert.match(source.scheduler, /"\$ALERT_HELPER" notify --target "\$DEMO_TARGET"/);
assert.match(source.scheduler, /append_event 'started'/);
assert.match(source.scheduler, /append_event 'finished' 'succeeded'/);
assert.match(source.scheduler, /append_event 'finished' 'failed'/);
assert.match(source.scheduler, /longtail-forge-public-demo-reset-scheduler-v1/);
for (const field of [
  "trigger", "operationId", "scheduledBoundary", "lockOutcome", "durationMs",
  "semanticFingerprint", "health", "failureClass", "rollbackStatus", "recoveryStatus", "alertOutcome",
]) assert.match(source.scheduler, new RegExp(field));
assert.match(source.scheduler, /tail -n "\$LOG_RECORDS"/);
assert.match(source.scheduler, /install -o root -g root -m 0600 "\$temporary_log" "\$LOG_PATH"/);
assert.match(source.scheduler, /require_root_owned_directory "\$LOG_DIRECTORY" '700'/);
assert.match(source.scheduler, /test ! -L "\$LOG_PATH"/);
assert.doesNotMatch(source.scheduler, /cat .*reset\.(out|err)|printf .*\$\(.*reset\.(out|err)/);

assert.match(source.alert, /logger --priority daemon\.alert --tag longtail-forge-public-demo-reset/);
assert.match(source.alert, /failureClass=\$FAILURE_CLASS recoveryStatus=\$RECOVERY_STATUS exitCode=\$EXIT_CODE/);
const alertPayload = source.alert.split("logger --priority daemon.alert", 2)[1];
assert.doesNotMatch(alertPayload, /password|cookie|session|authorization|credential|\/etc\/longtail-forge\/compose-host/iu);

assert.match(source.reset, /lock_contended\(\)[\s\S]*exit 75/);
assert.match(source.reset, /--operation-id\) key=operation/);
assert.match(source.reset, /provided operation identity is invalid/);
assert.match(source.reset, /"semanticFingerprint":"%s"/);
assert.match(source.environment, /^LTF_PUBLIC_DEMO_RESET_ENABLED=true$/m);
assert.match(source.environment, /^LTF_PUBLIC_DEMO_RESET_LOG_RECORDS=336$/m);

for (const asset of [paths.scheduler, paths.alert, paths.service, paths.timer]) {
  assert.match(source.attributes, new RegExp(`^${asset.replaceAll(".", "\\.")} text eol=lf$`, "m"));
  assert.match(source.manualRelease, new RegExp(asset.replaceAll(".", "\\.")));
}
assert.match(source.manualRelease, /docs\/longtail-forge-public-demo-reset-scheduler\.env\.example/);
assert.match(source.attributes, /^docs\/longtail-forge-public-demo-reset-scheduler\.env\.example text eol=lf$/m);

for (const docs of [source.demoDocs, source.previewDocs]) {
  assert.match(docs, /top of every UTC hour/i);
  assert.match(docs, /Persistent=false/);
  assert.match(docs, /LTF_PUBLIC_DEMO_RESET_ENABLED/);
  assert.match(docs, /shared Compose operation lock/i);
  assert.match(docs, /failure alert/i);
}
assert.match(source.runtimeDocs, /host-only scheduler control/i);
assert.match(source.runtimeDocs, /not an Admin setting/i);
assert.match(source.decisions, /As of 0\.33\.31\.8/);
assert.doesNotMatch(source.roadmap, /^### Version 0\\.33\\.31\\.8\\b/m);
assert.match(source.archive, /^## Version 0\.33\.31\.8 - External hourly scheduler and reset observability$/m);
assert.match(source.changelog, /^## Version 0\.33\.31\.8 - \d{4}-\d{2}-\d{2}$/m);
assert.doesNotMatch(source.roadmap, /^### Version 0\.33\.(31|33) slice \d+/m);

if (process.platform !== "win32") {
  for (const filePath of [paths.scheduler, paths.alert, paths.reset]) {
    const result = spawnSync("bash", ["-n", filePath], { encoding: "utf8" });
    assert.equal(result.status, 0, `${filePath} must pass bash -n: ${result.stderr}`);
  }
}

console.log("Public-demo reset scheduler and alert regression passed.");
