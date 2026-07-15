export const regressionMeta = Object.freeze({
  id: "framework.reference-internet-deployment",
  area: "framework",
  tier: "release-gate",
  tags: ["authentication", "deployment", "proxy", "security", "tls"],
  description: "Proves the supported private-preview Caddy topology, operator controls, known limits, and executable TLS proxy smoke contract stay aligned.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const deployment = readFileSync("docs/internet-deployment.md", "utf8");
const caddyfile = readFileSync("docs/Caddyfile.private-preview.example", "utf8");
const smoke = readFileSync("scripts/reference-caddy-security-smoke.mjs", "utf8");
const runtime = readFileSync("docs/runtime-configuration.md", "utf8");
const operations = readFileSync("docs/operational-security.md", "utf8");
const preview = readFileSync("docs/marketing/friends-and-family-preview.md", "utf8");

for (const requirement of [
  /Caddy is the only supported public edge/i,
  /DNS `A` record[\s\S]*`AAAA` record only when IPv6/i,
  /Allow inbound TCP 80 and 443 to Caddy/i,
  /Longtail Forge Node process at 127\.0\.0\.1:8001/i,
  /secret\/configuration files should be owner-readable only \(`0600`\)/i,
  /protected environment file/i,
  /SQLite database and sidecars, local Files root, worker lock files, and production log stream/i,
  /bounded retention, rotation, disk monitoring/i,
  /Backups must be written to a location separate from the live data tree/i,
  /maintainer-operated staged source deployments/i,
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

assert.match(deployment, /default `reverse_proxy` behavior ignores client-supplied `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host`/i);
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
assert.match(smoke, /\["127\.0\.0\.1", "::1", "::ffff:127\.0\.0\.1"\]/);

assert.match(runtime, /Supported single-proxy Caddy reference/i);
assert.match(operations, /pre-invitation/i);
assert.match(preview, /invitations remain blocked/i);

console.log("Reference internet deployment regression passed.");
