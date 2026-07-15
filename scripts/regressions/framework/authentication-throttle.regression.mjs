export const regressionMeta = Object.freeze({
  id: "framework.authentication-throttle",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "security", "throttling"],
  description: "Proves login and password-sensitive throttling is trusted-IP keyed, account-aware, non-enumerating, configurable, and event emitting.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("authentication-throttle");
const TEST_USERNAME = "security-throttle@example.test";
const TEST_PASSWORD = "Security-Throttle-Test-123!";

process.env.SUPER_ADMIN_USERNAME = TEST_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = TEST_PASSWORD;
process.env.TRUST_PROXY = "false";
process.env.LONGTAIL_AUTH_THROTTLE_ENABLED = "true";
process.env.LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT = "3";
process.env.LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS = "60";
process.env.LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS = "120";

const { createApp } = await import("../../../src/core/app.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { internalEventBus } = await import("../../../src/core/events/event-bus.js");
const {
  authenticationThrottle,
  createAuthenticationThrottle,
} = await import("../../../src/security/auth-throttle.js");
const authServiceSource = await fs.readFile("src/services/auth.service.js", "utf8");
const apiKeysServiceSource = await fs.readFile("src/services/api-keys.service.js", "utf8");
const publicApiRoutesSource = await fs.readFile("src/routes/public-api.routes.js", "utf8");

assert.match(
  authServiceSource,
  /verifyPassword\(password, user\?\.password \|\| DUMMY_PASSWORD_HASH\)/,
  "missing accounts should still take the password-verification path",
);
assert.doesNotMatch(
  authServiceSource,
  /This user is inactive/,
  "login responses should not reveal inactive-account existence",
);
assert.match(
  apiKeysServiceSource,
  /randomBytes\(24\)\.toString\("base64url"\)/,
  "API keys should retain high-entropy generation rather than sharing password throttling semantics",
);
assert.doesNotMatch(
  publicApiRoutesSource,
  /intake/i,
  "there is no public-intake credential surface to throttle in this slice",
);

runDeterministicThrottleChecks();

let server;
let unsubscribe;

try {
  await initializeDatabase();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);
  const securityEvents = [];
  unsubscribe = internalEventBus.on("security.authentication_throttle.lockout", (event) => {
    securityEvents.push(event);
  }, { id: "regression:authentication-throttle" });

  authenticationThrottle.clear();
  const knownFailure = await api.post("/api/login", {
    username: TEST_USERNAME,
    password: "Wrong-Password-1!",
  });
  const missingFailure = await api.post("/api/login", {
    username: "missing-account@example.test",
    password: "Wrong-Password-1!",
  });
  assert.equal(knownFailure.status, 401);
  assert.equal(missingFailure.status, 401);
  assert.deepEqual(
    missingFailure.body,
    knownFailure.body,
    "known and missing accounts should receive the same invalid-credential envelope",
  );

  authenticationThrottle.clear();
  assert.equal((await api.post("/api/login", {
    username: TEST_USERNAME,
    password: "Wrong-Password-1!",
  })).status, 401);
  const successfulLogin = await api.post("/api/login", {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
  });
  assert.equal(successfulLogin.status, 200, "a valid login below the threshold should succeed");
  const sessionCookie = readSessionCookie(successfulLogin);
  const userId = successfulLogin.body.user.user_id;
  assert.ok(sessionCookie);
  assert.ok(userId);
  const resetTarget = await api.post("/api/users", {
    username: "security-throttle-reset-target@example.test",
  }, { cookie: sessionCookie });
  assert.equal(resetTarget.status, 201, JSON.stringify(resetTarget.body));
  const resetTargetUserId = resetTarget.body.user.user_id;
  assert.ok(resetTargetUserId);
  assert.equal((await api.post("/api/login", {
    username: TEST_USERNAME,
    password: "Wrong-Password-2!",
  })).status, 401);
  assert.equal((await api.post("/api/login", {
    username: TEST_USERNAME,
    password: "Wrong-Password-3!",
  })).status, 401, "successful login should reset the IP and account failure counters");

  authenticationThrottle.clear();
  securityEvents.length = 0;
  const lockoutStatuses = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    lockoutStatuses.push((await api.post("/api/login", {
      username: TEST_USERNAME,
      password: `Wrong-Lockout-${attempt}!`,
    })).status);
  }
  assert.deepEqual(lockoutStatuses, [401, 401, 429]);
  const blockedKnown = await api.post("/api/login", {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
  });
  const blockedMissing = await api.post("/api/login", {
    username: "another-missing-account@example.test",
    password: "Wrong-Password-4!",
  });
  assert.equal(blockedKnown.status, 429);
  assert.deepEqual(blockedMissing.body, blockedKnown.body, "lockout copy should not reveal account existence");
  assert.deepEqual(blockedKnown.body, { error: "Too many attempts. Try again later." });
  assert.equal(securityEvents.length, 1, "crossing the login threshold should emit one security event");
  assert.equal(securityEvents[0].metadata.scope, "login");
  assert.deepEqual(securityEvents[0].metadata.dimensions, ["ip", "account"]);
  assert.equal(JSON.stringify(securityEvents[0]).includes("Wrong-Lockout"), false, "security events must not contain passwords");

  authenticationThrottle.clear();
  securityEvents.length = 0;
  const forgedStatuses = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    forgedStatuses.push((await api.post("/api/login", {
      username: `forged-${attempt}@example.test`,
      password: "Wrong-Password-5!",
    }, {
      "x-forwarded-for": `203.0.113.${attempt}`,
    })).status);
  }
  assert.deepEqual(forgedStatuses, [401, 401, 429], "forged forwarded IPs must not bypass the direct-client IP bucket");
  assert.equal(securityEvents[0].metadata.client_ip, "127.0.0.1");
  assert.deepEqual(securityEvents[0].metadata.dimensions, ["ip"]);

  authenticationThrottle.clear();
  securityEvents.length = 0;
  const passwordChangeStatuses = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    passwordChangeStatuses.push((await api.put("/api/user/password", {
      currentPassword: `Wrong-Current-${attempt}!`,
      newPassword: "Different-Password-123!",
    }, { cookie: sessionCookie })).status);
  }
  assert.deepEqual(passwordChangeStatuses, [400, 400, 429]);
  assert.equal(securityEvents[0].metadata.scope, "password-change");

  authenticationThrottle.clear();
  securityEvents.length = 0;
  const resetStatuses = [];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    resetStatuses.push((await api.put(`/api/users/${resetTargetUserId}/reset-password`, {}, {
      cookie: sessionCookie,
    })).status);
  }
  assert.deepEqual(resetStatuses, [200, 200, 200, 429], "admin password resets should be bounded by the shared sensitive-action throttle");
  assert.equal(securityEvents.length, 1);
  assert.equal(securityEvents[0].metadata.scope, "admin-password-reset");

  console.log("Authentication throttle regression passed.");
} finally {
  unsubscribe?.();
  authenticationThrottle.clear();
  if (server) {
    await closeServer(server);
  }
  await closeDatabase();
  await fixture.cleanup();
}

function runDeterministicThrottleChecks() {
  let now = 0;
  const throttle = createAuthenticationThrottle({
    clock: () => now,
    enabled: true,
    failureLimit: 3,
    lockoutSeconds: 120,
    windowSeconds: 60,
  });

  const sharedIp = (username) => ({ ipAddress: "192.0.2.1", scope: "login", username });
  assert.equal(throttle.recordFailure(sharedIp("first@example.test")).blocked, false);
  assert.equal(throttle.recordFailure(sharedIp("second@example.test")).blocked, false);
  const ipLockout = throttle.recordFailure(sharedIp("third@example.test"));
  assert.equal(ipLockout.blocked, true);
  assert.deepEqual(ipLockout.newlyLockedDimensions, ["ip"]);

  throttle.clear();
  const sharedAccount = (ipAddress) => ({ ipAddress, scope: "login", username: "target@example.test" });
  assert.equal(throttle.recordFailure(sharedAccount("192.0.2.10")).blocked, false);
  assert.equal(throttle.recordFailure(sharedAccount("192.0.2.11")).blocked, false);
  const accountLockout = throttle.recordFailure(sharedAccount("192.0.2.12"));
  assert.equal(accountLockout.blocked, true);
  assert.deepEqual(accountLockout.newlyLockedDimensions, ["account"]);

  throttle.clear();
  const resetContext = sharedAccount("192.0.2.20");
  throttle.recordFailure(resetContext);
  throttle.recordFailure(resetContext);
  throttle.reset(resetContext);
  assert.equal(throttle.recordFailure(resetContext).blocked, false);
  assert.equal(throttle.recordFailure(resetContext).blocked, false);

  throttle.recordFailure(resetContext);
  assert.equal(throttle.check(resetContext).blocked, true);
  now += 121000;
  assert.equal(throttle.check(resetContext).blocked, false, "the temporary lockout should expire after its configured duration");

  const disabled = createAuthenticationThrottle({ enabled: false, failureLimit: 1 });
  assert.equal(disabled.recordFailure(resetContext).blocked, false, "trusted offline installs should be able to disable throttling explicitly");
}

function createApi(baseUrl) {
  async function request(method, url, body, options = {}) {
    const headers = {
      "content-type": "application/json",
      ...(options.headers || options),
    };

    if (options.cookie) {
      headers.cookie = `longtail_forge_session=${options.cookie}`;
    }

    const response = await fetch(`${baseUrl}${url}`, {
      body: JSON.stringify(body),
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
    post(url, body, options) {
      return request("POST", url, body, options);
    },
    put(url, body, options) {
      return request("PUT", url, body, options);
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
