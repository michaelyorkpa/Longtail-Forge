// @ts-check

const PUBLIC_DEMO_VISITOR_PASSWORDS = Object.freeze({
  workspace_admin: "Explore-Workspace-2026!",
  client_admin: "Explore-ClientAdmin-2026!",
  project_admin: "Explore-ProjectAdmin-2026!",
  client_user: "Explore-ClientUser-2026!",
  project_user: "Explore-ProjectUser-2026!",
  client_external_user: "Explore-ExternalUser-2026!",
});

/** @typedef {keyof typeof PUBLIC_DEMO_VISITOR_PASSWORDS} PublicDemoVisitorRoleId */
/** @typedef {{ allowedActions: string[], expectedDenials: string[], representativeRecords: string[], roleId: PublicDemoVisitorRoleId, roleName: string, scopeLabel: string, username: string }} PublicDemoVisitorAccountInput */

const PUBLIC_DEMO_VISITOR_ACCOUNTS = Object.freeze([
  visitorAccount({
    roleId: "workspace_admin",
    roleName: "Workspace Administrator",
    username: "role-workspace-admin@example.test",
    scopeLabel: "Northwind Studio workspace",
    representativeRecords: ["Northwind Studio", "Cedar & Bloom", "Website Refresh"],
    allowedActions: ["Review work across Northwind Studio", "Create and update scoped records", "Record time for Website Refresh"],
    expectedDenials: ["Installation administration and Super Admin access", "Permanent deletion, exports, and API keys"],
  }),
  visitorAccount({
    roleId: "client_admin",
    roleName: "Client Administrator",
    username: "role-client-admin@example.test",
    scopeLabel: "Cedar & Bloom client",
    representativeRecords: ["Cedar & Bloom", "Website Refresh"],
    allowedActions: ["Review Cedar & Bloom projects and tasks", "Delegate supported roles inside the client", "Record time for Website Refresh"],
    expectedDenials: ["Other clients and workspaces", "Workspace and installation administration"],
  }),
  visitorAccount({
    roleId: "project_admin",
    roleName: "Project Administrator",
    username: "role-project-admin@example.test",
    scopeLabel: "Website Refresh project",
    representativeRecords: ["Cedar & Bloom / Website Refresh"],
    allowedActions: ["Review and update Website Refresh work", "Delegate Project User access for this project", "Record time for Website Refresh"],
    expectedDenials: ["Other projects, clients, and workspaces", "Client, workspace, and installation administration"],
  }),
  visitorAccount({
    roleId: "client_user",
    roleName: "Client User",
    username: "role-client-user@example.test",
    scopeLabel: "Cedar & Bloom client",
    representativeRecords: ["Cedar & Bloom", "Website Refresh"],
    allowedActions: ["Review assigned Cedar & Bloom work", "Update permitted scoped records", "Record time for Website Refresh"],
    expectedDenials: ["Role delegation and administration", "Other clients and workspaces"],
  }),
  visitorAccount({
    roleId: "project_user",
    roleName: "Project User",
    username: "role-project-user@example.test",
    scopeLabel: "Website Refresh project",
    representativeRecords: ["Cedar & Bloom / Website Refresh"],
    allowedActions: ["Review assigned Website Refresh work", "Update permitted project records", "Record time for Website Refresh"],
    expectedDenials: ["Role delegation and administration", "Other projects and workspaces"],
  }),
  visitorAccount({
    roleId: "client_external_user",
    roleName: "Client User (External)",
    username: "role-client-external-user@example.test",
    scopeLabel: "Cedar & Bloom client",
    representativeRecords: ["Cedar & Bloom", "Website Refresh"],
    allowedActions: ["Review shared Cedar & Bloom work", "Contribute to permitted scoped records", "Record time for Website Refresh"],
    expectedDenials: ["Internal administration and role delegation", "Other clients and workspaces"],
  }),
]);

function listPublicDemoVisitorAccounts() {
  return PUBLIC_DEMO_VISITOR_ACCOUNTS.map((account) => Object.freeze({
    allowedActions: account.allowedActions,
    expectedDenials: account.expectedDenials,
    password: account.password,
    representativeRecords: account.representativeRecords,
    roleName: account.roleName,
    scopeLabel: account.scopeLabel,
    username: account.username,
  }));
}

/** @param {PublicDemoVisitorAccountInput} input */
function visitorAccount({
  allowedActions,
  expectedDenials,
  representativeRecords,
  roleId,
  roleName,
  scopeLabel,
  username,
}) {
  return Object.freeze({
    allowedActions: Object.freeze([...allowedActions]),
    expectedDenials: Object.freeze([...expectedDenials]),
    password: PUBLIC_DEMO_VISITOR_PASSWORDS[roleId],
    representativeRecords: Object.freeze([...representativeRecords]),
    roleId,
    roleName,
    scopeLabel,
    username,
  });
}

export {
  PUBLIC_DEMO_VISITOR_ACCOUNTS,
  PUBLIC_DEMO_VISITOR_PASSWORDS,
  listPublicDemoVisitorAccounts,
};
