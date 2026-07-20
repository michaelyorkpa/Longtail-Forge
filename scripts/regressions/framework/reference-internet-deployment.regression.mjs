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

const deployment = readFileSync("docs/internet-deployment.md", "utf8");
const caddyfile = readFileSync("docs/Caddyfile.private-preview.example", "utf8");
const multiProxyCaddyfile = readFileSync("docs/Caddyfile.private-preview.multi-proxy.example", "utf8");
const nginx = readFileSync("docs/nginx-wireguard.private-preview.example.conf", "utf8");
const smoke = readFileSync("scripts/reference-caddy-security-smoke.mjs", "utf8");
const runtime = readFileSync("docs/runtime-configuration.md", "utf8");
const operations = readFileSync("docs/operational-security.md", "utf8");
const readiness = readFileSync("docs/private-preview-readiness.md", "utf8");
const preview = readFileSync("docs/marketing/friends-and-family-preview.md", "utf8");

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

for (const requirement of [
  /proxy_set_header X-Forwarded-For \$remote_addr/,
  /proxy_set_header X-Forwarded-Proto https/,
  /proxy_set_header X-Forwarded-Host \$host/,
  /proxy_set_header Forwarded ""/,
  /client_max_body_size 260m/,
  /proxy_request_buffering off/,
  /listen 443 ssl default_server/,
  /ssl_reject_handshake on/,
  /return 444/,
  /proxy_pass http:\/\/longtail_forge_private_preview/,
]) {
  assert.match(nginx, requirement);
}
assert.doesNotMatch(nginx, /\$proxy_add_x_forwarded_for/, "the public edge must replace, never append, client forwarding input");

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

assert.match(runtime, /Supported proxy references/i);
assert.match(runtime, /still trusts only (?:its immediate )?loopback Caddy/i);
assert.match(operations, /pre-invitation/i);
assert.match(readiness, /record `nginx -t`[\s\S]*exact WireGuard edge peer[\s\S]*forwarding-chain collapse[\s\S]*real client-IP attribution/i);
assert.match(preview, /invitations remain blocked/i);

console.log("Reference internet deployment regression passed.");
