import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.6.11";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-tags-repository-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-tags-repository-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Tags-Repository-Conversion-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const tagsRepoSource = readText("src/repositories/tags.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { closeSqlite, initializeDatabase, querySql, sqlText } = await import("../src/db/index.js");
const { tagsRepository } = await import("../src/repositories/tags.repo.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const fixture = await readFixture();
  await assertTagsRepositoryRuntime(fixture);
  await assertIntegrity();

  console.log("Tags repository conversion regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the Tags repository conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Tags repository conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Tags repository conversion version");

  assert.match(tagsRepoSource, /import \{ db \} from "\.\.\/core\/database\.js";/, "tags repo should import the provider-neutral db facade");
  assert.doesNotMatch(tagsRepoSource, /\.\.\/db\/index\.js/, "tags repo should not import legacy db helpers after conversion");
  assert.doesNotMatch(tagsRepoSource, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, "tags repo should be fully off literal helpers and compatibility query wrappers");

  for (const functionName of [
    "createTag",
    "updateTag",
    "setTagStatus",
    "listTags",
    "readTagById",
    "readTagBySlug",
    "readTagsByIds",
    "listAssignmentsForTarget",
    "listAssignmentsForTargets",
    "addAssignment",
    "removeAssignment",
    "removeAssignmentById",
    "readAssignmentById",
    "listAssignmentsForPropagationContext",
    "hasSuppression",
    "addSuppression",
    "listSuppressionsForTarget",
  ]) {
    assertConvertedFunction(functionName);
  }

  assertFunctionUsesPatterns("listTags", [
    /db\.dialect\.comparison\.likeNoCase\("tags\.name", ":searchPattern"\)/,
    /db\.dialect\.comparison\.likeNoCase\("tags\.slug", ":searchPattern"\)/,
    /db\.dialect\.comparison\.orderByNoCase\("tags\.name", "ASC"\)/,
  ]);
  assertFunctionUsesPatterns("readTagsByIds", [
    /tag_id IN \(:tagIds\)/,
    /db\.dialect\.comparison\.orderByNoCase\("name", "ASC"\)/,
  ]);
  assertFunctionUsesPatterns("listAssignmentsForTargets", [
    /tag_assignments\.target_id IN \(:targetIds\)/,
    /db\.dialect\.comparison\.orderByNoCase\("tags\.name", "ASC"\)/,
  ]);
  assertFunctionUsesPatterns("addAssignment", [
    /db\.dialect\.conflict\.buildInsertOrIgnore/,
    /TAG_ASSIGNMENT_INSERT_COLUMNS/,
    /assignmentInsertParams/,
  ]);
  assertFunctionUsesPatterns("addSuppression", [
    /db\.dialect\.conflict\.buildInsertOrIgnore/,
    /TAG_SUPPRESSION_INSERT_COLUMNS/,
    /suppressionInsertParams/,
  ]);

  assert.match(auditDocs, /Current totals as of 0\.33\.6\.10b:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 388[\s\S]*Total runtime database operation calls seen by the audit scanner: 432/, "audit docs should record the current conversion ratchet after the Tags repository conversion");
  assert.match(auditDocs, /\| tags\.repo \| Converted \| 0 \| 0 \| 17 \| 17 \|/, "audit inventory should mark tags repo fully converted");
  assert.match(auditDocs, /0\.33\.5\.27\.23 Tags Repository Conversion[\s\S]*`tags\.repo` is fully converted[\s\S]*403 runtime literal-helper invocations[\s\S]*86 direct interpolated SQL operation sites[\s\S]*273 existing bound operation sites/, "audit docs should record the Tags repository conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.23[\s\S]*`tags\.repo` is converted[\s\S]*403 remaining helper invocations/, "database docs should record the concrete Tags repository conversion");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.23 - Conversion wave: Tags repository[\s\S]*- \[x\] Convert `tags\.repo`[\s\S]*- \[x\] Preserve tag create\/update\/archive[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.23 - [\s\S]*Tags repository conversion[\s\S]*403 helper invocations[\s\S]*86 direct interpolated operation sites[\s\S]*273 bound operation sites/, "changelog should record the Tags repository conversion burndown");
  assert.match(regressionSuite, /scripts\/tags-repository-conversion-regression\.mjs/, "regression suite should include the Tags repository conversion proof");
}

function assertConvertedFunction(functionName) {
  const block = functionBlock(tagsRepoSource, functionName);
  assert.match(block, /\bdb\.(?:query|get|run)\(`/u, `${functionName} should use the provider-neutral db facade`);
  assert.match(
    block,
    /:[A-Za-z][A-Za-z0-9_]*|assignmentWhereClauses|assignmentInsertParams|suppressionInsertParams/u,
    `${functionName} should use named params or shared named-param helpers`,
  );
  assert.doesNotMatch(block, /\b(?:querySql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, `${functionName} should not use literal SQL helpers after conversion`);
}

function assertFunctionUsesPatterns(functionName, patterns) {
  const block = functionBlock(tagsRepoSource, functionName);

  for (const pattern of patterns) {
    assert.match(block, pattern, `${functionName} should include ${pattern}`);
  }
}

async function readFixture() {
  const workspace = (await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"))[0];
  const user = (await querySql(`
SELECT user_id
FROM users
WHERE home_workspace_id = ${sqlText(workspace.workspace_id)}
ORDER BY protected_user DESC, username
LIMIT 1;
`))[0];

  assert.ok(workspace?.workspace_id, "fresh database should include a workspace");
  assert.ok(user?.user_id, "fresh database should include a protected user");

  return {
    userId: user.user_id,
    workspaceId: workspace.workspace_id,
  };
}

async function assertTagsRepositoryRuntime({ userId, workspaceId }) {
  const targetId = `tag-repo-target-${randomUUID()}-'; DROP TABLE tags; --`;
  const secondTargetId = `tag-repo-target-${randomUUID()}`;
  const propagatedTargetId = `tag-repo-propagated-${randomUUID()}`;
  const sourceTargetId = `tag-repo-source-${randomUUID()}`;
  const propagationRuleId = `tag-repo-rule-${randomUUID()}`;

  const firstTag = await tagsRepository.createTag(workspaceId, {
    color: "#2f6fed",
    created_by_user_id: userId,
    description: "Original tag description",
    name: "Alpha Work",
    slug: "alpha-work",
  });
  const secondTag = await tagsRepository.createTag(workspaceId, {
    color: "",
    created_by_user_id: userId,
    name: "Research",
    slug: "research",
  });

  assert.equal(firstTag.slug, "alpha-work", "created tag should read back by ID");
  assert.equal((await tagsRepository.readTagBySlug(workspaceId, "alpha-work"))?.tag_id, firstTag.tag_id, "tag slug reads should use bound params");

  const updatedTag = await tagsRepository.updateTag(workspaceId, firstTag.tag_id, {
    color: "",
    description: "Updated tag description",
    name: "Beta Work",
    slug: "beta-work",
  });
  assert.equal(updatedTag.name, "Beta Work", "tag update should preserve name");
  assert.equal(updatedTag.color, "", "empty color should continue to read as an empty app value");

  assert.equal((await tagsRepository.setTagStatus(workspaceId, firstTag.tag_id, "archived"))?.status, "archived", "tag archive should persist status");
  assert.equal((await tagsRepository.setTagStatus(workspaceId, firstTag.tag_id, "active"))?.status, "active", "tag restore should persist status");

  const searchRows = await tagsRepository.listTags(workspaceId, { search: "BETA", status: "all" });
  assert.deepEqual(searchRows.map((tag) => tag.tag_id), [firstTag.tag_id], "tag list search should remain case-insensitive");

  const byIds = await tagsRepository.readTagsByIds(workspaceId, [secondTag.tag_id, "", firstTag.tag_id, firstTag.tag_id]);
  assert.deepEqual(byIds.map((tag) => tag.slug), ["beta-work", "research"], "batched tag reads should de-dupe IDs and order by tag name");

  await tagsRepository.addAssignment(workspaceId, {
    created_by_user_id: userId,
    source: "manual",
    tag_id: firstTag.tag_id,
    target_id: targetId,
    target_type: "task",
  });
  await tagsRepository.addAssignment(workspaceId, {
    created_by_user_id: userId,
    source: "manual",
    tag_id: firstTag.tag_id,
    target_id: targetId,
    target_type: "task",
  });
  let directAssignments = await tagsRepository.listAssignmentsForTarget(workspaceId, "task", targetId, { source: "manual" });
  assert.equal(directAssignments.length, 1, "duplicate manual tag assignments should still be ignored");
  assert.equal(directAssignments[0].tag.name, "Beta Work", "assignment rows should include tag read models");

  await tagsRepository.addAssignment(workspaceId, {
    created_by_user_id: userId,
    source: "manual",
    tag_id: secondTag.tag_id,
    target_id: secondTargetId,
    target_type: "task",
  });
  const batchedAssignments = await tagsRepository.listAssignmentsForTargets(workspaceId, "task", [secondTargetId, targetId, targetId], { source: "manual" });
  assert.deepEqual(
    batchedAssignments.map((assignment) => `${assignment.target_id}:${assignment.tag.slug}`).sort(),
    [`${secondTargetId}:research`, `${targetId}:beta-work`].sort(),
    "batched assignment reads should preserve target scoping and source filters",
  );

  await tagsRepository.addAssignment(workspaceId, {
    created_by_user_id: userId,
    propagation_rule_id: propagationRuleId,
    source: "propagated",
    source_assignment_id: directAssignments[0].tag_assignment_id,
    source_target_id: sourceTargetId,
    source_target_type: "project",
    tag_id: secondTag.tag_id,
    target_id: propagatedTargetId,
    target_type: "task",
  });
  const contextAssignments = await tagsRepository.listAssignmentsForPropagationContext(workspaceId, {
    propagation_rule_id: propagationRuleId,
    source_target_id: sourceTargetId,
    source_target_type: "project",
    target_id: propagatedTargetId,
    target_type: "task",
  });
  assert.deepEqual(contextAssignments.map((assignment) => assignment.tag_id), [secondTag.tag_id], "propagation context reads should preserve source metadata filters");

  assert.equal(await tagsRepository.hasSuppression(workspaceId, {
    propagation_rule_id: propagationRuleId,
    source_target_id: sourceTargetId,
    source_target_type: "project",
    tag_id: secondTag.tag_id,
    target_id: propagatedTargetId,
    target_type: "task",
  }), false, "suppression lookup should start empty");

  await tagsRepository.addSuppression(workspaceId, {
    propagation_rule_id: propagationRuleId,
    source_target_id: sourceTargetId,
    source_target_type: "project",
    suppressed_by_user_id: userId,
    tag_id: secondTag.tag_id,
    target_id: propagatedTargetId,
    target_type: "task",
  });
  await tagsRepository.addSuppression(workspaceId, {
    propagation_rule_id: propagationRuleId,
    source_target_id: sourceTargetId,
    source_target_type: "project",
    suppressed_by_user_id: userId,
    tag_id: secondTag.tag_id,
    target_id: propagatedTargetId,
    target_type: "task",
  });
  assert.equal(await tagsRepository.hasSuppression(workspaceId, {
    propagation_rule_id: propagationRuleId,
    source_target_id: sourceTargetId,
    source_target_type: "project",
    tag_id: secondTag.tag_id,
    target_id: propagatedTargetId,
    target_type: "task",
  }), true, "suppression lookup should find the inserted suppression");
  assert.equal(
    (await tagsRepository.listSuppressionsForTarget(workspaceId, "task", propagatedTargetId)).length,
    1,
    "duplicate suppressions should still be ignored",
  );

  const propagatedAssignment = contextAssignments[0];
  assert.equal((await tagsRepository.readAssignmentById(workspaceId, propagatedAssignment.tag_assignment_id))?.source, "propagated", "assignment-by-id reads should preserve source");
  await tagsRepository.removeAssignmentById(workspaceId, propagatedAssignment.tag_assignment_id);
  assert.deepEqual(await tagsRepository.listAssignmentsForPropagationContext(workspaceId, {
    propagation_rule_id: propagationRuleId,
    source_target_id: sourceTargetId,
    source_target_type: "project",
    target_id: propagatedTargetId,
    target_type: "task",
  }), [], "removeAssignmentById should remove the propagated row");

  await tagsRepository.removeAssignment(workspaceId, "task", targetId, firstTag.tag_id, { source: "manual" });
  directAssignments = await tagsRepository.listAssignmentsForTarget(workspaceId, "task", targetId, { source: "manual" });
  assert.deepEqual(directAssignments, [], "removeAssignment should preserve source-filtered removal");

  await assert.rejects(
    () => tagsRepository.addAssignment(workspaceId, {
      source: "external",
      tag_id: firstTag.tag_id,
      target_id: targetId,
      target_type: "task",
    }),
    /Invalid tag assignment source: external/,
    "invalid assignment sources should still fail before writing",
  );

  const tagsTable = await querySql("SELECT COUNT(1) AS count FROM tags;");
  assert.ok(Number(tagsTable[0]?.count || 0) >= 2, "tags table should survive SQL-like bound target IDs");
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok", "SQLite integrity check should pass");
}

function functionBlock(source, functionName) {
  const pattern = new RegExp(`(?:async\\s+)?function ${functionName}\\s*\\([^)]*\\)\\s*\\{`);
  const match = pattern.exec(source);
  assert.ok(match, `${functionName} should exist`);

  const bodyStart = match.index + match[0].lastIndexOf("{");
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(match.index, index + 1);
      }
    }
  }

  throw new Error(`Could not extract function ${functionName}`);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
