// @ts-check

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const PUBLIC_DEMO_DATA_MARKER_FILE = ".longtail-demo-data.json";
const PUBLIC_DEMO_DATA_MARKER_CONTRACT = "longtail-forge-demo-data-v1";
const PUBLIC_DEMO_TARGET = "rt-ltf-demo";
const MAX_PUBLIC_DEMO_MARKER_BYTES = 4096;
const PUBLIC_DEMO_VISITOR_ID_COUNT = 6;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let publicDemoIdentityState = createPublicDemoIdentityState(false, []);

/** @param {{ demo?: { enabled?: boolean }, dataDir?: string }} [options] */
async function assertPublicDemoRuntimeReady(options = {}) {
  const demo = options.demo || config.demo;
  if (!demo?.enabled) {
    publicDemoIdentityState = createPublicDemoIdentityState(false, []);
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
    const publicVisitorUserIds = normalizePublicVisitorUserIds(marker.publicVisitorUserIds);
    if (
      !marker
      || typeof marker !== "object"
      || Array.isArray(marker)
      || marker.contract !== PUBLIC_DEMO_DATA_MARKER_CONTRACT
      || marker.target !== PUBLIC_DEMO_TARGET
      || !publicVisitorUserIds
    ) {
      throw new Error("invalid_marker_identity");
    }
    publicDemoIdentityState = createPublicDemoIdentityState(true, publicVisitorUserIds);
  } catch {
    throw new Error("DEMO_MODE data ownership marker is missing, unreadable, or invalid.");
  }

  return Object.freeze({ enabled: true, marker: "verified" });
}

/**
 * @param {string} userId
 */
function isPublicDemoVisitorIdentity(userId) {
  const normalizedUserId = String(userId || "").trim().toLowerCase();
  return publicDemoIdentityState.enabled
    && publicDemoIdentityState.publicVisitorUserIds.includes(normalizedUserId);
}

/** @param {unknown} value */
function normalizePublicVisitorUserIds(value) {
  if (!Array.isArray(value) || value.length !== PUBLIC_DEMO_VISITOR_ID_COUNT) {
    return null;
  }
  const normalized = value.map((userId) => String(userId || "").trim().toLowerCase());
  if (normalized.some((userId) => !UUID_PATTERN.test(userId)) || new Set(normalized).size !== normalized.length) {
    return null;
  }
  return Object.freeze([...normalized].sort());
}

/**
 * @param {boolean} enabled
 * @param {readonly string[]} publicVisitorUserIds
 */
function createPublicDemoIdentityState(enabled, publicVisitorUserIds) {
  return Object.freeze({
    enabled: Boolean(enabled),
    publicVisitorUserIds: Object.freeze([...publicVisitorUserIds]),
  });
}

export {
  PUBLIC_DEMO_DATA_MARKER_CONTRACT,
  PUBLIC_DEMO_DATA_MARKER_FILE,
  PUBLIC_DEMO_TARGET,
  assertPublicDemoRuntimeReady,
  isPublicDemoVisitorIdentity,
};
