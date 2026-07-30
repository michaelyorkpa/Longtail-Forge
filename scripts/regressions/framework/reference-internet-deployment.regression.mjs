export const regressionMeta = Object.freeze({
  id: "framework.reference-internet-deployment",
  area: "framework",
  tier: "release-gate",
  tags: ["authentication", "deployment", "proxy", "security", "tls"],
  description: "Proves the supported direct-Caddy and bounded Nginx/WireGuard/Caddy topologies, operator controls, and executable proxy smokes stay aligned.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";

const deployment = readFileSync("docs/internet-deployment.md", "utf8");
const caddyfile = readFileSync("docs/Caddyfile.private-preview.example", "utf8");
const multiProxyCaddyfile = readFileSync("docs/Caddyfile.private-preview.multi-proxy.example", "utf8");
const nginx = readFileSync("docs/nginx-wireguard.private-preview.example.conf", "utf8");
const smoke = readFileSync("scripts/reference-caddy-security-smoke.mjs", "utf8");
const edgeFallback = readFileSync("scripts/release/longtail-forge-edge-unavailable.html", "utf8");
const developmentWorkflow = readFileSync(".github/workflows/development-pr.yml", "utf8");
const runtime = readFileSync("docs/runtime-configuration.md", "utf8");
const operations = readFileSync("docs/operational-security.md", "utf8");
const readiness = readFileSync("docs/private-preview-readiness.md", "utf8");
const preview = readFileSync("docs/marketing/friends-and-family-preview.md", "utf8");
const roadmapArchive = readFileSync("ROADMAP-ARCHIVE.md", "utf8");
const changelog = readFileSync("CHANGELOG.md", "utf8");

for (const requirement of [
  /two reviewed Longtail Forge private-internet-preview proxy topologies/i,
  /Nginx \(public edge, TLS termination, forwarding-header replacement\)/i,
  /private WireGuard HTTP; edge peer allowlisted at firewall and Caddy/i,
  /verified forwarding chain collapsed to one client IP/i,
  /DNS `A` record[\s\S]*`AAAA` record only when IPv6/i,
  /Allow public inbound Longtail Forge application traffic only on TCP 80 and 443/i,
  /administrator SSH.*GitHub deployment transport.*separate management plane/is,
  /key-only authentication.*pinned host key.*exact-helper-only passwordless sudo boundary/is,
  /Longtail Forge Node process at 127\.0\.0\.1:8001/i,
  /secret\/configuration files should be owner-readable only \(`0600`\)/i,
  /protected environment file/i,
  /SQLite database and sidecars, local Files root, worker lock files, and production log stream/i,
  /bounded retention, rotation, disk monitoring/i,
  /Backups must be written to a location separate from the live data tree/i,
  /checksummed versioned runtime artifact/i,
  /`\/healthz`.*`\/readyz`/is,
  /Emergency containment and access revocation/i,
  /Active Sessions.*revoke/is,
  /deactivate.*account/is,
  /roughly 50 total users, and typical active use around 5-15 concurrent users/i,
  /not hosted SaaS, multi-node high availability, an enterprise deployment, or a public launch/i,
  /not received external penetration testing, independent security certification, a compliance audit, or a guarantee of perfect internet safety/i,
]) {
  assert.match(deployment, requirement);
}

assert.match(deployment, /default `reverse_proxy` behavior:[\s\S]*ignores client-supplied `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host`/i);
assert.match(deployment, /checks `\/var\/lib\/longtail-forge-maintenance\/operator\/maintenance\.on` and `\/var\/lib\/longtail-forge-maintenance\/deployment\/maintenance\.on` on every request/i);
assert.match(deployment, /exact paths `\/healthz`, `\/readyz`, and `\/api\/app-info` bypass both markers/i);
assert.match(deployment, /generic `503 \{"status":"unavailable"\}` JSON/i);
assert.match(deployment, /connection-level reverse-proxy failure serves the same safe maintenance page/i);
assert.match(deployment, /recover without a reload/i);
assert.match(deployment, /without a second authentication gate/i);
assert.match(deployment, /test-only unscanned-upload override/i);
assert.match(deployment, /That override is forbidden in the real preview/i);
assert.match(deployment, /Until those gates pass, this reference closeout does not authorize invitations/i);

assert.match(caddyfile, /admin 127\.0\.0\.1:2019/);
assert.match(caddyfile, /\{\$LONGTAIL_PUBLIC_HOST\}/);
assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:8001/);
assert.match(caddyfile, /default X-Forwarded-\* behavior/i);
assert.doesNotMatch(caddyfile, /(?:basic_auth|basicauth|forward_auth)/i, "the application login remains the only required authentication gate");
assert.doesNotMatch(caddyfile, /header_up|trusted_proxies/i, "the supported edge should retain Caddy's reviewed forwarding defaults");

for (const [label, proxyConfig] of [
  ["direct Caddy", caddyfile],
  ["private multi-proxy Caddy", multiProxyCaddyfile],
]) {
  for (const requirement of [
    /@longtail_diagnostic path \/healthz \/readyz \/api\/app-info/,
    /handle @longtail_diagnostic \{[\s\S]*reverse_proxy 127\.0\.0\.1:8001/,
    /@longtail_diagnostic path \/healthz \/readyz \/api\/app-info[\s\S]*@longtail_maintenance_active file \{[\s\S]*handle @longtail_maintenance_active \{[\s\S]*handle \{\s*reverse_proxy 127\.0\.0\.1:8001/,
    /@longtail_maintenance_active file \{[\s\S]*root \/var\/lib\/longtail-forge-maintenance[\s\S]*try_files \/operator\/maintenance\.on \/deployment\/maintenance\.on/,
    /handle @longtail_maintenance_active \{[\s\S]*import longtail_maintenance_curtain/,
    /Cache-Control "no-store"/,
    /Content-Security-Policy "default-src 'none';[^"]*style-src 'unsafe-inline'"/,
    /Permissions-Policy "camera=\(\), geolocation=\(\), microphone=\(\), payment=\(\), usb=\(\)"/,
    /Retry-After "60"/,
    /Strict-Transport-Security "max-age=300"/,
    /X-Content-Type-Options "nosniff"/,
    /X-Frame-Options "DENY"/,
    /rewrite \* \/maintenance\.html/,
    /root \/usr\/local\/share\/longtail-forge-maintenance/,
    /status 503/,
    /handle_errors \{[\s\S]*@longtail_diagnostic_failure path \/healthz \/readyz \/api\/app-info/,
    /respond `\{"status":"unavailable"\}` 503/,
  ]) {
    assert.match(proxyConfig, requirement, `${label} should retain the reviewed maintenance routing contract`);
  }
}

for (const requirement of [
  /proxy_set_header X-Forwarded-For \$remote_addr/,
  /proxy_set_header X-Forwarded-Proto https/,
  /proxy_set_header X-Forwarded-Host \$host/,
  /proxy_set_header Forwarded ""/,
  /client_max_body_size 260m/,
  /proxy_request_buffering off/,
  /limit_req_zone \$binary_remote_addr zone=longtail_forge_login:10m rate=10r\/m/,
  /location = \/api\/login \{[\s\S]*limit_req zone=longtail_forge_login burst=5 nodelay;[\s\S]*limit_req_status 429/,
  /location @longtail_forge_login_limited \{[\s\S]*add_header Cache-Control "no-store" always;[\s\S]*add_header Retry-After "60" always;[\s\S]*add_header Strict-Transport-Security "max-age=300" always;[\s\S]*add_header X-Content-Type-Options "nosniff" always;[\s\S]*return 429 '\{"error":"Too many attempts\. Try again later\."\}'/,
  /listen 443 ssl default_server/,
  /ssl_reject_handshake on/,
  /return 444/,
  /proxy_pass http:\/\/longtail_forge_private_preview/,
  /proxy_intercept_errors off/,
  /error_page 502 503 504 =503 \/__longtail_forge_edge_unavailable/,
  /location = \/__longtail_forge_edge_unavailable \{[\s\S]*internal;[\s\S]*root \/usr\/local\/share\/longtail-forge-edge;[\s\S]*try_files \/edge-unavailable\.html =503/,
  /location ~ \^\/(?:\(\?:)?healthz\|readyz\|api\/app-info\)\$/,
  /error_page 502 503 504 =503 @longtail_forge_edge_diagnostic_unavailable/,
  /location @longtail_forge_edge_diagnostic_unavailable \{[\s\S]*return 503 '\{"status":"unavailable"\}'/,
  /Content-Security-Policy "default-src 'none';[^\n]*style-src 'unsafe-inline'" always/,
  /Permissions-Policy "camera=\(\), geolocation=\(\), microphone=\(\), payment=\(\), usb=\(\)" always/,
  /Retry-After "60" always/,
]) {
  assert.match(nginx, requirement);
}
assert.doesNotMatch(nginx, /\$proxy_add_x_forwarded_for/, "the public edge must replace, never append, client forwarding input");
assert.doesNotMatch(
  nginx,
  /limit_req_zone\s+\$(?:http_|proxy_|sent_http_)/,
  "the login request limit must use the accepted connection IP rather than a client-supplied forwarding header",
);
assert.doesNotMatch(nginx, /autoindex\s+on|alias\s+/, "the internal fallback must not expose an edge file server");
assert.equal((nginx.match(/proxy_intercept_errors off;/g) || []).length, 1);
assert.equal(
  [...nginx.matchAll(/if \(\$host != forge\.example\.com\) \{ return 444; \}/g)].length,
  2,
  "both named public listeners should reject a mismatched normalized Host even after SNI selection",
);

for (const requirement of [
  /data-response-owner="public-edge"/,
  /Connection unavailable/,
  /cannot reach Longtail Forge right now/,
  /http-equiv="refresh" content="60"/,
  /prefers-color-scheme:dark/,
]) {
  assert.match(edgeFallback, requirement);
}
assert.doesNotMatch(edgeFallback, /<script|https?:\/\/|scheduled|backup|data (?:is|are) safe/i);

for (const requirement of [
  /auto_https off/,
  /servers \{[\s\S]*trusted_proxies static \{\$LONGTAIL_EDGE_WIREGUARD_PEER\}/,
  /client_ip_headers X-Forwarded-For X-Real-IP/,
  /trusted_proxies_strict/,
  /bind \{\$LONGTAIL_CADDY_WIREGUARD_ADDRESS\}/,
  /not remote_ip \{\$LONGTAIL_EDGE_WIREGUARD_PEER\}/,
  /header_up X-Forwarded-For \{client_ip\}/,
  /header_up X-Forwarded-Proto \{http\.request\.header\.X-Forwarded-Proto\}/,
  /header_up X-Forwarded-Host \{http\.request\.header\.X-Forwarded-Host\}/,
  /reverse_proxy 127\.0\.0\.1:8001/,
]) {
  assert.match(multiProxyCaddyfile, requirement);
}
assert.doesNotMatch(
  multiProxyCaddyfile,
  /^\s*servers :/m,
  "the trusted_proxies servers block must stay address-less; with bind, an addressed block matches no listener and {client_ip} falls back to the TCP peer",
);

for (const proof of [
  /LONGTAIL_ENV: "production"/,
  /LONGTAIL_SESSION_COOKIE_SECURE: "true"/,
  /TRUST_PROXY: "127\.0\.0\.1\/32,::1\/128"/,
  /LONGTAIL_HSTS_MAX_AGE_SECONDS: "300"/,
  /"x-forwarded-for": forgedClientIp/,
  /"x-forwarded-host": "attacker\.invalid"/,
  /"x-forwarded-proto": "http"/,
  /"strict-transport-security".*"max-age=300"/,
  /"content-security-policy"/,
  /"x-csrf-token": csrfToken/,
  /longtail_forge_session/,
  /security\.authentication\.login_succeeded/,
  /assertProductionJsonLogs/,
  /requestIdCorrelated: true/,
  /assertMaintenanceCurtain/,
  /operatorMarker/,
  /deploymentMarker/,
  /maintenance=both/,
  /must-not-reach-node/,
  /method: "HEAD"/,
  /\/healthz\/"/,
  /status: "unavailable"/,
  /upstream outage curtain/,
  /proxy recovery without reload/,
  /applicationNotFound\.status, 401/,
  /markerRecoveryWithoutReload: true/,
  /upstreamOutageRecoveryWithoutReload: true/,
  /const nginxPath = readOption\("--nginx"\) \|\| "nginx"/,
  /runCommand\(nginxPath, \["-t"/,
  /spawn\(nginxPath/,
  /docs", "nginx-wireguard\.private-preview\.example\.conf"/,
  /Nginx-owned transport fallback/,
  /assertEdgeFallback\(edgeFallback\)/,
  /private Caddy recovery without an Nginx reload/,
  /__longtail_forge_edge_unavailable/,
  /unknown HTTP Host must be rejected at Nginx/,
  /assertEdgeRequestRejected/,
  /application request ID was present/,
  /application content was present/,
  /unknown TLS SNI name must be rejected/,
  /stopped public edge must remain a connection failure/,
]) {
  assert.match(smoke, proof);
}
assert.match(smoke, /assert\.notEqual\(loginSecurityEvent\.ip_address, forgedClientIp\)/);
assert.match(smoke, /loginSecurityEvent\.ip_address,[\s\S]*multiProxyObservedClientIp/);
assert.match(smoke, /\["127\.0\.0\.1", "::1", "::ffff:127\.0\.0\.1"\]/);
assert.match(smoke, /"direct-caddy", "multi-proxy"/);
assert.match(smoke, /trusted_proxies static 127\.0\.0\.1\/32 ::1\/128/);
assert.match(smoke, /trusted_proxies_strict/);
assert.match(smoke, /header_up X-Forwarded-For \{client_ip\}/);
assert.match(smoke, /header_up X-Forwarded-Proto \{http\.request\.header\.X-Forwarded-Proto\}/);
assert.doesNotMatch(smoke, /https:\/\/localhost:\$\{tlsPort\} \{[\s\S]{0,300}reverse_proxy http:\/\/127\.0\.0\.1:\$\{innerPort\}/);

for (const requirement of [
  /bounded-proxy-smoke:/,
  /sudo apt-get install --yes --no-install-recommends nginx openssl/,
  /CADDY_VERSION: 2\.11\.4/,
  /sha512sum --check --strict/,
  /npm run maintenance:rehearse/,
]) {
  assert.match(developmentWorkflow, requirement);
}

assert.match(runtime, /Supported proxy references/i);
assert.match(runtime, /still trusts only (?:its immediate )?loopback Caddy/i);
assert.match(operations, /pre-invitation/i);
assert.match(readiness, /record `nginx -t`[\s\S]*exact WireGuard edge peer[\s\S]*forwarding-chain collapse[\s\S]*real client-IP attribution/i);
assert.match(preview, /invitations remain blocked/i);
assertRoadmapCursorAtLeast(["0", "33", "24", "3"].join("."), "private-Caddy maintenance routing closeout");
assert.match(roadmapArchive, /^## Version 0\.33\.24\.2 - Private-Caddy maintenance routing and Node-outage fallback$/m);
assert.match(roadmapArchive, /0\.33\.24\.2[\s\S]*- \[x\] Extended both disposable Caddy topologies/);
assert.match(changelog, /^## Version 0\.33\.24\.2 - 2026-07-28$/m);
assertRoadmapCursorAtLeast(["0", "33", "24", "7"].join("."), "public-Nginx transport fallback closeout");
assert.match(roadmapArchive, /^## Version 0\.33\.24\.6 - Public-Nginx transport fallback and response ownership$/m);
assert.match(roadmapArchive, /0\.33\.24\.6[\s\S]*- \[x\] Replaced the simulated outer proxy[\s\S]*real Nginx/);
assert.match(changelog, /^## Version 0\.33\.24\.6 - 2026-07-28$/m);

console.log("Reference internet deployment regression passed.");
