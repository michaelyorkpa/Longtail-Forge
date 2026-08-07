import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePassword } from "../../src/security/passwords.js";
import { DEMO_PROFILE, DEVELOPMENT_PROFILE } from "./development-data-safety.mjs";

export const LOCAL_ROLE_FIXTURE_MODE = "local-sanitized-demo";
export const ROLE_CREDENTIALS_FILE_ENV = "LONGTAIL_SANITIZED_DEMO_ROLE_CREDENTIALS_FILE";
export const DEFAULT_ROLE_CREDENTIALS_FILE = ".local/sanitized-demo-role-credentials.json";
export const RT_LTF_DEMO_ROLE_FIXTURE_BINDING = Object.freeze({
  publicUrl: "https://demo.longtailforge.com",
  target: "rt-ltf-demo",
});

export const SANITIZED_DEMO_ROLE_FIXTURES = Object.freeze([
  roleFixture("super_admin", "Role Fixture Super Administrator", "role-super-admin@example.test", "all", "all", false),
  roleFixture("workspace_admin", "Role Fixture Workspace Administrator", "role-workspace-admin@example.test", "workspace", "northwind", true),
  roleFixture("client_admin", "Role Fixture Client Administrator", "role-client-admin@example.test", "client", "cedar", true),
  roleFixture("project_admin", "Role Fixture Project Administrator", "role-project-admin@example.test", "project", "website", true),
  roleFixture("client_user", "Role Fixture Client User", "role-client-user@example.test", "client", "cedar", true),
  roleFixture("project_user", "Role Fixture Project User", "role-project-user@example.test", "project", "website", true),
  roleFixture("client_external_user", "Role Fixture External Client User", "role-client-external-user@example.test", "client", "cedar", true),
]);

const EXPECTED_ROLE_IDS = Object.freeze(SANITIZED_DEMO_ROLE_FIXTURES.map((fixture) => fixture.roleId));
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PLACEHOLDER_PATTERN = /(?:<[^>]+>|change.?me|default|example.?password|replace.?me|shared.?password|longtail.?forge|super.?admin)/i;

export async function loadSanitizedDemoRoleFixtures({
  cwd = process.cwd(),
  credentialBinding = null,
  env = process.env,
  mode,
  target,
} = {}) {
  const credentialFileConfigured = Boolean(String(env[ROLE_CREDENTIALS_FILE_ENV] || "").trim());

  if (![DEVELOPMENT_PROFILE, DEMO_PROFILE].includes(target?.profile)) {
    if (mode || credentialFileConfigured) {
      throw new Error("Role-test identities are available only for the explicit pretty development/demo profiles.");
    }
    return null;
  }

  if (mode !== LOCAL_ROLE_FIXTURE_MODE) {
    throw new Error(`${target.profile} seeding requires --role-fixtures ${LOCAL_ROLE_FIXTURE_MODE}.`);
  }

  assertLocalOnlyEnvironment(env);

  const configuredPath = String(env[ROLE_CREDENTIALS_FILE_ENV] || DEFAULT_ROLE_CREDENTIALS_FILE).trim();
  const credentialsFile = path.resolve(cwd, configuredPath);
  await assertProtectedLocalCredentialFile(credentialsFile);
  const parsed = parseCredentialDocument(
    await fs.readFile(credentialsFile, "utf8"),
    credentialBinding,
  );
  const credentials = new Map();
  const normalizedPasswords = new Set();

  for (const fixture of SANITIZED_DEMO_ROLE_FIXTURES) {
    const password = String(parsed.passwords[fixture.roleId] || "");
    assertStrongUniquePassword(password, fixture, normalizedPasswords);
    normalizedPasswords.add(password);
    credentials.set(fixture.roleId, Object.freeze({
      ...fixture,
      password,
    }));
  }

  return Object.freeze({
    credentials,
    credentialsFile,
    credentialBinding: credentialBinding ? Object.freeze({ ...credentialBinding }) : null,
    fixtures: SANITIZED_DEMO_ROLE_FIXTURES,
    mode: LOCAL_ROLE_FIXTURE_MODE,
    usesBootstrapSuperAdmin: target.profile === DEMO_PROFILE,
  });
}

export function configureSanitizedDemoBootstrap(roleFixtures, env = process.env) {
  const superAdmin = roleFixtures?.credentials?.get("super_admin");
  if (!superAdmin) {
    throw new Error("Sanitized-demo Super Administrator credentials are missing.");
  }
  env.SUPER_ADMIN_USERNAME = superAdmin.username;
  env.SUPER_ADMIN_DISPLAY_NAME = superAdmin.displayName;
  env.SUPER_ADMIN_PASSWORD = superAdmin.password;
}

function roleFixture(roleId, displayName, username, scopeType, scopeKey, publicVisitor) {
  return Object.freeze({ displayName, publicVisitor, roleId, scopeKey, scopeType, username });
}

function parseCredentialDocument(source, credentialBinding) {
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Sanitized-demo role credential file must contain valid JSON.");
  }

  if (
    !parsed
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || parsed.version !== 1
    || !parsed.passwords
    || typeof parsed.passwords !== "object"
    || Array.isArray(parsed.passwords)
  ) {
    throw new Error("Sanitized-demo role credential file must contain version 1 and a passwords object.");
  }

  const expectedDocumentKeys = credentialBinding
    ? ["binding", "passwords", "version"]
    : ["passwords", "version"];
  const documentKeys = Object.keys(parsed).sort();
  if (documentKeys.join(",") !== expectedDocumentKeys.sort().join(",")) {
    throw new Error("Sanitized-demo role credential file contains unsupported fields.");
  }
  if (credentialBinding) {
    const binding = parsed.binding;
    if (
      !binding
      || typeof binding !== "object"
      || Array.isArray(binding)
      || Object.keys(binding).sort().join(",") !== "publicUrl,target"
      || binding.target !== credentialBinding.target
      || binding.publicUrl !== credentialBinding.publicUrl
    ) {
      throw new Error("Sanitized-demo role credential binding does not match the exact named demo installation.");
    }
  }

  const passwordKeys = Object.keys(parsed.passwords).sort();
  const expectedKeys = [...EXPECTED_ROLE_IDS].sort();
  if (passwordKeys.join(",") !== expectedKeys.join(",")) {
    throw new Error("Sanitized-demo role credential file must define exactly one password for every shipped role.");
  }

  return parsed;
}

function assertLocalOnlyEnvironment(env) {
  if (String(env.LONGTAIL_ENV || "development").trim().toLowerCase() !== "development") {
    throw new Error("Sanitized-demo role-test identities require LONGTAIL_ENV=development.");
  }
  if (String(env.LONGTAIL_RELEASE_BRANCH || "").trim()) {
    throw new Error("Sanitized-demo role-test identities are refused in a release/deployment runtime.");
  }

  const publicUrl = String(env.LONGTAIL_PUBLIC_URL || "").trim();
  if (publicUrl) {
    let hostname;
    try {
      hostname = new URL(publicUrl).hostname.toLowerCase();
    } catch {
      throw new Error("LONGTAIL_PUBLIC_URL must be a valid local URL for sanitized-demo role fixtures.");
    }
    if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
      throw new Error("Sanitized-demo role-test identities are restricted to a local loopback URL.");
    }
  }
}

async function assertProtectedLocalCredentialFile(credentialsFile) {
  const fileInfo = await fs.lstat(credentialsFile).catch((error) => {
    if (error?.code === "ENOENT") {
      throw new Error(`Create the ignored local credential file at ${displayCredentialPath(credentialsFile)} before seeding.`);
    }
    throw error;
  });
  if (!fileInfo.isFile() || fileInfo.isSymbolicLink()) {
    throw new Error("Sanitized-demo role credential source must be a regular, non-symbolic-link file.");
  }

  const realPath = await fs.realpath(credentialsFile);
  if (path.resolve(realPath) !== path.resolve(credentialsFile)) {
    throw new Error("Sanitized-demo role credential source must not use path indirection.");
  }

  const relativeToRepository = path.relative(REPOSITORY_ROOT, credentialsFile);
  const insideRepository = relativeToRepository
    && !relativeToRepository.startsWith("..")
    && !path.isAbsolute(relativeToRepository);
  if (insideRepository && relativeToRepository.split(path.sep)[0] !== ".local") {
    throw new Error("Repository-local role credentials must live under the git-ignored .local directory.");
  }
  if (insideRepository) {
    const tracked = spawnSync(
      "git",
      ["-C", REPOSITORY_ROOT, "ls-files", "--error-unmatch", "--", relativeToRepository],
      { encoding: "utf8" },
    );
    if (tracked.status === 0) {
      throw new Error("Sanitized-demo role credentials must not be tracked by Git.");
    }
    const ignored = spawnSync(
      "git",
      ["-C", REPOSITORY_ROOT, "check-ignore", "--quiet", "--", relativeToRepository],
      { encoding: "utf8" },
    );
    if (ignored.status !== 0) {
      throw new Error("Repository-local role credentials must be covered by the checked-in Git ignore policy.");
    }
  }
}

function assertStrongUniquePassword(password, fixture, normalizedPasswords) {
  if (password.length < 16) {
    throw new Error(`Password for ${fixture.roleId} must contain at least 16 characters.`);
  }
  if (PLACEHOLDER_PATTERN.test(password)) {
    throw new Error(`Password for ${fixture.roleId} must not be a documented, shared, or placeholder value.`);
  }
  const validation = validatePassword(password, fixture.username);
  if (!validation.valid) {
    throw new Error(`Password for ${fixture.roleId} does not meet the application password policy.`);
  }
  if (normalizedPasswords.has(password)) {
    throw new Error("Every sanitized-demo role password must be unique.");
  }
}

function displayCredentialPath(credentialsFile) {
  const relative = path.relative(REPOSITORY_ROOT, credentialsFile);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.replaceAll(path.sep, "/");
  }
  return "<local credential file>";
}
