import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CANONICAL_DATABASE_FILE = path.join(root, "data", "longtail-forge.db");

function captureCanonicalWorkspaceInventory(databaseFile = CANONICAL_DATABASE_FILE) {
  const resolvedDatabaseFile = path.resolve(databaseFile);

  if (!fs.existsSync(resolvedDatabaseFile)) {
    return {
      databaseFile: resolvedDatabaseFile,
      exists: false,
      fingerprint: "missing",
      membershipCount: 0,
      workspaceCount: 0,
    };
  }

  const database = new Database(resolvedDatabaseFile, { fileMustExist: true, readonly: true });

  try {
    const hasWorkspaces = database.prepare(`
SELECT COUNT(1) AS count
FROM sqlite_master
WHERE type = 'table'
  AND name = 'workspaces';
`).get();

    if (Number(hasWorkspaces?.count) === 0) {
      return {
        databaseFile: resolvedDatabaseFile,
        exists: true,
        fingerprint: hashRows([]),
        membershipCount: 0,
        workspaceCount: 0,
      };
    }

    const workspaces = database.prepare(`
SELECT workspace_id, name, status, workspace_type, owner_user_id
FROM workspaces
ORDER BY workspace_id;
`).all();
    const memberships = database.prepare(`
SELECT user_workspace_id, user_id, workspace_id, status
FROM user_workspaces
ORDER BY user_workspace_id;
`).all();

    return {
      databaseFile: resolvedDatabaseFile,
      exists: true,
      fingerprint: hashRows([workspaces, memberships]),
      membershipCount: memberships.length,
      workspaceCount: workspaces.length,
    };
  } finally {
    database.close();
  }
}

function assertCanonicalWorkspaceInventoryUnchanged(before, after) {
  if (
    before.exists !== after.exists ||
    before.fingerprint !== after.fingerprint ||
    before.membershipCount !== after.membershipCount ||
    before.workspaceCount !== after.workspaceCount
  ) {
    throw new Error(
      "Regression database isolation failed: the canonical workspace or membership inventory changed during the suite. " +
      `Before=${JSON.stringify(summary(before))}; after=${JSON.stringify(summary(after))}.`,
    );
  }
}

function hashRows(rows) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function summary(inventory) {
  return {
    exists: inventory.exists,
    fingerprint: inventory.fingerprint,
    membershipCount: inventory.membershipCount,
    workspaceCount: inventory.workspaceCount,
  };
}

export {
  CANONICAL_DATABASE_FILE,
  assertCanonicalWorkspaceInventoryUnchanged,
  captureCanonicalWorkspaceInventory,
};
