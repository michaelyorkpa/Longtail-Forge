export const regressionMeta = Object.freeze({
  id: "framework.password-hashing-modernization",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "baseline-bypass", "passwords", "security"],
  description: "Proves new Argon2id hashes, bounded constant-time verification, legacy PBKDF2 login upgrades, safe rehash events, and centralized async credential writes.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import { argon2, pbkdf2Sync, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import { promisify } from "node:util";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("password-hashing-modernization");
const USERNAME = "password-modernization@example.test";
const PASSWORD = "Password-Modernization-Admin-123!";
const WRONG_PASSWORD = "Never-Store-Password-Modernization-456!";

process.env.SUPER_ADMIN_USERNAME = USERNAME;
process.env.SUPER_ADMIN_PASSWORD = PASSWORD;
process.env.TRUST_PROXY = "false";

const deriveArgon2 = promisify(argon2);
const { createApp } = await import("../../../src/core/app.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { db } = await import("../../../src/core/database.js");
const { internalEventBus } = await import("../../../src/core/events/event-bus.js");
const {
  CURRENT_PASSWORD_HASH_POLICY,
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} = await import("../../../src/security/passwords.js");

let server;
let unsubscribe;

try {
  await initializeDatabase();
  const freshUser = await readUser();
  assert.match(freshUser.password, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/, "fresh credentials should use the current self-describing Argon2id policy");
  assert.equal(CURRENT_PASSWORD_HASH_POLICY.memory, 65_536);
  assert.equal(CURRENT_PASSWORD_HASH_POLICY.passes, 3);
  assert.equal(CURRENT_PASSWORD_HASH_POLICY.parallelism, 1);

  const directHash = await hashPassword(PASSWORD);
  assert.deepEqual(await verifyPassword(PASSWORD, directHash), {
    algorithm: "argon2id",
    matches: true,
    needsRehash: false,
    rehashReason: null,
  });
  assert.equal((await verifyPassword(WRONG_PASSWORD, directHash)).matches, false);
  assert.equal((await verifyPassword(PASSWORD, DUMMY_PASSWORD_HASH)).matches, false);

  const olderArgon2Hash = await createArgon2Hash(PASSWORD, { memory: 19_456, passes: 2, parallelism: 1 });
  assert.deepEqual(await verifyPassword(PASSWORD, olderArgon2Hash), {
    algorithm: "argon2id",
    matches: true,
    needsRehash: true,
    rehashReason: "parameters_outdated",
  });
  const oversizedHash = `$argon2id$v=19$m=999999999,t=3,p=1$${randomBytes(16).toString("base64url")}$${randomBytes(32).toString("base64url")}`;
  assert.deepEqual(await verifyPassword(PASSWORD, oversizedHash), {
    algorithm: "unknown",
    matches: false,
    needsRehash: false,
    rehashReason: null,
  }, "untrusted stored parameters must be rejected before allocating attacker-selected resources");

  const legacySalt = randomBytes(16).toString("base64url");
  const legacyHash = pbkdf2Sync(PASSWORD, legacySalt, 310_000, 32, "sha256").toString("base64url");
  await db.run(`
UPDATE users
SET password = :password
WHERE user_id = :userId;
`, {
    password: `pbkdf2_sha256$310000$${legacySalt}$${legacyHash}`,
    userId: freshUser.user_id,
  });

  const emittedEvents = [];
  unsubscribe = internalEventBus.on("security.password.rehashed", (event) => emittedEvents.push(event), {
    id: "regression:password-hashing-modernization",
  });
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

  const loginResponse = await api.post("/api/login", { username: USERNAME, password: PASSWORD });
  assert.equal(loginResponse.status, 200, JSON.stringify(loginResponse.body));
  const cookie = readSessionCookie(loginResponse);
  assert.ok(cookie);
  assert.equal((await api.get("/api/session", { cookie })).status, 200, "transparent representation upgrades must not revoke the new session");

  const upgradedUser = await readUser();
  assert.match(upgradedUser.password, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  assert.equal((await verifyPassword(PASSWORD, upgradedUser.password)).matches, true);
  assert.equal(emittedEvents.length, 1);
  assert.deepEqual(emittedEvents[0].metadata, {
    new_algorithm: "argon2id",
    outcome: "success",
    previous_algorithm: "pbkdf2_sha256",
    rehash_reason: "legacy_algorithm",
    target_user_id: freshUser.user_id,
  });

  const rehashEvent = await db.get(`
SELECT action, previous_value_json, new_value_json, metadata_json
FROM audit_logs
WHERE action = 'security.password.rehashed'
ORDER BY created_at DESC
LIMIT 1;
`);
  const securityRows = await db.query("SELECT action, record_id, metadata_json FROM audit_logs WHERE record_type = 'security_event' ORDER BY created_at;");
  assert.ok(rehashEvent, `successful legacy upgrade should persist the registered security event: ${JSON.stringify(securityRows)}`);
  assert.equal(rehashEvent.previous_value_json, null);
  assert.equal(rehashEvent.new_value_json, null);
  assert.deepEqual(JSON.parse(rehashEvent.metadata_json), {
    ...emittedEvents[0].metadata,
    event_type: "security.password.rehashed",
    reason_class: "password_rehashed",
    workspace_resolution: "event",
  });

  const safeSurfaces = JSON.stringify({ emittedEvents, rehashEvent });
  for (const secret of [PASSWORD, WRONG_PASSWORD, legacyHash, upgradedUser.password, cookie]) {
    assert.equal(safeSurfaces.includes(secret), false, "passwords, hashes, and session credentials must stay out of rehash events");
  }

  const [passwordSource, authSource, usersSource, databaseSource, seedSource] = await Promise.all([
    fs.readFile("src/security/passwords.js", "utf8"),
    fs.readFile("src/services/auth.service.js", "utf8"),
    fs.readFile("src/services/users.service.js", "utf8"),
    fs.readFile("src/db/index.js", "utf8"),
    fs.readFile("scripts/seed-scale.mjs", "utf8"),
  ]);
  assert.match(passwordSource, /timingSafeEqual\(/, "verification should compare derived and stored hashes with the runtime constant-time primitive");
  assert.doesNotMatch(passwordSource, /argon2Sync|pbkdf2Sync|scryptSync/, "request-path hashing must not block the event loop with synchronous KDFs");
  for (const [name, source] of [["auth", authSource], ["users", usersSource], ["database", databaseSource], ["scale seed", seedSource]]) {
    assert.doesNotMatch(source, /(?<!await )hashPassword\(/, `${name} credential writers should await the centralized asynchronous hasher`);
  }
} finally {
  unsubscribe?.();
  if (server) {
    await closeServer(server);
  }
  await closeDatabase();
  await fixture.cleanup();
}

console.log("Password hashing modernization regression passed.");

async function createArgon2Hash(password, { memory, passes, parallelism }) {
  const salt = randomBytes(16);
  const hash = Buffer.from(await deriveArgon2("argon2id", {
    memory,
    message: password,
    nonce: salt,
    parallelism,
    passes,
    tagLength: 32,
  }));
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

async function readUser() {
  return db.get(`
SELECT user_id, password
FROM users
WHERE username = :username;
`, { username: USERNAME });
}

function createApi(baseUrl) {
  async function request(method, url, body, options = {}) {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (options.cookie) headers.cookie = `longtail_forge_session=${options.cookie}`;
    const response = await fetch(`${baseUrl}${url}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
    });
    const text = await response.text();
    return {
      body: text ? JSON.parse(text) : null,
      headers: response.headers,
      status: response.status,
    };
  }
  return {
    get(url, options) {
      return request("GET", url, undefined, options);
    },
    post(url, body, options) {
      return request("POST", url, body, options);
    },
  };
}

function readSessionCookie(response) {
  const setCookie = response.headers.get("set-cookie") || "";
  return setCookie.match(/longtail_forge_session=([^;,]+)/)?.[1] || "";
}

function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => error ? reject(error) : resolve());
  });
}
