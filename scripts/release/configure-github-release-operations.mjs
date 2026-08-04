#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const options = parseArgs(process.argv.slice(2));
const plan = buildPlan(options.repo);

if (!options.apply) {
  console.log(JSON.stringify({ ok: true, mode: "plan", repository: options.repo, operations: plan.map(({ label }) => label) }, null, 2));
  process.exit(0);
}

for (const operation of plan) {
  operation.run();
  console.log(`Configured: ${operation.label}`);
}
console.log(JSON.stringify({ ok: true, mode: "apply", repository: options.repo, operations: plan.length }));

function buildPlan(repo) {
  return [
    operation("repository merge and security settings", () => {
      api("PATCH", `/repos/${repo}`, { delete_branch_on_merge: true, allow_auto_merge: false });
      api("PUT", `/repos/${repo}/vulnerability-alerts`);
      api("PUT", `/repos/${repo}/automated-security-fixes`);
    }),
    operation("GitHub-owned SHA-pinned Actions policy", () => {
      api("PUT", `/repos/${repo}/actions/permissions`, { enabled: true, allowed_actions: "selected", sha_pinning_required: true });
      api("PUT", `/repos/${repo}/actions/permissions/selected-actions`, { github_owned_allowed: true, verified_allowed: false, patterns_allowed: [] });
    }),
    operation("demo-development environment and nightly-only policy", () => configureEnvironment(repo, "demo-development", "nightly", "ssh-root-owned-host-helper")),
    operation("friends-and-family-preview environment and main-only policy", () => configureEnvironment(repo, "friends-and-family-preview", "main", "ssh-compose-digest-host-helper")),
    operation("nightly branch protection", () => protectBranch(repo, "nightly", [
      "Development gate",
      "Browser smoke and accessibility",
      "Complete maintenance release rehearsal",
      "Dependency review",
      "CodeQL JavaScript analysis",
    ])),
    operation("main branch protection", () => protectBranch(repo, "main", [
      "Promotion source",
      "Release gate",
      "Browser gate",
      "Packaging and recovery",
      "Dependency review",
      "CodeQL JavaScript analysis",
    ])),
  ];
}

function configureEnvironment(repo, environment, branch, transport) {
  const encoded = encodeURIComponent(environment);
  api("PUT", `/repos/${repo}/environments/${encoded}`, {
    wait_timer: 0,
    prevent_self_review: false,
    reviewers: [],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
  });
  const policies = api("GET", `/repos/${repo}/environments/${encoded}/deployment-branch-policies`);
  if (!policies.branch_policies?.some((policy) => policy.name === branch && policy.type === "branch")) {
    api("POST", `/repos/${repo}/environments/${encoded}/deployment-branch-policies`, { name: branch, type: "branch" });
  }
  upsertEnvironmentVariable(repo, encoded, "DEPLOY_ENABLED", "false");
  upsertEnvironmentVariable(repo, encoded, "DEPLOY_TRANSPORT", transport);
  if (transport === "ssh-compose-digest-host-helper") {
    upsertEnvironmentVariable(repo, encoded, "COMPOSE_DEPLOY_INBOX", "/var/lib/longtail-forge-compose-deploy/inbox");
    upsertEnvironmentVariable(repo, encoded, "COMPOSE_DEPLOY_HELPER", "/usr/local/sbin/longtail-forge-compose-deploy");
  }
}

function upsertEnvironmentVariable(repo, encodedEnvironment, name, value) {
  const existing = api("GET", `/repos/${repo}/environments/${encodedEnvironment}/variables`);
  if (existing.variables?.some((variable) => variable.name === name)) {
    api("PATCH", `/repos/${repo}/environments/${encodedEnvironment}/variables/${name}`, { name, value });
  } else {
    api("POST", `/repos/${repo}/environments/${encodedEnvironment}/variables`, { name, value });
  }
}

function protectBranch(repo, branch, contexts) {
  api("PUT", `/repos/${repo}/branches/${encodeURIComponent(branch)}/protection`, {
    required_status_checks: { strict: true, contexts },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      required_approving_review_count: 0,
      require_last_push_approval: false,
    },
    restrictions: null,
    required_conversation_resolution: true,
    required_linear_history: false,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    lock_branch: false,
    allow_fork_syncing: true,
  });
}

function api(method, endpoint, body) {
  const args = ["api", "--method", method, endpoint];
  const input = body === undefined ? undefined : JSON.stringify(body);
  if (input !== undefined) args.push("--input", "-");
  const result = spawnSync("gh", args, { encoding: "utf8", input });
  if (result.status !== 0) throw new Error(`GitHub API ${method} ${endpoint} failed: ${String(result.stderr || result.stdout).trim()}`);
  const output = String(result.stdout || "").trim();
  return output ? JSON.parse(output) : {};
}

function operation(label, run) {
  return { label, run };
}

function parseArgs(args) {
  const options = { apply: false, repo: "michaelyorkpa/Longtail-Forge" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--repo") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--repo requires owner/name.");
      options.repo = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown GitHub configuration argument: ${arg}`);
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(options.repo)) throw new Error("--repo must use owner/name.");
  return options;
}

export const __test = { buildPlan, parseArgs };
