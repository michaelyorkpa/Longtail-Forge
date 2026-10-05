// @ts-check

import { modulesService } from "../../src/core/modules/modules.service.js";
import { appShellService } from "../../src/services/app-shell.service.js";
import { filesService } from "../../src/services/files.service.js";

/** @type {import("../../src/types/http-contracts.js").WorkspaceRequestSession} */
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

void appShellService.bootstrap(session);
void filesService.getFileStorageAdapter("local");
void modulesService.setModuleStatus("workspace-1", "notes", true, { session });

// @ts-expect-error App-shell services require a complete workspace request session.
void appShellService.bootstrap({ workspace_id: "workspace-1" });

// @ts-expect-error File storage provider identifiers must be strings.
void filesService.getFileStorageAdapter(42);

// @ts-expect-error Module lifecycle options accept a precise session, not legacy actor-only metadata.
void modulesService.setModuleStatus("workspace-1", "notes", true, { actorUserId: "user-1" });
