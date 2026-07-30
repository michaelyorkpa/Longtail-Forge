import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";
import { correspondingSourceUrl, trackedSourceUrl } from "../../src/core/corresponding-source.js";
import { createLegalContentService } from "../../src/services/legal-content.service.js";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    fs.rm(directory, { recursive: true, force: true })
  )));
});

describe("public legal content", () => {
  it("renders operator-supplied Markdown without requiring app state", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-legal-content-"));
    temporaryDirectories.push(directory);
    const termsPath = path.join(directory, "terms.md");
    const privacyPath = path.join(directory, "privacy.md");
    await fs.writeFile(termsPath, "# Example Terms\n\nOperator supplied.", "utf8");
    await fs.writeFile(privacyPath, "# Example Privacy\n\nOperator controlled.", "utf8");

    const service = createLegalContentService({
      legal: { termsContentPath: termsPath, privacyContentPath: privacyPath },
    });
    const terms = await service.read("terms");
    const privacy = await service.read("privacy");

    assert.match(terms.bodyHtml, /<h1[^>]*>Example Terms<\/h1>/);
    assert.match(terms.bodyHtml, /Operator supplied/);
    assert.match(privacy.bodyHtml, /Example Privacy/);
    assert.equal(await service.read("unknown"), null);
  });

  it("binds Corresponding Source and tracked legal files to the exact runtime identity", () => {
    const runtimeConfig = {
      appVersion: "0.33.25.3",
      release: { commitSha: "0123456789abcdef0123456789abcdef01234567" },
      legal: { correspondingSourceUrlTemplate: "https://source.example.test/tree/{ref}" },
    };

    assert.equal(
      correspondingSourceUrl(runtimeConfig),
      "https://source.example.test/tree/0123456789abcdef0123456789abcdef01234567",
    );
    assert.equal(
      trackedSourceUrl("docs/licensing/trademark-policy.md", runtimeConfig),
      "https://source.example.test/tree/0123456789abcdef0123456789abcdef01234567/docs/licensing/trademark-policy.md",
    );

    assert.equal(
      trackedSourceUrl("LICENSE", {
        ...runtimeConfig,
        legal: { correspondingSourceUrlTemplate: "https://github.com/example/project/tree/{ref}" },
      }),
      "https://github.com/example/project/blob/0123456789abcdef0123456789abcdef01234567/LICENSE",
    );
  });
});
