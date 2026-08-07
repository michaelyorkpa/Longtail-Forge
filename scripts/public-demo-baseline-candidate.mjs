#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactDemoError } from "./lib/demo-data-operation.mjs";
import {
  parsePublicDemoCandidateArgs,
  preparePublicDemoCandidateContext,
  runPublicDemoCandidateOperation,
} from "./lib/public-demo-baseline-candidate.mjs";

const scriptPath = await fs.realpath(fileURLToPath(import.meta.url));
const invokedScriptPath = process.argv[1]
  ? await fs.realpath(path.resolve(process.argv[1])).catch(() => path.resolve(process.argv[1]))
  : "";

if (invokedScriptPath === scriptPath) {
  const redactions = Object.entries(process.env)
    .filter(([key, value]) => /(PASSWORD|SECRET|TOKEN|MASTER_KEY|PRIVATE_KEY)/.test(key) && String(value || ""))
    .map(([, value]) => String(value));
  try {
    const args = parsePublicDemoCandidateArgs(process.argv.slice(2));
    redactions.push(args.dataRoot, args.roleCredentialsFile, path.dirname(args.roleCredentialsFile));
    const context = await preparePublicDemoCandidateContext({
      ...args,
      environment: process.env,
    });
    redactions.push(...context.forbiddenValues, context.releaseDir);
    const result = await runPublicDemoCandidateOperation({
      ...args,
      ...context,
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(redactDemoError(error, redactions));
    process.exitCode = 1;
  }
}
