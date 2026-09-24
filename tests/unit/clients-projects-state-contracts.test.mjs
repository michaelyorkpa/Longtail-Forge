import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

/**
 * What the Clients/Projects page state holds, and the two things that stop it being declared.
 *
 * `0.33.33.43.32` set out to annotate this file's state slots - the pattern proven five times in
 * `lists.js`. It closed four, because the measurement said the rest is not a typing boundary:
 *
 * 1. **This file builds two different client shapes into one array.** The mapped branch produces
 *    `parent_client_id`, `canCreateChild` and `canManage`; the synthetic workspace-projects entry
 *    `unshift`ed beside it produces none of those and adds `isWorkspaceScope`. Declaring the state
 *    forces those two to be reconciled, which settles whether that pseudo-client is manageable,
 *    can create children, and has a parent - questions the code answers only by omission.
 * 2. **`workspaceProjects` is read off the page state but never written to it.** The normaliser
 *    reads it from the wire and folds it into the synthetic client's `projects`; it never appears
 *    on the object it returns, so the reader that counts it always counts zero.
 *
 * These cases pin both, so neither can be lost and neither can be quietly changed.
 */

const source = createProjectTextReader().readText("public/js/clients-projects.js");

describe("The page state is not declared, and the reason is a contract question", () => {
  it("builds two different client shapes into one array", () => {
    // The mapped branch. Three members the synthetic one below does not produce.
    for (const member of ["parent_client_id:", "canCreateChild:", "canManage:"]) {
      assert.ok(source.includes(`            ${member}`), `the mapped client still produces ${member}`);
    }

    // The synthetic branch, unshifted onto the same array.
    const at = source.indexOf("clients.unshift({");
    assert.notEqual(at, -1, "the synthetic workspace-projects client is still unshifted");
    const synthetic = source.slice(at, source.indexOf("});", at));

    assert.ok(synthetic.includes("id: \"__workspace_projects__\""), "and it is still the workspace entry");
    assert.ok(synthetic.includes("isWorkspaceScope"), "carrying a member the mapped branch does not");
    for (const member of ["parent_client_id", "canCreateChild", "canManage:"]) {
      assert.ok(!synthetic.includes(member),
        `${member} is now produced by the synthetic client; the shapes have converged and this pin should go`);
    }
  });

  it("records that reconciling them is a contract decision rather than a typing one", () => {
    const at = source.indexOf("let clientProjectData = {");
    const block = source.slice(source.lastIndexOf("/**", at), at);

    assert.match(block, /this file builds two[\s*]+different client shapes/i);
    assert.match(block, /contract decision, not a typing one/);
    assert.doesNotMatch(block, /@type \{/, "the state is annotated; the decision was taken and this pin should go with it");
  });

  it("keeps the measurement that says what the decision is worth", () => {
    const at = source.indexOf("let clientProjectData = {");
    const block = source.slice(source.lastIndexOf("/**", at), at);

    // Deriving the slot closes 45 member reads; typing the normaliser's own input closes 37 in
    // total. Recording both is what lets the decision be weighed rather than guessed at.
    assert.match(block, /forty-five member[\s*]+reads/);
    assert.match(block, /thirty-seven in total/);
  });
});

describe("A member the page reads but never writes", () => {
  it("reads workspaceProjects off the page state", () => {
    assert.match(source, /workspaceProjectCount: clientProjectData\.workspaceProjects\?\.length \|\| 0,/,
      "the snapshot still counts a member off the page state");
  });

  it("never puts it there: the normaliser returns only capabilities and clients", () => {
    const at = source.indexOf("function normalizeData(");
    const body = source.slice(at, source.indexOf("\n  }", at));
    const returned = body.slice(body.lastIndexOf("return {"));

    assert.ok(returned.includes("capabilities:"), "the normaliser returns capabilities");
    assert.ok(returned.includes("clients,"), "and clients");
    assert.ok(!returned.includes("workspaceProjects"),
      "workspaceProjects is now returned; the count is no longer always zero and this pin should go");
  });

  it("folds the wire's workspace projects into the synthetic client instead", () => {
    // This is where they go, which is why the count reads zero rather than throwing: the member
    // is simply absent, and `?.length || 0` answers 0 for an absent member.
    assert.match(source, /const workspaceProjects = normalizeProjects\(data\.workspaceProjects \|\| \[\], "yes", ""\);/,
      "they are still read from the wire");
    assert.match(source, /\n\s+projects: workspaceProjects,/,
      "and still folded into the synthetic client's own projects");
  });
});

describe("What did land", () => {
  it("derives the tag options from the loader that fills them", () => {
    assert.match(source, /@type \{Awaited<ReturnType<typeof loadTagOptions>>\}\r?\n\s+\*\/\r?\n\s+let tagOptions = \[\];/,
      "derived rather than restated, so the slot and its loader cannot drift");
    assert.match(source, /tagOptions = loadedTags;/, "and the loader still fills it");
  });

  it("leaves the read surface with the cluster its consumers belong to", () => {
    // Discharged by the read-surface cluster's own checkpoint: declaring the slot closes three
    // evolving-`any` reads and opens five that assume more than `Element` carries.
    const at = source.indexOf("let activeClientProjectsReadSurface = null;");
    const block = source.slice(source.lastIndexOf("/**", at), at);

    assert.match(block, /opens five member\r?\n\s+\* reads that assume more than `Element` carries/);
    assert.doesNotMatch(block, /@type \{/, "the surface is annotated; that deferral is discharged and this pin should go");
  });
});
