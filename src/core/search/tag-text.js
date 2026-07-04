import { db } from "../database.js";

async function readSearchTagsText({ workspaceId, targetType, targetId }) {
  const normalizedWorkspaceId = String(workspaceId || "").trim();
  const normalizedTargetType = String(targetType || "").trim();
  const normalizedTargetId = String(targetId || "").trim();

  if (!normalizedWorkspaceId || !normalizedTargetType || !normalizedTargetId) {
    return "";
  }

  const rows = await db.query(`
SELECT tags.name, tags.slug
FROM tag_assignments
INNER JOIN tags
  ON tags.workspace_id = tag_assignments.workspace_id
  AND tags.tag_id = tag_assignments.tag_id
WHERE tag_assignments.workspace_id = :workspaceId
  AND tag_assignments.target_type = :targetType
  AND tag_assignments.target_id = :targetId
  AND tags.status = 'active'
ORDER BY lower(tags.name), lower(tags.slug);
`, {
    targetId: normalizedTargetId,
    targetType: normalizedTargetType,
    workspaceId: normalizedWorkspaceId,
  });

  return rows
    .flatMap((row) => [row.name, row.slug])
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
}

export { readSearchTagsText };
