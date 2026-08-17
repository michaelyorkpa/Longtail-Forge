import type { PermissionResource } from "./http-contracts.d.ts";

export interface TaskStatusRow extends PermissionResource {
  task_id: string;
  workspace_id: string;
  status: string;
}
