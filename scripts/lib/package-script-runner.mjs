import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const PACKAGE_SCRIPTS = Object.freeze({ ...packageJson.scripts });

function resolveDirectNodePackageScript(scriptName, packageScripts = PACKAGE_SCRIPTS) {
  const definition = String(packageScripts[scriptName] || "").trim();
  const match = /^node\s+([^\s"'&|<>]+)((?:\s+[^\s"'&|<>]+)*)$/.exec(definition);

  if (!match) {
    return null;
  }

  return Object.freeze({
    args: Object.freeze(match[2].trim() ? match[2].trim().split(/\s+/) : []),
    entryPoint: match[1],
  });
}

function runPackageScript(scriptName, {
  packageScripts = PACKAGE_SCRIPTS,
  platform = process.platform,
  spawnSyncImplementation = spawnSync,
} = {}) {
  const directNode = resolveDirectNodePackageScript(scriptName, packageScripts);
  if (directNode) {
    return spawnSyncImplementation(process.execPath, [directNode.entryPoint, ...directNode.args], {
      stdio: "inherit",
      windowsHide: true,
    });
  }

  if (!packageScripts[scriptName]) {
    throw new Error(`Unknown package script: ${scriptName}`);
  }

  if (platform === "win32") {
    return spawnSyncImplementation(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", `npm run ${scriptName}`],
      { stdio: "inherit", windowsHide: true },
    );
  }

  return spawnSyncImplementation("npm", ["run", scriptName], { stdio: "inherit" });
}

export {
  PACKAGE_SCRIPTS,
  resolveDirectNodePackageScript,
  runPackageScript,
};
