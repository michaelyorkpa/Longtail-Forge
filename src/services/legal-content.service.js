import fs from "node:fs/promises";
import { config } from "../config.js";
import { renderMarkdownToHtml } from "../core/markdown/markdown.service.js";

const DOCUMENT_CONFIG = Object.freeze({
  terms: Object.freeze({
    title: "Terms of Service",
    pathKey: "termsContentPath",
  }),
  privacy: Object.freeze({
    title: "Privacy Notice",
    pathKey: "privacyContentPath",
  }),
});

/** @typedef {keyof typeof DOCUMENT_CONFIG} LegalDocumentId */

/** @param {typeof config} [runtimeConfig] */
function createLegalContentService(runtimeConfig = config) {
  /**
   * @param {string} documentId
   */
  async function read(documentId) {
    if (!Object.hasOwn(DOCUMENT_CONFIG, documentId)) {
      return null;
    }
    const legalDocumentId = /** @type {LegalDocumentId} */ (documentId);
    const definition = DOCUMENT_CONFIG[legalDocumentId];

    const markdown = await fs.readFile(runtimeConfig.legal[definition.pathKey], "utf8");
    return {
      id: legalDocumentId,
      title: definition.title,
      bodyHtml: renderMarkdownToHtml(markdown),
    };
  }

  return Object.freeze({ read });
}

const legalContentService = createLegalContentService();

export { createLegalContentService, legalContentService };
