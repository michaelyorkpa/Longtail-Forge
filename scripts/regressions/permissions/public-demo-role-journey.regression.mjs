export const regressionMeta = Object.freeze({
  id: "permissions.public-demo-role-journey",
  area: "permissions",
  tier: "release-gate",
  tags: ["authentication", "database", "demo", "permissions", "seed"],
  description: "Authenticates the exact six public demo visitors and proves allowed work, denials, isolation, immutable credentials, logout, and absence of a public Super Administrator path.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LOCAL_ROLE_FIXTURE_MODE,
  PUBLIC_DEMO_ROLE_FIXTURE_MODE,
  PUBLIC_DEMO_VISITOR_PASSWORDS,
  ROLE_CREDENTIALS_FILE_ENV,
  RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
  SANITIZED_DEMO_ROLE_FIXTURES,
  loadSanitizedDemoRoleFixtures,
} from "../../lib/sanitized-demo-role-fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-role-journey-regression-"));
const credentialsFile = path.join(temporaryDirectory, "bound-public-demo-credentials.json");
const operatorPassword = "Regression-Only-Public-Operator-86420!";

try {
  await writeCredentials({ super_admin: operatorPassword });

  await assert.rejects(loadSanitizedDemoRoleFixtures({
    env: localEnvironment(credentialsFile),
    mode: PUBLIC_DEMO_ROLE_FIXTURE_MODE,
    target: { profile: "sanitized-demo" },
  }), /exact bound rt-ltf-demo profile/);
  await assert.rejects(loadSanitizedDemoRoleFixtures({
    credentialBinding: RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
    env: localEnvironment(credentialsFile),
    mode: PUBLIC_DEMO_ROLE_FIXTURE_MODE,
    target: { profile: "development" },
  }), /exact bound rt-ltf-demo profile/);
  await assert.rejects(loadSanitizedDemoRoleFixtures({
    credentialBinding: RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
    env: localEnvironment(credentialsFile),
    mode: LOCAL_ROLE_FIXTURE_MODE,
    target: { profile: "sanitized-demo" },
  }), /Bound demo credentials require --role-fixtures public-demo/);

  const result = spawnSync(
    process.execPath,
    ["scripts/sanitized-demo-role-journey.mjs", "--public-demo"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        ...localEnvironment(credentialsFile),
      },
      timeout: 180_000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error);

  for (const password of [operatorPassword, ...Object.values(PUBLIC_DEMO_VISITOR_PASSWORDS)]) {
    assert.doesNotMatch(result.stdout, new RegExp(escapeRegExp(password)));
    assert.doesNotMatch(result.stderr, new RegExp(escapeRegExp(password)));
  }

  const output = JSON.parse(result.stdout.slice(result.stdout.lastIndexOf("\n{") + 1));
  const publicVisitors = SANITIZED_DEMO_ROLE_FIXTURES.filter((fixture) => fixture.publicVisitor);
  assert.equal(output.ok, true);
  assert.equal(output.publicDemo, true);
  assert.equal(output.credentialsPrinted, false);
  assert.ok(output.checks >= 125, "the public journey should retain broad allowed/denied coverage");
  assert.deepEqual(output.rolesVerified, publicVisitors.map((fixture) => fixture.roleId));
  assert.equal(output.rolesVerified.includes("super_admin"), false);

  await writeCredentials({
    super_admin: operatorPassword,
    client_user: PUBLIC_DEMO_VISITOR_PASSWORDS.client_user,
  });
  await assert.rejects(loadSanitizedDemoRoleFixtures({
    credentialBinding: RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
    env: localEnvironment(credentialsFile),
    mode: PUBLIC_DEMO_ROLE_FIXTURE_MODE,
    target: { profile: "sanitized-demo" },
  }), /must define only the private Super Administrator password/);

  const journeySource = await fs.readFile(
    path.join(root, "scripts", "sanitized-demo-role-journey.mjs"),
    "utf8",
  );
  assert.match(journeySource, /PUBLIC_DEMO_ROLE_FIXTURE_MODE/);
  assert.match(journeySource, /PUBLIC_DEMO_DATA_MARKER_CONTRACT/);
  assert.match(journeySource, /\/api\/tasks\?limit=10/);
  assert.match(journeySource, /\/api\/time-entries/);
  assert.match(journeySource, /\/api\/session\/workspace/);
  assert.match(journeySource, /\/api\/user\/password/);
  assert.match(journeySource, /\/api\/logout/);

  console.log("Public demo six-role permission journey regression passed.");
} finally {
  await fs.rm(temporaryDirectory, { force: true, recursive: true });
}

function localEnvironment(file) {
  return {
    LONGTAIL_ENV: "development",
    LONGTAIL_PUBLIC_URL: "http://127.0.0.1",
    LONGTAIL_RELEASE_BRANCH: "",
    [ROLE_CREDENTIALS_FILE_ENV]: file,
  };
}

async function writeCredentials(passwords) {
  await fs.writeFile(credentialsFile, `${JSON.stringify({
    binding: RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
    passwords,
    version: 2,
  }, null, 2)}\n`, "utf8");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
