#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactDemoError } from "./lib/demo-data-operation.mjs";
import {
  parsePublicDemoActivationArgs,
  runPublicDemoActivationOperation,
} from "./lib/public-demo-baseline-activation.mjs";

const scriptPath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const redactions = Object.entries(process.env)
    .filter(([key, value]) => /(PASSWORD|SECRET|TOKEN|MASTER_KEY|PRIVATE_KEY)/.test(key) && String(value || ""))
    .map(([, value]) => String(value));
  try {
    const args = parsePublicDemoActivationArgs(process.argv.slice(2));
    redactions.push(args.dataRoot);
    const result = await runPublicDemoActivationOperation({ ...args, environment: process.env });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(redactDemoError(error, redactions));
    process.exitCode = 1;
  }
}
