// @ts-check

import {
  clientsRepository,
  clientsService,
  projectsRepository,
} from "../../src/modules/client-projects/index.js";

/** @type {import("../../src/types/client-project-contracts.d.ts").ClientProjectSession} */
const session = {
  active_workspace_id: "workspace-1",
  home_workspace_id: "workspace-1",
  ip_address: "127.0.0.1",
  password_change_required: false,
  session_mode: "normal",
  timezone: "America/New_York",
  user_id: "user-1",
  username: "user@example.test",
  workspace_id: "workspace-1",
};

void clientsRepository.readAll(session.workspace_id, { activeOnly: true });
void projectsRepository.readByNameInScope(session.workspace_id, "client-1", "Project name");
void clientsService.listClients(session, { include_depth: true, shape: "flat", status: "All" });
void clientsService.updateProject("project-1", { client_id: "client-2", parent_project_id: "" }, session);

// @ts-expect-error Clients/Projects workflows require an object-shaped request session.
void clientsService.listClients(42);

// @ts-expect-error Repository writes require the complete named client record contract.
void clientsRepository.create(session.workspace_id, { id: "client-1" });
