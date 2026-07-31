export const regressionMeta = Object.freeze({
  id: "permissions.sanitized-demo-role-journey",
  area: "permissions",
  tier: "release-gate",
  tags: ["authentication", "database", "demo", "permissions", "seed"],
  description: "Authenticates every local sanitized-demo role fixture and proves the complete scoped permission journey without exposing credentials.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ROLE_CREDENTIALS_FILE_ENV,
  SANITIZED_DEMO_ROLE_FIXTURES,
} from "../../lib/sanitized-demo-role-fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-role-journey-regression-"));
const credentialsFile = path.join(temporaryDirectory, "private-role-credentials.json");
const passwords = Object.fromEntries(SANITIZED_DEMO_ROLE_FIXTURES.map((fixture, index) => [
  fixture.roleId,
  `V${index}r!Journey-Private-86420zZ`,
]));

try {
  await fs.writeFile(
    credentialsFile,
    `${JSON.stringify({ version: 1, passwords }, null, 2)}\n`,
    "utf8",
  );
  const result = spawnSync(process.execPath, ["scripts/sanitized-demo-role-journey.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      LONGTAIL_ENV: "development",
      LONGTAIL_PUBLIC_URL: "http://127.0.0.1",
      LONGTAIL_RELEASE_BRANCH: "",
      [ROLE_CREDENTIALS_FILE_ENV]: credentialsFile,
    },
    timeout: 180_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error);
  for (const password of Object.values(passwords)) {
    assert.doesNotMatch(result.stdout, new RegExp(escapeRegExp(password)));
    assert.doesNotMatch(result.stderr, new RegExp(escapeRegExp(password)));
  }

  const output = JSON.parse(result.stdout.slice(result.stdout.lastIndexOf("\n{") + 1));
  assert.equal(output.ok, true);
  assert.equal(output.credentialsPrinted, false);
  assert.ok(output.checks >= 80, "the journey should retain broad allowed/denied coverage");
  assert.deepEqual(output.rolesVerified, SANITIZED_DEMO_ROLE_FIXTURES.map((fixture) => fixture.roleId));

  const journeySource = await fs.readFile(
    path.join(root, "scripts", "sanitized-demo-role-journey.mjs"),
    "utf8",
  );
  assert.match(journeySource, /LONGTAIL_AUTH_THROTTLE_ENABLED = "true"/);
  assert.match(journeySource, /\/api\/login/);
  assert.match(journeySource, /\/api\/logout/);
  assert.match(journeySource, /\/api\/app-shell\/bootstrap/);
  assert.match(journeySource, /\/api\/client-projects/);
  assert.match(journeySource, /\/api\/roles/);
  assert.match(journeySource, /\/api\/role-assignments\/lookup/);
  assert.doesNotMatch(journeySource, /--password|--credential|--secret/);

  console.log("Sanitized-demo complete role permission journey regression passed.");
} finally {
  await fs.rm(temporaryDirectory, { force: true, recursive: true });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
