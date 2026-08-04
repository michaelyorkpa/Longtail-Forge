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

function createLegalContentService(runtimeConfig = config) {
  async function read(documentId) {
    const definition = DOCUMENT_CONFIG[documentId];
    if (!definition) {
      return null;
    }

    const markdown = await fs.readFile(runtimeConfig.legal[definition.pathKey], "utf8");
    return {
      id: documentId,
      title: definition.title,
      bodyHtml: renderMarkdownToHtml(markdown),
    };
  }

  return Object.freeze({ read });
}

const legalContentService = createLegalContentService();

export { createLegalContentService, legalContentService };
