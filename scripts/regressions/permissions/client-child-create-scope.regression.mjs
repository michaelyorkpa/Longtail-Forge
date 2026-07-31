export const regressionMeta = Object.freeze({
  id: "permissions.client-child-create-scope",
  area: "permissions",
  tier: "focused",
  tags: ["client-projects", "permissions", "public-api", "views"],
  description: "Pins parent-scoped child-client creation, workspace-scoped top-level creation, and the Clients-owned Add Child Client affordance.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const [serviceSource, browserRouteSource, publicApiSource, publicApiRouteSource, moduleSource, browserSource] = await Promise.all([
  readText("src/modules/client-projects/clients.service.js"),
  readText("src/modules/client-projects/clients.routes.js"),
  readText("src/services/public-api.service.js"),
  readText("src/routes/public-api.routes.js"),
  readText("src/modules/client-projects/module.js"),
  readText("public/js/clients-projects.js"),
]);

assert.match(
  serviceSource,
  /async function createClient[\s\S]*normalizeClientPayload[\s\S]*if \(client\.parent_client_id\)[\s\S]*client_id: client\.parent_client_id[\s\S]*operation: "update"[\s\S]*validateClientParent[\s\S]*else \{[\s\S]*operation: "create"/,
  "Client creation should authorize a child against its requested parent and a top-level Client against workspace scope.",
);
assert.match(
  serviceSource,
  /async function listClients[\s\S]*createPermissionEvaluator\(session, "clients\.manage", \{[\s\S]*operation: "update"[\s\S]*can_create_child/,
  "Client rows should receive a server-shaped Add Child capability.",
);
assert.match(
  serviceSource,
  /async function readClientProjects[\s\S]*can_create_child: canCreateChildClient\([\s\S]*can_create_top_level_client: workspaceSettings\.workspaceType === "business" && canCreateTopLevelClient/,
  "The dialog read model should expose only Business-safe top-level and record-scoped create capabilities.",
);

assert.match(
  browserRouteSource,
  /clientsRoutes\.post\("\/clients"[\s\S]*clientsService\.createClient\(payload, request\.session\)/,
  "The browser route should retain the shared Clients service authorization path.",
);
assert.match(
  publicApiRouteSource,
  /publicApiRoutes\.post\("\/api\/v1\/clients"[\s\S]*publicApiService\.createClient\(request\.apiSession, payload\)/,
  "The public API route should retain the shared public API service path.",
);
assert.match(
  publicApiSource,
  /async function createClient\(context, payload\)[\s\S]*clientsService\.createClient\(\{[\s\S]*\}, context\)/,
  "The public API service should delegate Client creation to the same scoped Clients service.",
);

assert.match(
  moduleSource,
  /id: "add-child-client"[\s\S]*icon: "add"[\s\S]*iconOnly: true[\s\S]*title: "Add Child Client"[\s\S]*behavior: "client-projects\.clients\.create-child"[\s\S]*visibleWhen: \{ field: "canCreateChild", equals: true \}/,
  "The Clients descriptor should declare one record-scoped Add Child Client action.",
);
assert.match(
  moduleSource,
  /canCreateChild: "can_create_child"/,
  "The Clients descriptor should bind the server-shaped child-create capability.",
);
assert.match(
  moduleSource,
  /targetType: "client",[\s\S]*?workspaceField: "workspace_id",\s*clientField: "id",\s*requiredReadPermission: "clients\.manage"/,
  "Client tag targets should authorize against the Client record itself.",
);
assert.match(
  browserSource,
  /registerBehavior\("client-projects\.clients\.create-child"[\s\S]*lockParentClient: true[\s\S]*parentClientId: params\.recordId/,
  "The Add Child behavior should bind and lock the selected Client as parent.",
);
assert.match(
  browserSource,
  /function withoutUnavailableTopLevelActions[\s\S]*surface\.id === "client-projects\.clients"[\s\S]*canCreateTopLevelClient\(\)[\s\S]*primaryAction: null/,
  "The Clients page should remove the top-level action when workspace-scoped creation is unavailable.",
);
assert.match(
  browserSource,
  /if \(!parentClientId && !canCreateTopLevelClient\(\)\)[\s\S]*Choose Add Child Client from a client you administer/,
  "Generic Client action dispatch should not open a top-level form for a scoped administrator.",
);
assert.match(
  browserSource,
  /const lockParentClient = params\.lockParentClient === true \|\| !canCreateTopLevelClient\(\)[\s\S]*function openAddClientDialog\([\s\S]*lockParentClient[\s\S]*parentSelect\.disabled = true[\s\S]*title: lockParentClient \? "Add Child Client" : "Add Client"/,
  "The child-client dialog should identify and lock its authorized parent context.",
);
assert.match(
  browserSource,
  /function createAddClientShortcutButton[\s\S]*!canCreateTopLevelClient\(\)[\s\S]*return null/,
  "Top-level Add Client shortcuts should stay hidden when only child creation is allowed.",
);

console.log("Client child-create scope regression passed.");

function readText(relativePath) {
  return fs.readFile(path.join(root, relativePath), "utf8");
}
