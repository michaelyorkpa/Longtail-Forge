#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HELPER_ENV,
  assertDemoHostSafety,
  assertProtectedFile,
  parseDemoDataArgs,
  parseDemoHelperConfig,
  readProtectedEnvironmentFile,
  redactDemoError,
  resolveDemoPaths,
  runDemoDataOperation,
} from "./lib/demo-data-operation.mjs";

const scriptPath = await fs.realpath(fileURLToPath(import.meta.url));
const invokedScriptPath = process.argv[1]
  ? await fs.realpath(path.resolve(process.argv[1])).catch(() => path.resolve(process.argv[1]))
  : "";

if (invokedScriptPath === scriptPath) {
  let redactions = [];
  try {
    const args = parseDemoDataArgs(process.argv.slice(2));
    await assertProtectedFile(DEFAULT_HELPER_ENV, { label: "demo-data helper environment" });
    const helperText = await fs.readFile(DEFAULT_HELPER_ENV, "utf8");
    const config = parseDemoHelperConfig(helperText, "demo-data helper environment");
    const paths = resolveDemoPaths(config);
    redactions = [...Object.values(paths), path.dirname(paths.dataRoot), path.dirname(paths.backupRoot)];
    const appEnvironment = await readProtectedEnvironmentFile(paths.appEnvFile, { label: "application environment" });
    redactions.push(...Object.entries(appEnvironment)
      .filter(([key]) => /(PASSWORD|SECRET|TOKEN|MASTER_KEY|PRIVATE_KEY)/.test(key))
      .map(([, value]) => value));
    const { releaseDir } = await assertDemoHostSafety({
      action: args.action,
      appEnvironment,
      config,
      paths,
    });
    const packageJson = JSON.parse(await fs.readFile(path.join(releaseDir, "package.json"), "utf8"));
    const result = await runDemoDataOperation({
      ...args,
      appEnvironment,
      appVersion: packageJson.version,
      config,
      paths,
      releaseDir,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(redactDemoError(error, redactions));
    process.exitCode = 1;
  }
}
