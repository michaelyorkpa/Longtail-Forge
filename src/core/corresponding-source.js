import { config } from "../config.js";

/**
 * The exact runtime-identity projection these helpers read; callers may pass
 * the full runtime configuration or any structurally matching identity.
 * @typedef {{ appVersion: string, release: { commitSha: string }, legal: { correspondingSourceUrlTemplate: string } }} CorrespondingSourceIdentity
 */

/** @param {CorrespondingSourceIdentity} [runtimeConfig] */
function correspondingSourceRef(runtimeConfig = config) {
  return runtimeConfig.release.commitSha || `v${runtimeConfig.appVersion}`;
}

/** @param {CorrespondingSourceIdentity} [runtimeConfig] */
function correspondingSourceUrl(runtimeConfig = config) {
  const encodedRef = encodeURIComponent(correspondingSourceRef(runtimeConfig));
  return runtimeConfig.legal.correspondingSourceUrlTemplate.replaceAll("{ref}", encodedRef);
}

/**
 * @param {string} relativePath
 * @param {CorrespondingSourceIdentity} [runtimeConfig]
 */
function trackedSourceUrl(relativePath, runtimeConfig = config) {
  const sourceUrl = new URL(correspondingSourceUrl(runtimeConfig));
  const normalizedPath = String(relativePath || "")
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  if (sourceUrl.hostname.toLowerCase() === "github.com") {
    sourceUrl.pathname = sourceUrl.pathname.replace("/tree/", "/blob/");
  }
  sourceUrl.pathname = `${sourceUrl.pathname.replace(/\/+$/, "")}/${normalizedPath}`;
  return sourceUrl.toString();
}

export { correspondingSourceRef, correspondingSourceUrl, trackedSourceUrl };
