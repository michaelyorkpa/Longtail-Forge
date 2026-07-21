import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const caddyPath = readOption("--caddy") || "caddy";
const topology = readOption("--topology") || "direct-caddy";
if (!new Set(["direct-caddy", "multi-proxy"]).has(topology)) {
  throw new Error("--topology must be direct-caddy or multi-proxy");
}
const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-reference-caddy-"));
const appPort = await reservePort();
const proxyPort = await reservePort();
const privateProxyPort = topology === "multi-proxy" ? await reservePort() : null;
const publicOrigin = `https://localhost:${proxyPort}`;
const username = "reference-proxy-admin@example.test";
const password = "Reference-Proxy-Admin-Password-123!";
const secureNotesKey = "reference-proxy-secure-notes-key-material-123456789";
const forgedClientIp = "203.0.113.249";
const multiProxyObservedClientIp = "127.0.0.2";
const databaseFile = path.join(fixtureRoot, "reference-caddy.db");
const caddyfilePath = path.join(fixtureRoot, "Caddyfile");
const appOutput = [];
const caddyOutput = [];
let appProcess = null;
let caddyProcess = null;

try {
  await fs.mkdir(path.join(fixtureRoot, "files"), { recursive: true });
  await fs.writeFile(caddyfilePath, createLocalCaddyfile({
    appPort,
    privateProxyPort,
    proxyPort,
    topology,
  }));

  const caddyEnvironment = {
    ...process.env,
    APPDATA: path.join(fixtureRoot, "caddy-appdata"),
    XDG_CONFIG_HOME: path.join(fixtureRoot, "caddy-config"),
    XDG_DATA_HOME: path.join(fixtureRoot, "caddy-data"),
  };
  const caddyVersion = (await runCommand(caddyPath, ["version"], { env: caddyEnvironment })).stdout.trim();
  await runCommand(caddyPath, ["validate", "--config", caddyfilePath, "--adapter", "caddyfile"], {
    env: caddyEnvironment,
  });

  appProcess = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: createAppEnvironment({ appPort, databaseFile, fixtureRoot, password, publicOrigin, secureNotesKey, username }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  captureOutput(appProcess, appOutput);
  await waitForResponse(() => sendHttpRequest({ appPort, pathName: "/readyz" }), 200, "direct app readiness");

  caddyProcess = spawn(caddyPath, ["run", "--config", caddyfilePath, "--adapter", "caddyfile"], {
    cwd: fixtureRoot,
    env: caddyEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  captureOutput(caddyProcess, caddyOutput);

  const forgedHeaders = {
    "x-forwarded-for": forgedClientIp,
    "x-forwarded-host": "attacker.invalid",
    "x-forwarded-proto": "http",
  };
  const health = await waitForResponse(
    () => sendHttpsRequest({ headers: forgedHeaders, pathName: "/healthz", proxyPort }),
    200,
    "proxied health",
  );
  assert.deepEqual(health.body, { status: "ok" });
  assert.equal(health.headers["cache-control"], "no-store");
  assert.match(health.headers["x-request-id"], /^[0-9a-f-]{36}$/i);
  assert.equal(health.headers["strict-transport-security"], "max-age=300");
  assert.equal(health.headers["x-content-type-options"], "nosniff");

  const ready = await sendHttpsRequest({ headers: forgedHeaders, pathName: "/readyz", proxyPort });
  assert.equal(ready.status, 200);
  assert.deepEqual(ready.body, { status: "ready" });
  assert.equal(ready.headers["cache-control"], "no-store");
  assert.match(ready.headers["x-request-id"], /^[0-9a-f-]{36}$/i);
  assert.notEqual(ready.headers["x-request-id"], health.headers["x-request-id"]);

  const loginPage = await sendHttpsRequest({ headers: forgedHeaders, pathName: "/login.html", proxyPort });
  assert.equal(loginPage.status, 200);
  assert.match(loginPage.text, /Longtail Forge/);
  assert.match(loginPage.headers["content-security-policy"], /default-src 'self'/);
  assert.match(loginPage.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(loginPage.headers["x-frame-options"], "DENY");
  assert.equal(loginPage.headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.match(loginPage.headers["permissions-policy"], /camera=\(\)/);

  const csrf = await sendHttpsRequest({ headers: forgedHeaders, pathName: "/api/csrf-token", proxyPort });
  assert.equal(csrf.status, 200);
  const csrfToken = csrf.body.csrfToken;
  const csrfCookie = readCookie(csrf.headers["set-cookie"], "lf_csrf");
  assert.ok(csrfToken);
  assert.match(csrfCookie.full, /; Secure/i);
  assert.match(csrfCookie.full, /; SameSite=Lax/i);

  const login = await sendHttpsRequest({
    body: { password, username },
    headers: {
      ...forgedHeaders,
      cookie: csrfCookie.pair,
      origin: publicOrigin,
      "x-csrf-token": csrfToken,
    },
    method: "POST",
    pathName: "/api/login",
    proxyPort,
  });
  assert.equal(login.status, 200, login.text);
  assert.equal(login.body.user.username, username);
  const sessionCookie = readCookie(login.headers["set-cookie"], "longtail_forge_session");
  assert.match(sessionCookie.full, /; Secure/i);
  assert.match(sessionCookie.full, /; HttpOnly/i);
  assert.match(sessionCookie.full, /; SameSite=Lax/i);

  const session = await sendHttpsRequest({
    headers: { ...forgedHeaders, cookie: sessionCookie.pair },
    pathName: "/api/session",
    proxyPort,
  });
  assert.equal(session.status, 200);
  assert.equal(session.body.user.username, username);

  const crossOriginLogin = await sendHttpsRequest({
    body: { password: "not-the-real-password", username },
    headers: {
      ...forgedHeaders,
      cookie: csrfCookie.pair,
      origin: "https://attacker.invalid",
      "x-csrf-token": csrfToken,
    },
    method: "POST",
    pathName: "/api/login",
    proxyPort,
  });
  assert.equal(crossOriginLogin.status, 403);

  const appInfo = await sendHttpsRequest({ headers: forgedHeaders, pathName: "/api/app-info", proxyPort });
  assert.equal(appInfo.status, 200);
  assert.equal(appInfo.body.name, "Longtail Forge");

  const loginSecurityEvent = readLatestLoginSecurityEvent(databaseFile);
  assert.equal(loginSecurityEvent.action, "security.authentication.login_succeeded");
  assert.notEqual(loginSecurityEvent.ip_address, forgedClientIp);
  if (topology === "multi-proxy") {
    assert.equal(
      loginSecurityEvent.ip_address,
      multiProxyObservedClientIp,
      "the normalized proxy chain should preserve the outer edge's observed client address",
    );
  } else {
    assert.ok(["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(loginSecurityEvent.ip_address));
  }

  await stopProcess(caddyProcess);
  caddyProcess = null;
  await stopProcess(appProcess);
  appProcess = null;

  const logRecords = assertProductionJsonLogs(appOutput, { password, secureNotesKey });
  assert.ok(
    logRecords.some((record) => record.event === "http.request.completed" && record.requestId === health.headers["x-request-id"]),
    "the public response request ID should correlate to a production completion record",
  );

  console.log(JSON.stringify({
    appVersion: appInfo.body.version,
    caddyVersion,
    forgedClientIpRejected: true,
    health: health.body.status,
    loginSession: "passed",
    observedClientIp: loginSecurityEvent.ip_address,
    productionJsonLogs: logRecords.length,
    ready: ready.body.status,
    requestIdCorrelated: true,
    testOnlyScannerOverride: true,
    tls: "caddy-internal-ca",
    topology,
  }, null, 2));
} finally {
  await stopProcess(caddyProcess);
  await stopProcess(appProcess);
  await fs.rm(fixtureRoot, { force: true, recursive: true });
}

function createAppEnvironment({ appPort, databaseFile: dbFile, fixtureRoot: root, password: adminPassword, publicOrigin: origin, secureNotesKey: notesKey, username: adminUsername }) {
  const environment = {
    ...process.env,
    HOST: "127.0.0.1",
    LONGTAIL_AUTH_THROTTLE_ENABLED: "true",
    LONGTAIL_DATABASE_FILE: dbFile,
    LONGTAIL_DATABASE_PROVIDER: "sqlite",
    LONGTAIL_DATA_DIR: root,
    LONGTAIL_ENV: "production",
    LONGTAIL_FILE_SCANNER: "noop",
    LONGTAIL_HSTS_MAX_AGE_SECONDS: "300",
    LONGTAIL_LOCAL_STORAGE_ROOT: path.join(root, "files"),
    LONGTAIL_LOG_LEVEL: "info",
    LONGTAIL_PUBLIC_URL: origin,
    LONGTAIL_SECURE_NOTES_MASTER_KEY: notesKey,
    LONGTAIL_SESSION_COOKIE_SAMESITE: "Lax",
    LONGTAIL_SESSION_COOKIE_SECURE: "true",
    LONGTAIL_STORAGE_PROVIDER: "local",
    LONGTAIL_UNSAFE_ALLOW_DEBUG_LOGGING: "false",
    LONGTAIL_UNSAFE_ALLOW_DISABLED_AUTH_THROTTLE: "false",
    LONGTAIL_UNSAFE_ALLOW_HSTS_ROLLBACK: "false",
    LONGTAIL_UNSAFE_ALLOW_INSECURE_PUBLIC_URL: "false",
    LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS: "true",
    LONGTAIL_WORKER_MODE: "inline",
    NODE_ENV: "production",
    PORT: String(appPort),
    SUPER_ADMIN_PASSWORD: adminPassword,
    SUPER_ADMIN_USERNAME: adminUsername,
    TRUST_PROXY: "127.0.0.1/32,::1/128",
  };
  delete environment.LTF_REGRESSION_ACTIVE;
  delete environment.LTF_REGRESSION_BASELINE_DB;
  return environment;
}

function createLocalCaddyfile({
  appPort: upstreamPort,
  privateProxyPort: innerPort,
  proxyPort: tlsPort,
  topology: selectedTopology,
}) {
  if (selectedTopology === "multi-proxy") {
    return `{
\tadmin off
\tauto_https disable_redirects
\tskip_install_trust
\tservers {
\t\ttrusted_proxies static 127.0.0.1/32 ::1/128
\t\tclient_ip_headers X-Forwarded-For X-Real-IP
\t\ttrusted_proxies_strict
\t}
}

https://localhost:${tlsPort} {
\ttls internal
\treverse_proxy http://127.0.0.1:${innerPort} {
\t\theader_up X-Forwarded-For {http.request.remote.host}
\t\theader_up X-Forwarded-Proto https
\t\theader_up X-Forwarded-Host {http.request.host}
\t\theader_up -Forwarded
\t\theader_up -X-Real-IP
\t}
}

http://localhost:${innerPort} {
\t# bind mirrors the deployed topology: an explicit bind changes the listener
\t# address, which is why the trusted_proxies servers block must be address-less.
\tbind 127.0.0.1
\t@not_public_edge not remote_ip 127.0.0.1/32 ::1/128
\trespond @not_public_edge 403
\treverse_proxy 127.0.0.1:${upstreamPort} {
\t\theader_up X-Forwarded-For {client_ip}
\t\theader_up X-Forwarded-Proto {http.request.header.X-Forwarded-Proto}
\t\theader_up X-Forwarded-Host {http.request.header.X-Forwarded-Host}
\t}
}
`;
  }

  return `{
\tadmin off
\tauto_https disable_redirects
\tskip_install_trust
}

https://localhost:${tlsPort} {
\ttls internal
\treverse_proxy 127.0.0.1:${upstreamPort}
}
`;
}

function captureOutput(child, target) {
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => target.push(chunk));
  }
}

function assertProductionJsonLogs(chunks, secrets) {
  const lines = chunks.join("").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.ok(lines.length > 0, "production app should emit structured process output");
  const records = lines.map((line) => JSON.parse(line));

  for (const record of records) {
    assert.match(record.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(["debug", "error", "info", "trace", "warn"].includes(record.level));
    assert.match(record.event, /^[a-z0-9][a-z0-9._-]+$/);
    assert.equal(Object.hasOwn(record, "path"), false);
    assert.equal(Object.hasOwn(record, "url"), false);
  }

  const serialized = JSON.stringify(records);
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(secrets.password)));
  assert.doesNotMatch(serialized, new RegExp(escapeRegExp(secrets.secureNotesKey)));
  return records;
}

function readLatestLoginSecurityEvent(dbFile) {
  const database = new Database(dbFile, { readonly: true });
  try {
    return database.prepare(`
SELECT action, ip_address
FROM audit_logs
WHERE change_type = 'security'
  AND action = 'security.authentication.login_succeeded'
ORDER BY rowid DESC
LIMIT 1;
`).get();
  } finally {
    database.close();
  }
}

async function waitForResponse(requestFactory, expectedStatus, label) {
  const deadline = Date.now() + 30_000;
  let lastResult = null;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      lastResult = await requestFactory();
      if (lastResult.status === expectedStatus) {
        return lastResult;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`${label} did not reach status ${expectedStatus}; last status=${lastResult?.status || "none"} error=${lastError?.code || "none"}`);
}

function sendHttpRequest({ appPort: port, pathName }) {
  return sendRequest(http, { hostname: "127.0.0.1", path: pathName, port });
}

function sendHttpsRequest({ body, headers = {}, method = "GET", pathName, proxyPort: port }) {
  return sendRequest(https, {
    body,
    headers: { host: "localhost", ...headers },
    hostname: "127.0.0.1",
    localAddress: topology === "multi-proxy" ? multiProxyObservedClientIp : undefined,
    method,
    path: pathName,
    port,
    rejectUnauthorized: false,
    servername: "localhost",
  });
}

function sendRequest(client, options) {
  return new Promise((resolve, reject) => {
    const serializedBody = options.body === undefined ? null : JSON.stringify(options.body);
    const headers = { ...(options.headers || {}) };
    if (serializedBody !== null) {
      headers["content-type"] = "application/json";
      headers["content-length"] = Buffer.byteLength(serializedBody);
    }

    const request = client.request({ ...options, body: undefined, headers }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let body = null;
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
        resolve({ body, headers: response.headers, status: response.statusCode, text });
      });
    });
    request.on("error", reject);
    if (serializedBody !== null) {
      request.write(serializedBody);
    }
    request.end();
  });
}

function readCookie(setCookieHeader, name) {
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader].filter(Boolean);
  const full = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  assert.ok(full, `${name} cookie should be present`);
  return { full, pair: full.split(";", 1)[0] };
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("exit", (code) => {
      const result = { code, stderr: stderr.join(""), stdout: stdout.join("") };
      if (code === 0) {
        resolve(result);
        return;
      }
      reject(new Error(`${path.basename(command)} ${args[0]} failed with code ${code}: ${result.stderr.trim()}`));
    });
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const timeout = new Promise((resolve) => setTimeout(resolve, 3_000, "timeout"));
  if (await Promise.race([exited, timeout]) === "timeout" && child.exitCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
