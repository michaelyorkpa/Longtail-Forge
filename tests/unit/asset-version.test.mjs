import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { appVersion } from "../../src/core/version.js";
import { assetVersion, withAssetVersion } from "../../src/core/asset-version.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageMetadata = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

describe("canonical app version", () => {
  it("matches package.json", () => {
    expect(appVersion).toBe(String(packageMetadata.version).trim());
  });

  it("drives the asset cache-bust version", () => {
    expect(assetVersion).toBe(appVersion);
  });
});

describe("withAssetVersion", () => {
  it("appends the canonical version to local script/style URLs", () => {
    expect(withAssetVersion("/js/app.js", "1.2.3")).toBe("/js/app.js?v=1.2.3");
    expect(withAssetVersion("/css/site.css", "1.2.3")).toBe("/css/site.css?v=1.2.3");
  });

  it("replaces an existing v parameter instead of duplicating it", () => {
    expect(withAssetVersion("/js/app.js?v=old", "1.2.3")).toBe("/js/app.js?v=1.2.3");
  });

  it("preserves other query parameters and fragments", () => {
    expect(withAssetVersion("/js/app.js?feature=1#anchor", "1.2.3")).toBe(
      "/js/app.js?feature=1&v=1.2.3#anchor",
    );
  });

  it("leaves external, protocol-relative, and fragment-only URLs alone", () => {
    expect(withAssetVersion("https://example.com/app.js", "1.2.3")).toBe(
      "https://example.com/app.js",
    );
    expect(withAssetVersion("//cdn.example.com/app.js", "1.2.3")).toBe(
      "//cdn.example.com/app.js",
    );
    expect(withAssetVersion("#top", "1.2.3")).toBe("#top");
  });

  it("leaves non-script/style paths alone", () => {
    expect(withAssetVersion("/images/logo.png", "1.2.3")).toBe("/images/logo.png");
  });

  it("returns empty and blank inputs unchanged", () => {
    expect(withAssetVersion("", "1.2.3")).toBe("");
    expect(withAssetVersion("/js/app.js", "")).toBe("/js/app.js");
  });
});
