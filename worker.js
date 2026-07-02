import { loadRuntimeEnvFile } from "./src/runtime-env.js";

loadRuntimeEnvFile();

const { startWorkerCli } = await import("./src/core/jobs/worker-cli.js");

await startWorkerCli();
