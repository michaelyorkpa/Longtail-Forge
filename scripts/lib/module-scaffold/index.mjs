import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const templates = new URL("./templates/", import.meta.url);
/** @param {string} moduleId */
export function scaffoldFiles(moduleId) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(moduleId) || moduleId.length > 64 || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(moduleId)) {
    throw new Error("Module ID must be a non-reserved lowercase kebab-case name of at most 64 characters.");
  }
  const title = moduleId.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ");
  const tokens = { "__ID__": moduleId, "__KEY__": moduleId.replaceAll("-", "_"), "__TITLE__": title };
  const moduleRoot = `src/modules/${moduleId}`;
  const paths = {
    "module": `${moduleRoot}/module.js`, "contracts": `${moduleRoot}/contracts.d.ts`,
    "repository": `${moduleRoot}/records.repo.js`, "service": `${moduleRoot}/records.service.js`,
    "routes": `${moduleRoot}/routes.js`, "public-api": `${moduleRoot}/public-api.routes.js`,
    "search": `${moduleRoot}/search-indexer.js`, "controller": `public/js/${moduleId}.js`,
    "view": `views/protected/${moduleId}.html`, "docs": `docs/modules/${moduleId}.md`,
    "help": `help/modules/${moduleId}/overview.md`,
    "test": `tests/unit/${moduleId}-records.test.mjs`,
  };
  return { tokens, paths };
}

/** @param {string} root @param {string} moduleId */
export async function createModule(root, moduleId) {
  const { tokens, paths } = scaffoldFiles(moduleId);
  const rootPath = await fs.realpath(root);
  // Do not mix a new scaffold into an existing module, even if its entry is absent.
  const modulePath = path.join(rootPath, "src", "modules", moduleId);
  try { await fs.lstat(modulePath); throw new Error(`Module directory already exists: ${modulePath}`); }
  catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  /** @type {{file: string, text: string}[]} */ const output = [];
  for (const [name, relative] of Object.entries(paths)) {
    const file = path.join(rootPath, relative);
    // Refuse symlinked parents: writing through one could modify a different checkout.
    let parent = path.dirname(file);
    while (parent !== rootPath) {
      try { if ((await fs.lstat(parent)).isSymbolicLink()) throw new Error(`Refusing linked output directory: ${parent}`); }
      catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
      parent = path.dirname(parent);
    }
    try { await fs.lstat(file); throw new Error(`Output already exists: ${relative}`); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
    let text = await fs.readFile(new URL(`${name}.txt`, templates), "utf8");
    for (const [token, value] of Object.entries(tokens)) text = text.replaceAll(token, value);
    output.push({ file, text });
  }
  for (const { file, text } of output) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text, { encoding: "utf8", flag: "wx" });
  }
  return output.map(({ file }) => path.relative(rootPath, file).split(path.sep).join("/"));
}

export const scaffoldTemplateDirectory = fileURLToPath(templates);
