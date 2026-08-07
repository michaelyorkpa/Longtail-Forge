// @ts-check

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const PUBLIC_DEMO_DATA_MARKER_FILE = ".longtail-demo-data.json";
const PUBLIC_DEMO_DATA_MARKER_CONTRACT = "longtail-forge-demo-data-v1";
const PUBLIC_DEMO_TARGET = "rt-ltf-demo";
const MAX_PUBLIC_DEMO_MARKER_BYTES = 4096;

async function assertPublicDemoRuntimeReady(options = {}) {
  const demo = options.demo || config.demo;
  if (!demo?.enabled) {
    return Object.freeze({ enabled: false, marker: "not_required" });
  }

  const dataDir = path.resolve(options.dataDir || config.dataDir);
  const markerPath = path.join(dataDir, PUBLIC_DEMO_DATA_MARKER_FILE);

  try {
    const stats = await fs.lstat(markerPath);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 2 || stats.size > MAX_PUBLIC_DEMO_MARKER_BYTES) {
      throw new Error("invalid_marker_file");
    }
    if (process.platform !== "win32" && (stats.mode & 0o022) !== 0) {
      throw new Error("unsafe_marker_mode");
    }

    const marker = JSON.parse(await fs.readFile(markerPath, "utf8"));
    if (
      !marker
      || typeof marker !== "object"
      || Array.isArray(marker)
      || marker.contract !== PUBLIC_DEMO_DATA_MARKER_CONTRACT
      || marker.target !== PUBLIC_DEMO_TARGET
    ) {
      throw new Error("invalid_marker_identity");
    }
  } catch {
    throw new Error("DEMO_MODE data ownership marker is missing, unreadable, or invalid.");
  }

  return Object.freeze({ enabled: true, marker: "verified" });
}

export {
  PUBLIC_DEMO_DATA_MARKER_CONTRACT,
  PUBLIC_DEMO_DATA_MARKER_FILE,
  PUBLIC_DEMO_TARGET,
  assertPublicDemoRuntimeReady,
};
