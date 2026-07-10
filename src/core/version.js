import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const packageMetadata = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const appVersion = String(packageMetadata.version || "").trim();

if (!appVersion) {
  throw new Error("package.json must define a non-empty version.");
}

export { appVersion };
