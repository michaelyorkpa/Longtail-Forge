function taskCalendarRecurrenceInstanceKey(templateId, instanceDate) {
  return `${String(templateId || "").trim()}:${String(instanceDate || "").trim()}`;
}

function taskCalendarResource(record) {
  return {
    workspace_id: record?.workspace_id || "",
    client_id: record?.client_id || "",
    project_id: record?.project_id || "",
  };
}

export {
  taskCalendarRecurrenceInstanceKey,
  taskCalendarResource,
};
