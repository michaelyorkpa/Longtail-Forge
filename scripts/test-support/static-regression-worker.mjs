import path from "node:path";
import { pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";

try {
  const scriptUrl = pathToFileURL(path.resolve(workerData.script)).href;
  await import(scriptUrl);
} catch (error) {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
} finally {
  parentPort?.close();
}
