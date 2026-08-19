export const regressionMeta = Object.freeze({
  id: "release.public-demo-isolation",
  area: "release",
  tier: "release-gate",
  tags: ["container", "demo", "jobs", "network", "security"],
  description: "Proves exact-demo outbound denial, environment and storage allowlists, loopback publishing, host firewall enforcement, and lifecycle-owned isolation smoke.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";

const [compose, isolation, deploy, reset, config, capabilities, operationalSecurity, runtimeConfiguration, workflow, attributes] = await Promise.all([
  fs.readFile("compose.yaml", "utf8"),
  fs.readFile("scripts/release/longtail-forge-public-demo-isolation-host.example", "utf8"),
  fs.readFile("scripts/release/longtail-forge-compose-deploy-host.example", "utf8"),
  fs.readFile("scripts/release/longtail-forge-public-demo-reset-host.example", "utf8"),
  fs.readFile("src/config.js", "utf8"),
  fs.readFile("src/core/public-demo-capabilities.js", "utf8"),
  fs.readFile("docs/operational-security.md", "utf8"),
  fs.readFile("docs/runtime-configuration.md", "utf8"),
  fs.readFile(".github/workflows/manual-release.yml", "utf8"),
  fs.readFile(".gitattributes", "utf8"),
]);

const serverSources = await readJavaScriptTree("src");
assert.doesNotMatch(
  serverSources,
  /\bfetch\s*\(|\bnode:https\b|\bnodemailer\b|\bundici\b|\bSMTPConnection\b/,
  "currently absent outbound transports must not acquire a server implementation without updating this release gate",
);

for (const capabilityId of [
  "outbound.analytics",
  "outbound.email",
  "outbound.feedback",
  "outbound.integrations",
  "outbound.interest_capture",
  "outbound.url_fetch",
  "outbound.webhooks",
]) {
  assert.ok(capabilities.includes('capability("' + capabilityId + '", PUBLIC_DEMO_CAPABILITY_CLASSIFICATIONS.DISABLED)'));
}
assert.match(config, /PUBLIC_DEMO_ALLOWED_RUNTIME_ENV_KEYS/);
assert.match(config, /LONGTAIL_S3_ACCESS_KEY_ID/);
assert.match(config, /PUBLIC_DEMO_EXTERNAL_ENV_KEY_PATTERN/);
assert.match(config, /only the reviewed public-demo runtime environment/);
assert.match(compose, /logging:[\s\S]*driver: local[\s\S]*max-size: 10m[\s\S]*max-file: "7"/);
assert.match(compose, /restart: \$\{LONGTAIL_RESTART_POLICY:-unless-stopped\}/);
assert.match(compose, /dns:[\s\S]*\$\{LONGTAIL_DNS_SERVER:-127\.0\.0\.11\}/);
for (const contract of [
  /longtail-forge-public-demo-internal/,
  /longtail-forge-public-demo-data/,
  /ltf-demo0/,
  /\.Internal == false/,
  /\.EnableIPv6 == false/,
  /com\.docker\.network\.bridge\.enable_ip_masquerade/,
  /iptables -w -A "\$INPUT_CHAIN" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT/,
  /iptables -w -A "\$INPUT_CHAIN" -d "\$SCANNER_HOST" -p tcp --dport "\$SCANNER_PORT" -j ACCEPT/,
  /iptables -w -A "\$INPUT_CHAIN" -j DROP/,
  /iptables -w -A "\$FORWARD_CHAIN" -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT/,
  /iptables -w -A "\$FORWARD_CHAIN" -j DROP/,
  /RestartPolicy\.Name == "no"/,
  /HostConfig\.Dns == \["127\.0\.0\.1"\]/,
  /HOSTNAME\|NODE_ENV\|NODE_VERSION/,
  /test -n "\$entry" \|\| continue/,
  /NetworkSettings\.Ports\["8001\/tcp"\][\s\S]*HostIp == "127\.0\.0\.1"[\s\S]*HostPort == "8001"/,
  /container environment contains an undeclared key/,
  /public-demo network contains an undeclared peer/,
  /LONGTAIL_STORAGE_PROVIDER == "local"/,
  /LONGTAIL_WORKER_MODE == "inline"/,
  /deny_connect_probe "\$SCANNER_HOST" 22/,
  /deny_connect_probe '1\.1\.1\.1' 443/,
  /dns\.lookup\("example\.com"/,
  /reviewed scanner handoff is unavailable/,
]) {
  assert.match(isolation, contract);
}
assert.match(deploy, /public_demo_isolation enforce "\$RELEASE_ENV"[\s\S]*verify_candidate_scanner/);
assert.match(deploy, /public_demo_isolation check "\$release_env"/);
assert.match(
  deploy,
  /prepare_public_demo_data_root\(\)[\s\S]*DEMO_MODE[\s\S]*compose "\$release_env" run --rm --no-deps --user 0:0 --cap-add CHOWN --cap-add DAC_OVERRIDE \\\n\s+longtail-forge node -e/,
  "The stopped exact-demo volume should regain only the two filesystem capabilities needed for its root ownership handoff.",
);
assert.match(
  deploy,
  /compose "\$release_env" stop longtail-forge\n\s+prepare_public_demo_data_root "\$release_env"[\s\S]*backup\.mjs create/,
  "The exact-demo volume root handoff should occur only after the SQLite service stops and before backup access.",
);
assert.match(deploy, /fs\.chownSync\(root, 0, 0\)[\s\S]*fs\.chmodSync\(root, 0o700\)[\s\S]*fs\.chownSync\(root, 10001, 10001\)/);
assert.deepEqual(
  [...deploy.matchAll(/--cap-add\s+([A-Z_]+)/g)].map((match) => match[1]),
  ["CHOWN", "DAC_OVERRIDE"],
  "The deploy helper should add only the exact public-demo volume-root capabilities.",
);
assert.doesNotMatch(deploy, /--privileged|--cap-add\s+(?!CHOWN(?:\s|\\)|DAC_OVERRIDE(?:\s|\\))/);
assert.match(reset, /public_demo_isolation enforce/);
assert.match(reset, /public_demo_isolation check/);
assert.match(workflow, /scripts\/release\/longtail-forge-public-demo-isolation-host\.example/);
assert.match(attributes, /^scripts\/release\/longtail-forge-public-demo-isolation-host\.example text eol=lf$/m);
for (const docs of [operationalSecurity, runtimeConfiguration]) {
  assert.match(docs, /public-demo outbound and infrastructure isolation/i);
  assert.match(docs, /longtail-forge-public-demo-isolation/i);
}
console.log("Public-demo outbound and infrastructure isolation regression passed.");

/**
 * @param {string} directory
 * @returns {Promise<string>}
 */
async function readJavaScriptTree(directory) {
  const sources = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = directory + "/" + entry.name;
    if (entry.isDirectory()) {
      sources.push(await readJavaScriptTree(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      sources.push(await fs.readFile(entryPath, "utf8"));
    }
  }
  return sources.join("\n");
}
