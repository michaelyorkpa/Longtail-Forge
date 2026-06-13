import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-help-contract-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-help-contract-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Help-Contract-Test-Password-123!";

const { validateHelpContribution, validateModuleManifest } = await import("../src/core/modules/manifest-contract.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");

let checks = 0;

async function check(name, assertion) {
  await assertion();
  checks += 1;
}

const validHelp = {
  sections: [
    {
      id: "developer-example.overview",
      moduleId: "developer-example",
      title: "Developer Example",
      description: "Developer-facing sample help section.",
      sortOrder: 10,
      audience: "developer",
      tags: ["modules", "help"],
      requiredModules: ["developer-example"],
      requiredPermissions: ["developer_example.view"],
    },
  ],
  articles: [
    {
      id: "developer-example.getting-started",
      slug: "developer-example-getting-started",
      sectionId: "developer-example.overview",
      moduleId: "developer-example",
      title: "Developer Example Help",
      summary: "Example module help article.",
      body: "This article demonstrates the help contribution contract.",
      sortOrder: 10,
      audience: "developer",
      tags: ["modules", "help"],
      relatedArticleIds: [],
      requiredModules: ["developer-example"],
      requiredPermissions: ["developer_example.view"],
    },
  ],
};

try {
  await initializeDatabase();

  await check("manifest validation accepts a well-formed module help contribution", () => {
    const manifest = {
      id: "developer-example",
      name: "Developer Example",
      displayName: "Developer Example",
      description: "Example module.",
      category: "developer",
      version: "0.32.9.1",
      enabledByDefault: false,
      help: validHelp,
    };

    assert.deepEqual(validateModuleManifest(manifest, new Set(["developer-example"])), []);
  });

  await check("help contribution validation supports framework-owned help without a module id", () => {
    const errors = validateHelpContribution({
      sections: [
        {
          id: "framework.getting-started",
          ownerType: "framework",
          title: "Getting Started",
          description: "Framework-owned starter help.",
        },
      ],
      articles: [
        {
          id: "framework.getting-started",
          slug: "getting-started",
          ownerType: "framework",
          sectionId: "framework.getting-started",
          title: "Getting Started",
          summary: "Start using Longtail Forge.",
          contentPath: "framework/getting-started.md",
          tags: ["framework"],
        },
      ],
    }, {
      ownerType: "framework",
      ownerId: "framework",
      fieldName: "frameworkHelp",
      errors: [],
    });

    assert.deepEqual(errors, []);
  });

  await check("invalid help declarations fail predictably", () => {
    const errors = validateHelpContribution({
      sections: [
        {
          id: "invalid section id",
          moduleId: "wrong-module",
          title: "",
        },
      ],
      articles: [
        {
          id: "developer-example.missing-content",
          slug: "Missing Content",
          moduleId: "developer-example",
          sectionId: "missing-section",
          title: "Missing Content",
        },
      ],
    }, {
      ownerType: "module",
      ownerId: "developer-example",
      fieldName: "help",
      errors: [],
    });

    assert.ok(errors.some((error) => error.includes("help.sections[0].id has an invalid format")));
    assert.ok(errors.some((error) => error.includes("help.sections[0].moduleId must match module id 'developer-example'")));
    assert.ok(errors.some((error) => error.includes("help.articles[0].slug has an invalid format")));
    assert.ok(errors.some((error) => error.includes("help.articles[0] must include summary or description")));
    assert.ok(errors.some((error) => error.includes("help.articles[0] must include body or contentPath")));
    assert.ok(errors.some((error) => error.includes("sectionId references unknown help section 'missing-section'")));
  });

  await check("non-array help sections and articles return validation errors without throwing", () => {
    const errors = validateHelpContribution({
      sections: "not-array",
      articles: "not-array",
    }, {
      ownerType: "module",
      ownerId: "developer-example",
      fieldName: "help",
      errors: [],
    });

    assert.ok(errors.some((error) => error.includes("help.sections must be an array")));
    assert.ok(errors.some((error) => error.includes("help.articles must be an array")));
  });

  await check("duplicate help article IDs and slugs are rejected", () => {
    const errors = validateHelpContribution({
      sections: validHelp.sections,
      articles: [
        validHelp.articles[0],
        {
          ...validHelp.articles[0],
          title: "Duplicate Help",
        },
      ],
    }, {
      ownerType: "module",
      ownerId: "developer-example",
      fieldName: "help",
      errors: [],
    });

    assert.ok(errors.some((error) => error.includes("help.articles 'developer-example.getting-started' is duplicated")));
    assert.ok(errors.some((error) => error.includes("help.articles slug 'developer-example-getting-started' is duplicated")));
  });

  await check("unsafe help content paths are rejected", () => {
    const errors = validateHelpContribution({
      sections: validHelp.sections,
      articles: [
        {
          ...validHelp.articles[0],
          body: undefined,
          contentPath: "../secrets.md",
        },
      ],
    }, {
      ownerType: "module",
      ownerId: "developer-example",
      fieldName: "help",
      errors: [],
    });

    assert.ok(errors.some((error) => error.includes("contentPath must be a safe relative path")));
  });

  await check("non-Markdown and duplicate help content paths are rejected", () => {
    const errors = validateHelpContribution({
      sections: validHelp.sections,
      articles: [
        {
          ...validHelp.articles[0],
          body: undefined,
          contentPath: "modules/developer-example/getting-started.txt",
        },
        {
          ...validHelp.articles[0],
          id: "developer-example.second",
          slug: "developer-example-second",
          title: "Second Help",
          body: undefined,
          contentPath: "modules/developer-example/getting-started.txt",
        },
      ],
    }, {
      ownerType: "module",
      ownerId: "developer-example",
      fieldName: "help",
      errors: [],
    });

    assert.ok(errors.some((error) => error.includes("contentPath must point to a Markdown file")));
    assert.ok(errors.some((error) => error.includes("help.articles contentPath 'modules/developer-example/getting-started.txt' is duplicated")));
  });

  await check("registered module help declarations are discoverable", () => {
    const contributions = modulesService.listHelpContributions();

    assert.ok(contributions.sections.some((section) => section.id === "developer-example.overview"));
    assert.ok(contributions.articles.some((article) => article.id === "developer-example.getting-started"));
    assert.ok(modulesService.listHelpSections().some((section) => section.moduleId === "developer-example"));
    assert.ok(modulesService.listHelpArticles().some((article) => article.moduleId === "developer-example"));
  });

  await check("disabled module help is excluded from active Help Center discovery", async () => {
    const workspaceId = await readDefaultWorkspaceId();

    const hidden = await modulesService.listActiveHelpContributions(workspaceId);
    assert.deepEqual(hidden.articles.filter((article) => article.moduleId === "developer-example"), []);

    await runSql(`
UPDATE workspace_modules
SET status = 'enabled'
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'developer-example';
`);

    const visible = await modulesService.listActiveHelpContributions(workspaceId);
    assert.ok(visible.sections.some((section) => section.id === "developer-example.overview"));
    assert.ok(visible.articles.some((article) => article.id === "developer-example.getting-started"));
  });

  console.log(`Help contract regression passed ${checks} checks.`);
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function readDefaultWorkspaceId() {
  const rows = await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  const workspaceId = rows[0]?.workspace_id;

  assert.ok(workspaceId, "fresh database should seed a default workspace");
  return workspaceId;
}
