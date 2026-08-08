import { accountExportRecoveryRepository } from "../repositories/account-export-recovery.repo.js";
import { assertPublicDemoVisitorIdentityMutable } from "../core/public-demo-identities.js";
import { usersRepository } from "../repositories/users.repo.js";
import { AppError } from "../utils/app-error.js";
import { assertPublicDemoCapabilityAllowed } from "../core/public-demo-enforcement.js";
import {
  normalizeBooleanPreference,
  normalizeOptionalEmail,
  normalizeThemeAutoSource,
  normalizeThemeMode,
  normalizeTimezone,
} from "../utils/normalizers.js";

const RECOVERY_MODE = "account_export_recovery";

async function assertEligible(userId) {
  assertPublicDemoVisitorIdentityMutable(userId);
  const [qualification, hasActiveWorkspace, user] = await Promise.all([
    accountExportRecoveryRepository.readForUser(userId),
    accountExportRecoveryRepository.hasActiveWorkspace(userId),
    usersRepository.readFirstByUserId(userId),
  ]);
  if (!qualification || hasActiveWorkspace || user?.user_status !== "active") {
    throw new AppError("Account export recovery is not available.", 403);
  }
  return user;
}

async function exportPortableAccount(session) {
  assertPublicDemoCapabilityAllowed("exports.account");
  if (session?.session_mode !== RECOVERY_MODE || !session.user_id) {
    throw new AppError("Account export recovery is not available.", 403);
  }
  const user = await assertEligible(session.user_id);
  return {
    format: "longtail-forge-portable-account-data",
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    account: {
      email: user.username,
      displayName: user.display_name || user.username,
      alternateEmail: normalizeOptionalEmail(user.alt_email),
      timezone: normalizeTimezone(user.timezone),
    },
    preferences: {
      themeMode: normalizeThemeMode(user.theme_mode),
      themeAutoSource: normalizeThemeAutoSource(user.theme_auto_source),
      openExternalLinksNewTab: normalizeBooleanPreference(user.open_external_links_new_tab),
      loginLanding: user.preferred_login_landing || "dashboard",
      workspaceSwitchLanding: user.preferred_workspace_switch_landing || "dashboard",
    },
    scope: {
      includes: ["account profile", "account preferences"],
      excludes: [
        "credentials and sessions",
        "workspace backups",
        "workspace records and files",
        "workspace memberships and roles",
        "audit and security history",
        "internal identifiers",
      ],
    },
  };
}

export const accountExportRecoveryService = {
  assertEligible,
  exportPortableAccount,
};
