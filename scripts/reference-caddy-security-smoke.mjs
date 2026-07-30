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
const nginxPath = readOption("--nginx") || "nginx";
const opensslPath = readOption("--openssl") || "openssl";
const topology = readOption("--topology") || "direct-caddy";
if (!new Set(["direct-caddy", "multi-proxy"]).has(topology)) {
  throw new Error("--topology must be direct-caddy or multi-proxy");
}
const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-reference-caddy-"));
const appPort = await reservePort();
const proxyPort = await reservePort();
const privateProxyPort = topology === "multi-proxy" ? await reservePort() : null;
const redirectPort = topology === "multi-proxy" ? await reservePort() : null;
const publicOrigin = `https://localhost:${proxyPort}`;
const username = "reference-proxy-admin@example.test";
const password = "Reference-Proxy-Admin-Password-123!";
const secureNotesKey = "reference-proxy-secure-notes-key-material-123456789";
const forgedClientIp = "203.0.113.249";
const multiProxyObservedClientIp = "127.0.0.2";
const databaseFile = path.join(fixtureRoot, "reference-caddy.db");
const caddyfilePath = path.join(fixtureRoot, "Caddyfile");
const nginxConfigPath = path.join(fixtureRoot, "nginx.conf");
const nginxPrefixRoot = path.join(fixtureRoot, "nginx");
const nginxCertificatePath = path.join(fixtureRoot, "localhost.crt");
const nginxKeyPath = path.join(fixtureRoot, "localhost.key");
const maintenanceStateRoot = path.join(fixtureRoot, "maintenance-state");
const maintenanceAssetRoot = path.join(fixtureRoot, "maintenance-assets");
const edgeAssetRoot = path.join(fixtureRoot, "edge-assets");
const operatorMarker = path.join(maintenanceStateRoot, "operator", "maintenance.on");
const deploymentMarker = path.join(maintenanceStateRoot, "deployment", "maintenance.on");
const appOutput = [];
const caddyOutput = [];
const nginxOutput = [];
let appProcess = null;
let caddyProcess = null;
let nginxProcess = null;
let nginxVersion = null;

try {
  await Promise.all([
    fs.mkdir(path.join(fixtureRoot, "files"), { recursive: true, mode: 0o700 }),
    fs.mkdir(path.dirname(operatorMarker), { recursive: true, mode: 0o700 }),
    fs.mkdir(path.dirname(deploymentMarker), { recursive: true, mode: 0o700 }),
    fs.mkdir(maintenanceAssetRoot, { recursive: true, mode: 0o700 }),
    fs.mkdir(edgeAssetRoot, { recursive: true, mode: 0o700 }),
    fs.mkdir(path.join(nginxPrefixRoot, "client-body"), { recursive: true, mode: 0o700 }),
    fs.mkdir(path.join(nginxPrefixRoot, "fastcgi"), { recursive: true, mode: 0o700 }),
    fs.mkdir(path.join(nginxPrefixRoot, "proxy"), { recursive: true, mode: 0o700 }),
    fs.mkdir(path.join(nginxPrefixRoot, "scgi"), { recursive: true, mode: 0o700 }),
    fs.mkdir(path.join(nginxPrefixRoot, "uwsgi"), { recursive: true, mode: 0o700 }),
  ]);
  await fs.copyFile(
    path.join(rootDir, "scripts", "release", "longtail-forge-maintenance.html"),
    path.join(maintenanceAssetRoot, "maintenance.html"),
  );
  await fs.copyFile(
    path.join(rootDir, "scripts", "release", "longtail-forge-edge-unavailable.html"),
    path.join(edgeAssetRoot, "edge-unavailable.html"),
  );
  await fs.writeFile(caddyfilePath, createLocalCaddyfile({
    appPort,
    maintenanceAssetRoot,
    maintenanceStateRoot,
    privateProxyPort,
    proxyPort,
    topology,
  }));

  if (topology === "multi-proxy") {
    await runCommand(opensslPath, [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
      "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost",
      "-keyout", nginxKeyPath, "-out", nginxCertificatePath,
    ]);
    const nginxReference = await fs.readFile(
      path.join(rootDir, "docs", "nginx-wireguard.private-preview.example.conf"),
      "utf8",
    );
    await fs.writeFile(nginxConfigPath, createLocalNginxConfig({
      certificatePath: nginxCertificatePath,
      edgeAssetRoot,
      keyPath: nginxKeyPath,
      nginxPrefixRoot,
      privateProxyPort,
      proxyPort,
      redirectPort,
      reference: nginxReference,
    }));
    const versionResult = await runCommand(nginxPath, ["-v"]);
    nginxVersion = (versionResult.stderr || versionResult.stdout).trim();
    await runCommand(nginxPath, ["-t", "-p", `${normalizeNginxPath(nginxPrefixRoot)}/`, "-c", nginxConfigPath]);
  }

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

  appProcess = startAppProcess({
    appPort,
    databaseFile,
    fixtureRoot,
    output: appOutput,
    password,
    publicOrigin,
    secureNotesKey,
    username,
  });
  try {
    await waitForResponse(() => sendHttpRequest({ appPort, pathName: "/readyz" }), 200, "direct app readiness");
  } catch (error) {
    const captured = appOutput.join("").trim();
    throw new Error(`${error.message}${captured ? `\nCaptured app output:\n${captured}` : ""}`, {
      cause: error,
    });
  }

  caddyProcess = spawn(caddyPath, ["run", "--config", caddyfilePath, "--adapter", "caddyfile"], {
    cwd: fixtureRoot,
    env: caddyEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  captureOutput(caddyProcess, caddyOutput);

  if (topology === "multi-proxy") {
    nginxProcess = spawn(nginxPath, [
      "-p", `${normalizeNginxPath(nginxPrefixRoot)}/`,
      "-c", nginxConfigPath,
      "-g", "daemon off;",
    ], {
      cwd: fixtureRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    captureOutput(nginxProcess, nginxOutput);
  }

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

  if (topology === "multi-proxy") {
    await assertEdgeRequestRejected(
      () => sendHttpsRequest({ host: "unknown.example.test", pathName: "/", proxyPort }),
      "an unknown HTTP Host must be rejected at Nginx without reaching Longtail Forge",
    );
    await assertRequestFails(
      () => sendHttpsRequest({ pathName: "/", proxyPort, servername: "unknown.example.test" }),
      "an unknown TLS SNI name must be rejected during the handshake",
    );
  }

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
  const applicationNotFound = await sendHttpsRequest({
    headers: forgedHeaders,
    pathName: "/api/maintenance-smoke-not-found",
    proxyPort,
  });
  assert.equal(applicationNotFound.status, 401);
  assert.doesNotMatch(applicationNotFound.text, /Temporarily unavailable/);

  await fs.writeFile(operatorMarker, "");
  const operatorCurtain = await sendHttpsRequest({
    headers: forgedHeaders,
    pathName: "/login.html?maintenance=operator",
    proxyPort,
  });
  assertMaintenanceCurtain(operatorCurtain);

  const postCurtain = await sendHttpsRequest({
    body: { password: "must-not-reach-node", username },
    headers: forgedHeaders,
    method: "POST",
    pathName: "/api/login?maintenance=operator",
    proxyPort,
  });
  assertMaintenanceCurtain(postCurtain);

  const headCurtain = await sendHttpsRequest({
    headers: forgedHeaders,
    method: "HEAD",
    pathName: "/tasks.html?maintenance=operator",
    proxyPort,
  });
  assertMaintenanceCurtain(headCurtain, { expectBody: false });

  for (const [pathName, expectedBody] of [
    ["/healthz?maintenance=operator", { status: "ok" }],
    ["/readyz?maintenance=operator", { status: "ready" }],
  ]) {
    const diagnostic = await sendHttpsRequest({ headers: forgedHeaders, pathName, proxyPort });
    assert.equal(diagnostic.status, 200);
    assert.deepEqual(diagnostic.body, expectedBody);
    assert.equal(diagnostic.headers["cache-control"], "no-store");
  }
  const markedAppInfo = await sendHttpsRequest({
    headers: forgedHeaders,
    pathName: "/api/app-info?maintenance=operator",
    proxyPort,
  });
  assert.equal(markedAppInfo.status, 200);
  assert.equal(markedAppInfo.body.name, "Longtail Forge");

  for (const pathName of ["/healthz/", "/readyz/extra", "/api/app-info/extra"]) {
    assertMaintenanceCurtain(await sendHttpsRequest({ headers: forgedHeaders, pathName, proxyPort }));
  }

  await fs.writeFile(deploymentMarker, "");
  assertMaintenanceCurtain(await sendHttpsRequest({
    headers: forgedHeaders,
    pathName: "/?maintenance=both",
    proxyPort,
  }));
  await fs.unlink(operatorMarker);
  assertMaintenanceCurtain(await sendHttpsRequest({
    headers: forgedHeaders,
    pathName: "/?maintenance=deployment",
    proxyPort,
  }));
  await fs.unlink(deploymentMarker);
  const markerRecovery = await sendHttpsRequest({
    headers: forgedHeaders,
    pathName: "/login.html?maintenance=off",
    proxyPort,
  });
  assert.equal(markerRecovery.status, 200);
  assert.match(markerRecovery.text, /Longtail Forge/);
  assert.doesNotMatch(markerRecovery.text, /Temporarily unavailable/);

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

  await stopProcess(appProcess);
  appProcess = null;

  const outageCurtain = await waitForResponse(
    () => sendHttpsRequest({
      headers: forgedHeaders,
      pathName: "/workbench.html?maintenance=upstream",
      proxyPort,
    }),
    503,
    "upstream outage curtain",
  );
  assertMaintenanceCurtain(outageCurtain);
  assertMaintenanceCurtain(await sendHttpsRequest({
    body: { attempt: "during-outage" },
    headers: forgedHeaders,
    method: "POST",
    pathName: "/api/session?maintenance=upstream",
    proxyPort,
  }));

  for (const pathName of ["/healthz", "/readyz?during=outage", "/api/app-info"]) {
    const diagnostic = await sendHttpsRequest({ headers: forgedHeaders, pathName, proxyPort });
    assert.equal(diagnostic.status, 503);
    assert.deepEqual(diagnostic.body, { status: "unavailable" });
    assert.equal(diagnostic.headers["cache-control"], "no-store");
    assert.match(diagnostic.headers["content-type"], /^application\/json/);
    assert.doesNotMatch(diagnostic.text, /Longtail Forge|Temporarily unavailable/);
  }

  appProcess = startAppProcess({
    appPort,
    databaseFile,
    fixtureRoot,
    output: appOutput,
    password,
    publicOrigin,
    secureNotesKey,
    username,
  });
  await waitForResponse(() => sendHttpRequest({ appPort, pathName: "/readyz" }), 200, "restarted app readiness");
  const recoveredReady = await waitForResponse(
    () => sendHttpsRequest({ headers: forgedHeaders, pathName: "/readyz?recovered=1", proxyPort }),
    200,
    "proxy recovery without reload",
  );
  assert.deepEqual(recoveredReady.body, { status: "ready" });
  const recoveredPage = await sendHttpsRequest({
    headers: forgedHeaders,
    pathName: "/login.html?recovered=1",
    proxyPort,
  });
  assert.equal(recoveredPage.status, 200);
  assert.doesNotMatch(recoveredPage.text, /Temporarily unavailable/);

  if (topology === "multi-proxy") {
    await stopProcess(caddyProcess);
    caddyProcess = null;

    const edgeFallback = await waitForResponse(
      () => sendHttpsRequest({ headers: forgedHeaders, pathName: "/workbench.html?edge=transport", proxyPort }),
      503,
      "Nginx-owned transport fallback",
    );
    assertEdgeFallback(edgeFallback);

    for (const pathName of ["/healthz", "/readyz?edge=transport", "/api/app-info"]) {
      const diagnostic = await sendHttpsRequest({ headers: forgedHeaders, pathName, proxyPort });
      assert.equal(diagnostic.status, 503);
      assert.deepEqual(diagnostic.body, { status: "unavailable" });
      assert.equal(diagnostic.headers["cache-control"], "no-store");
      assert.equal(diagnostic.headers["retry-after"], "60");
      assert.match(diagnostic.headers["content-type"], /^application\/json/);
      assert.doesNotMatch(diagnostic.text, /Connection unavailable|Temporarily unavailable/);
    }

    const internalRoute = await sendHttpsRequest({
      headers: forgedHeaders,
      pathName: "/__longtail_forge_edge_unavailable",
      proxyPort,
    });
    assert.equal(internalRoute.status, 404);
    assert.doesNotMatch(internalRoute.text, /data-response-owner="public-edge"/);

    caddyProcess = spawn(caddyPath, ["run", "--config", caddyfilePath, "--adapter", "caddyfile"], {
      cwd: fixtureRoot,
      env: caddyEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    captureOutput(caddyProcess, caddyOutput);
    const edgeRecovery = await waitForResponse(
      () => sendHttpsRequest({ headers: forgedHeaders, pathName: "/readyz?edge=recovered", proxyPort }),
      200,
      "private Caddy recovery without an Nginx reload",
    );
    assert.deepEqual(edgeRecovery.body, { status: "ready" });
  }

  if (topology === "multi-proxy") {
    await stopProcess(nginxProcess);
    nginxProcess = null;
    await assertRequestFails(
      () => sendHttpsRequest({ pathName: "/login.html?edge=down", proxyPort }),
      "a stopped public edge must remain a connection failure",
    );
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
    maintenanceCurtain: "passed",
    markerRecoveryWithoutReload: true,
    nginxConfigurationValidated: topology === "multi-proxy",
    nginxTransportFallback: topology === "multi-proxy" ? "passed" : "not-applicable",
    nginxVersion,
    observedClientIp: loginSecurityEvent.ip_address,
    productionJsonLogs: logRecords.length,
    ready: ready.body.status,
    requestIdCorrelated: true,
    testOnlyScannerOverride: true,
    tls: topology === "multi-proxy" ? "nginx-disposable-self-signed" : "caddy-internal-ca",
    topology,
    upstreamOutageRecoveryWithoutReload: true,
  }, null, 2));
} finally {
  await stopProcess(nginxProcess);
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

function createLocalNginxConfig({
  certificatePath,
  edgeAssetRoot,
  keyPath,
  nginxPrefixRoot,
  privateProxyPort: innerPort,
  proxyPort: tlsPort,
  redirectPort: httpPort,
  reference,
}) {
  const fixtureReference = reference
    .replace(/^\s*listen \[::\]:80(?: default_server)?;\r?\n/gm, "")
    .replace(/^\s*listen \[::\]:443 ssl(?: http2| default_server)?;\r?\n/gm, "")
    .replace("ssl_certificate /etc/letsencrypt/live/forge.example.com/fullchain.pem;", `ssl_certificate ${normalizeNginxPath(certificatePath)};`)
    .replace("ssl_certificate_key /etc/letsencrypt/live/forge.example.com/privkey.pem;", `ssl_certificate_key ${normalizeNginxPath(keyPath)};`)
    .replaceAll("10.57.67.2:8080", `127.0.0.1:${innerPort}`)
    .replaceAll("/usr/local/share/longtail-forge-edge", normalizeNginxPath(edgeAssetRoot))
    .replaceAll("forge.example.com", "localhost")
    .replaceAll("listen 80;", `listen 127.0.0.1:${httpPort};`)
    .replaceAll("listen 80 default_server;", `listen 127.0.0.1:${httpPort} default_server;`)
    .replaceAll("listen 443 ssl http2;", `listen 127.0.0.1:${tlsPort} ssl;`)
    .replaceAll("listen 443 ssl default_server;", `listen 127.0.0.1:${tlsPort} ssl default_server;`);

  return `worker_processes 1;
pid ${normalizeNginxPath(path.join(nginxPrefixRoot, "nginx.pid"))};
error_log stderr notice;

events { worker_connections 128; }

http {
    access_log off;
    client_body_temp_path ${normalizeNginxPath(path.join(nginxPrefixRoot, "client-body"))};
    fastcgi_temp_path ${normalizeNginxPath(path.join(nginxPrefixRoot, "fastcgi"))};
    proxy_temp_path ${normalizeNginxPath(path.join(nginxPrefixRoot, "proxy"))};
    scgi_temp_path ${normalizeNginxPath(path.join(nginxPrefixRoot, "scgi"))};
    uwsgi_temp_path ${normalizeNginxPath(path.join(nginxPrefixRoot, "uwsgi"))};

${fixtureReference}
}
`;
}

function normalizeNginxPath(value) {
  return String(value).replaceAll("\\", "/");
}

function createLocalCaddyfile({
  appPort: upstreamPort,
  maintenanceAssetRoot,
  maintenanceStateRoot,
  privateProxyPort: innerPort,
  proxyPort: tlsPort,
  topology: selectedTopology,
}) {
  const maintenanceSnippets = createMaintenanceSnippets({
    assetRoot: maintenanceAssetRoot,
    stateRoot: maintenanceStateRoot,
  });
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

${maintenanceSnippets}

http://localhost:${innerPort} {
\t# bind mirrors the deployed topology: an explicit bind changes the listener
\t# address, which is why the trusted_proxies servers block must be address-less.
\tbind 127.0.0.1
\t@not_public_edge not remote_ip 127.0.0.1/32 ::1/128
\trespond @not_public_edge 403

\t@longtail_diagnostic path /healthz /readyz /api/app-info
\thandle @longtail_diagnostic {
\t\treverse_proxy 127.0.0.1:${upstreamPort} {
\t\t\theader_up X-Forwarded-For {client_ip}
\t\t\theader_up X-Forwarded-Proto {http.request.header.X-Forwarded-Proto}
\t\t\theader_up X-Forwarded-Host {http.request.header.X-Forwarded-Host}
\t\t}
\t}

\t@longtail_maintenance_active file {
\t\troot ${quoteCaddyPath(maintenanceStateRoot)}
\t\ttry_files /operator/maintenance.on /deployment/maintenance.on
\t}
\thandle @longtail_maintenance_active {
\t\timport longtail_maintenance_curtain
\t}

\thandle {
\t\treverse_proxy 127.0.0.1:${upstreamPort} {
\t\t\theader_up X-Forwarded-For {client_ip}
\t\t\theader_up X-Forwarded-Proto {http.request.header.X-Forwarded-Proto}
\t\t\theader_up X-Forwarded-Host {http.request.header.X-Forwarded-Host}
\t\t}
\t}

\thandle_errors {
\t\t@longtail_diagnostic_failure path /healthz /readyz /api/app-info
\t\thandle @longtail_diagnostic_failure {
\t\t\timport longtail_unavailable_diagnostic
\t\t}
\t\thandle {
\t\t\timport longtail_maintenance_curtain
\t\t}
\t}
}
`;
  }

  return `{
\tadmin off
\tauto_https disable_redirects
\tskip_install_trust
}

${maintenanceSnippets}

https://localhost:${tlsPort} {
\ttls internal

\t@longtail_diagnostic path /healthz /readyz /api/app-info
\thandle @longtail_diagnostic {
\t\treverse_proxy 127.0.0.1:${upstreamPort}
\t}

\t@longtail_maintenance_active file {
\t\troot ${quoteCaddyPath(maintenanceStateRoot)}
\t\ttry_files /operator/maintenance.on /deployment/maintenance.on
\t}
\thandle @longtail_maintenance_active {
\t\timport longtail_maintenance_curtain
\t}

\thandle {
\t\treverse_proxy 127.0.0.1:${upstreamPort}
\t}

\thandle_errors {
\t\t@longtail_diagnostic_failure path /healthz /readyz /api/app-info
\t\thandle @longtail_diagnostic_failure {
\t\t\timport longtail_unavailable_diagnostic
\t\t}
\t\thandle {
\t\t\timport longtail_maintenance_curtain
\t\t}
\t}
}
`;
}

function createMaintenanceSnippets({ assetRoot, stateRoot }) {
  assert.ok(assetRoot);
  assert.ok(stateRoot);
  return `(longtail_maintenance_curtain) {
\theader {
\t\tCache-Control "no-store"
\t\tContent-Security-Policy "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'"
\t\tPermissions-Policy "camera=(), geolocation=(), microphone=(), payment=(), usb=()"
\t\tReferrer-Policy "no-referrer"
\t\tRetry-After "60"
\t\tStrict-Transport-Security "max-age=300"
\t\tX-Content-Type-Options "nosniff"
\t\tX-Frame-Options "DENY"
\t}
\trewrite * /maintenance.html
\tfile_server {
\t\troot ${quoteCaddyPath(assetRoot)}
\t\tstatus 503
\t}
}

(longtail_unavailable_diagnostic) {
\theader {
\t\tCache-Control "no-store"
\t\tContent-Type "application/json"
\t\tRetry-After "60"
\t\tStrict-Transport-Security "max-age=300"
\t\tX-Content-Type-Options "nosniff"
\t}
\trespond \`{"status":"unavailable"}\` 503
}`;
}

function startAppProcess({
  appPort,
  databaseFile: dbFile,
  fixtureRoot: root,
  output,
  password: adminPassword,
  publicOrigin: origin,
  secureNotesKey: notesKey,
  username: adminUsername,
}) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: createAppEnvironment({
      appPort,
      databaseFile: dbFile,
      fixtureRoot: root,
      password: adminPassword,
      publicOrigin: origin,
      secureNotesKey: notesKey,
      username: adminUsername,
    }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  captureOutput(child, output);
  return child;
}

function assertMaintenanceCurtain(response, options = {}) {
  const expectBody = options.expectBody !== false;
  assert.equal(response.status, 503, response.text);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.match(response.headers["content-type"], /^text\/html/);
  assert.equal(response.headers["retry-after"], "60");
  assert.equal(response.headers["strict-transport-security"], "max-age=300");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.match(response.headers["content-security-policy"], /default-src 'none'/);
  assert.match(response.headers["content-security-policy"], /style-src 'unsafe-inline'/);
  assert.match(response.headers["permissions-policy"], /camera=\(\)/);
  if (expectBody) {
    assert.match(response.text, /Longtail Forge is not available right now/);
    assert.match(response.text, /http-equiv="refresh" content="60"/);
  } else {
    assert.equal(response.text, "");
  }
}

function assertEdgeFallback(response) {
  assert.equal(response.status, 503, response.text);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.match(response.headers["content-type"], /^text\/html/);
  assert.equal(response.headers["retry-after"], "60");
  assert.equal(response.headers["strict-transport-security"], "max-age=300");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.match(response.headers["content-security-policy"], /default-src 'none'/);
  assert.match(response.headers["permissions-policy"], /camera=\(\)/);
  assert.match(response.text, /data-response-owner="public-edge"/);
  assert.match(response.text, /Connection unavailable/);
  assert.doesNotMatch(response.text, /Temporarily unavailable/);
}

async function assertRequestFails(requestFactory, message) {
  try {
    const response = await requestFactory();
    assert.fail(`${message}; received HTTP ${response?.status ?? "unknown"}`);
  } catch (error) {
    if (error?.code === "ERR_ASSERTION") {
      throw error;
    }
  }
}

async function assertEdgeRequestRejected(requestFactory, message) {
  try {
    const response = await requestFactory();
    assert.ok(
      new Set([400, 404, 421, 444]).has(response.status),
      `${message}; received unexpected HTTP ${response.status}`,
    );
    assert.equal(response.headers["x-request-id"], undefined, `${message}; application request ID was present`);
    assert.doesNotMatch(response.text, /Longtail Forge/i, `${message}; application content was present`);
  } catch (error) {
    if (error?.code === "ERR_ASSERTION") {
      throw error;
    }
  }
}

function quoteCaddyPath(value) {
  return `"${String(value).replaceAll("\\", "/").replaceAll('"', '\\"')}"`;
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

function sendHttpsRequest({ body, headers = {}, host = "localhost", method = "GET", pathName, proxyPort: port, servername = "localhost" }) {
  return sendRequest(https, {
    body,
    headers: { host, ...headers },
    hostname: "127.0.0.1",
    localAddress: topology === "multi-proxy" ? multiProxyObservedClientIp : undefined,
    method,
    path: pathName,
    port,
    rejectUnauthorized: false,
    servername,
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
