/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTarget} LinkTarget */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetCandidate} LinkTargetCandidate */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetType} LinkTargetType */

/** @type {Readonly<Record<LinkTargetType, string>>} */
const UNAVAILABLE_LABEL_BY_TARGET_TYPE = Object.freeze({
  workspace: "Workspace",
  client: "Unavailable client",
  project: "Unavailable project",
  task: "Unavailable task",
  note: "Unavailable note",
  list: "Unavailable list",
  user: "Unavailable linked context",
});

/** @param {LinkTargetCandidate} target @returns {LinkTarget} */
function shapeLinkTarget(target) {
  const fallbackLabel = safeTargetFallbackLabel(target.targetType);
  const label = target.label || fallbackLabel;
  const displayLabel = target.displayLabel || label;
  const secondaryLabel = target.secondaryLabel || target.subtitle || "";
  const workspaceId = target.workspaceId || (target.targetType === "workspace" ? target.targetId : "");

  return {
    moduleId: target.moduleId || "",
    targetType: target.targetType,
    targetId: target.targetId,
    label,
    subtitle: target.subtitle || "",
    displayLabel,
    secondaryLabel,
    sortKey: target.sortKey || sortText(displayLabel),
    sourceUrl: target.sourceUrl || targetSourceUrl(target.targetType, target.targetId),
    title: target.title || "",
    fullLabel: target.fullLabel || "",
    ariaLabel: target.ariaLabel || "",
    clientId: target.clientId || "",
    clientName: target.clientName || "",
    listId: target.listId || "",
    noteId: target.noteId || "",
    projectId: target.projectId || "",
    projectName: target.projectName || "",
    workspaceId,
    workspaceName: target.workspaceName || "",
    taskId: target.taskId || "",
    userId: target.userId || "",
    isAvailable: target.isAvailable ?? true,
    status: target.status || "",
    suggestedLibraryBucket: target.suggestedLibraryBucket || "",
    ...(target.unavailable ? { unavailable: true } : {}),
  };
}

/** @param {LinkTargetType} targetType @param {string} targetId @returns {LinkTarget} */
function safeUnavailableLinkTarget(targetType, targetId) {
  const label = safeTargetFallbackLabel(targetType);
  return shapeLinkTarget({
    targetType,
    targetId,
    label,
    displayLabel: label,
    fullLabel: label,
    ariaLabel: label,
    sortKey: sortText(label),
    sourceUrl: "",
    isAvailable: false,
    unavailable: true,
  });
}

/** @param {LinkTargetType} targetType */
function safeTargetFallbackLabel(targetType) {
  return UNAVAILABLE_LABEL_BY_TARGET_TYPE[targetType] || "Unavailable linked context";
}

/** @param {unknown} value @param {LinkTargetType} targetType */
function readableTargetLabel(value, targetType) {
  return textValue(value) || safeTargetFallbackLabel(targetType);
}

/** @param {LinkTargetType} targetType @param {string} targetId */
function targetSourceUrl(targetType, targetId) {
  if (targetType === "workspace") return "dashboard.html";
  if (targetType === "client") return `clients.html?client=${encodeURIComponent(targetId)}`;
  if (targetType === "project") return `projects.html?project=${encodeURIComponent(targetId)}`;
  if (targetType === "task") return `tasks.html?task=${encodeURIComponent(targetId)}`;
  if (targetType === "note") return `notes.html?note=${encodeURIComponent(targetId)}`;
  if (targetType === "list") return `lists.html?list=${encodeURIComponent(targetId)}`;
  if (targetType === "user") return "settings.html";
  return "";
}

/** @param {unknown} value */
function sortText(value) {
  return textValue(value).toLowerCase();
}

/** @param {unknown} value */
function textValue(value) {
  return String(value ?? "").trim();
}

export {
  readableTargetLabel,
  safeTargetFallbackLabel,
  safeUnavailableLinkTarget,
  shapeLinkTarget,
  sortText,
  targetSourceUrl,
  textValue,
};
