// The control flow every module record indexer repeated, and nothing more.
//
// `0.33.33.45.2` took this from six copies: Lists, Tasks, Notes, Time Tracking, Clients and
// Projects. Each module still decides which records it reads, which of them are eligible, and
// what document each becomes. This file only sequences those three calls, so it imports no module
// and knows no record type.

/** @typedef {import("../../types/framework-contracts.js").SearchReference} SearchReference */

/**
 * Answer one search reference from a module's own reader and document builder.
 *
 * - **No `recordId`:** read every record, then build each document in order, one at a time, and
 *   answer `{ documents }`. A record whose builder answers no document is left out - Notes'
 *   builder does that for a note search must not show; every other builder always answers one.
 * - **A `recordId`:** read that record. Answer `null` when there is none, otherwise its document.
 *
 * Nothing runs in parallel and nothing is caught: a reader or builder failure rejects exactly as
 * it did in each module's own copy.
 * @template RecordValue, DocumentValue
 * @param {SearchReference} reference
 * @param {{
 *   readAll: (workspaceId: string) => Promise<RecordValue[]>,
 *   readOne: (workspaceId: string, recordId: string) => Promise<RecordValue | null | undefined>,
 *   toDocument: (record: RecordValue) => Promise<DocumentValue | null>,
 * }} source
 */
async function indexSearchReference({ workspaceId, recordId }, { readAll, readOne, toDocument }) {
  if (!recordId) {
    const records = await readAll(workspaceId);
    /** @type {DocumentValue[]} */
    const documents = [];

    for (const record of records) {
      const document = await toDocument(record);
      if (document) {
        documents.push(document);
      }
    }

    return { documents };
  }

  const record = await readOne(workspaceId, recordId);

  if (!record) {
    return null;
  }

  return toDocument(record);
}

export { indexSearchReference };
