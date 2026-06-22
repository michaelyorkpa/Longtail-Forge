import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkedExtensions = new Set([".js", ".mjs"]);
const ignoredDirectories = new Set([
  ".git",
  "archive",
  "data",
  "logs",
  "node_modules",
]);
const DEFAULT_PARALLELISM = 8;
const configuredParallelism = Number.parseInt(process.env.LTF_CHECK_JS_PARALLELISM || "", 10);
const parallelism = Number.isInteger(configuredParallelism) && configuredParallelism > 0
  ? configuredParallelism
  : DEFAULT_PARALLELISM;

async function collectJavaScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...await collectJavaScriptFiles(fullPath));
      }

      continue;
    }

    if (entry.isFile() && checkedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = await collectJavaScriptFiles(root);
const results = await runLimited(files, parallelism);
const failures = results.filter((result) => result.status !== 0);

for (const result of failures) {
  console.error(`Syntax check failed: ${path.relative(root, result.file)}`);
  if (result.stdout) console.error(result.stdout.trim());
  if (result.stderr) console.error(result.stderr.trim());
}

if (failures.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} JavaScript files with concurrency ${parallelism}.`);
}

async function runLimited(items, concurrency) {
  const results = [];
  const running = new Set();
  let nextIndex = 0;

  async function scheduleNext() {
    if (nextIndex >= items.length) {
      return;
    }

    const item = items[nextIndex];
    nextIndex += 1;
    const promise = runSyntaxCheck(item)
      .then((result) => {
        results.push(result);
      })
      .finally(() => {
        running.delete(promise);
      });
    running.add(promise);
  }

  while (running.size < concurrency && nextIndex < items.length) {
    await scheduleNext();
  }

  while (running.size > 0) {
    await Promise.race(running);
    while (running.size < concurrency && nextIndex < items.length) {
      await scheduleNext();
    }
  }

  return results;
}

function runSyntaxCheck(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--check", file], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      stderr += `${error.stack || error.message || error}\n`;
    });
    child.on("close", (status) => {
      resolve({ file, status, stdout, stderr });
    });
  });
}
