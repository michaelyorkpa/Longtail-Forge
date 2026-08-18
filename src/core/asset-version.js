import { appVersion } from "./version.js";
import { URLSearchParams } from "node:url";

const assetVersion = appVersion;
const LOCAL_ASSET_EXTENSION = /\.(?:css|js)$/i;
const EXTERNAL_URL_PREFIX = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/**
 * @param {string} assetUrl
 */
function withAssetVersion(assetUrl, version = assetVersion) {
  const value = String(assetUrl || "").trim();
  const normalizedVersion = String(version || "").trim();

  if (!value || !normalizedVersion || EXTERNAL_URL_PREFIX.test(value)) {
    return value;
  }

  const hashIndex = value.indexOf("#");
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const queryIndex = withoutHash.indexOf("?");
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  if (!LOCAL_ASSET_EXTENSION.test(pathname)) {
    return value;
  }

  const search = new URLSearchParams(queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "");
  search.set("v", normalizedVersion);
  return `${pathname}?${search.toString()}${hash}`;
}

/**
 * @param {string} contents
 */
function decorateHtmlAssetUrls(contents, version = assetVersion) {
  return String(contents || "").replace(
    /\b(src|href)=(['"])([^'"]+)\2/gi,
    (match, attribute, quote, assetUrl) => {
      const versionedUrl = withAssetVersion(assetUrl, version);
      return versionedUrl === assetUrl
        ? match
        : `${attribute}=${quote}${versionedUrl}${quote}`;
    },
  );
}

/**
 * @param {string} contents
 */
function injectAssetVersionBootstrap(contents, version = assetVersion) {
  const normalizedVersion = String(version || "").trim();
  const decorated = String(contents || "");

  if (decorated.includes("data-asset-version-bootstrap")) {
    return decorated;
  }

  const metadata = `<meta data-asset-version content="${escapeHtmlAttribute(normalizedVersion)}">`;
  const bootstrap = '<script data-asset-version-bootstrap src="/js/shared/asset-version.js"></script>';
  if (/<\/head>/i.test(decorated)) {
    return decorated.replace(/<\/head>/i, `    ${metadata}\n    ${bootstrap}\n  </head>`);
  }
  return decorated.replace(/(<head\b[^>]*>)/i, `$1\n    ${metadata}\n    ${bootstrap}`);
}

/**
 * @param {string} value
 */
function escapeHtmlAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export {
  assetVersion,
  decorateHtmlAssetUrls,
  injectAssetVersionBootstrap,
  withAssetVersion,
};
