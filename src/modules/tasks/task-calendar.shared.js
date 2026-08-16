/** @param {unknown} templateId @param {unknown} instanceDate */
function taskCalendarRecurrenceInstanceKey(templateId, instanceDate) {
  return `${String(templateId || "").trim()}:${String(instanceDate || "").trim()}`;
}

/**
 * @param {Partial<import("../../types/task-recurrence-contracts.d.ts").TaskRecord | import("../../types/task-recurrence-contracts.d.ts").TaskRecurrenceTemplate>} record
 * @returns {import("../../types/http-contracts.d.ts").PermissionResource}
 */
function taskCalendarResource(record) {
  return {
    workspace_id: record?.workspace_id || "",
    client_id: record?.project_id
      ? record?.project_client_id || ""
      : record?.client_id || "",
    project_id: record?.project_id || "",
  };
}

export {
  taskCalendarRecurrenceInstanceKey,
  taskCalendarResource,
};
