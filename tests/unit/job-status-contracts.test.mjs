import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";

/** @param {string} path */
const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const service = read("src/services/jobs.service.js");
const routes = read("src/routes/jobs.routes.js");
const pagination = read("src/core/bounded-pagination.js");
const schema = read("src/db/migrations/065_job_outbox_schema.sql");
const consumer = read("public/js/workspace-settings.js");
const contracts = read("src/types/browser-contracts.d.ts");

/** @param {string} source @param {string} opener @param {string} [closer] */
function functionBody(source, opener, closer = "\n}\n") {
  const start = source.indexOf(opener);
  assert.notEqual(start, -1, opener + " must exist");
  const end = source.indexOf(closer, start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** Member names of an object literal, shorthand properties included. @param {string} literal */
function membersOf(literal) {
  return [...literal.matchAll(/(?:^|[{,])\s*([A-Za-z_]\w*)\s*(?=[:,}])/g)].map((entry) => entry[1]).sort();
}

/** @param {string} name */
function declaredInterface(name) {
  const at = contracts.search(new RegExp("export interface " + name + "(?: extends \\w+)? \\{"));
  assert.notEqual(at, -1, name + " must be declared");
  return contracts.slice(at, contracts.indexOf("\n}", at));
}

/** @param {string} name */
function declaredMembers(name) {
  return [...declaredInterface(name).matchAll(/^ {2}(\w+)\??:/gm)].map((entry) => entry[1]).sort();
}

/** The shipped reader block, instantiated from the page's own source. */
function shippedReader() {
  const start = consumer.indexOf("  /** The four states the counting query groups by");
  const end = consumer.indexOf("  async function loadJobObservability(options = {}) {");
  assert.ok(start !== -1 && end > start, "the reader block must exist above loadJobObservability");
  return new Function(consumer.slice(start, end) + `
    return {
      isJobFailureSummary,
      isJobReadout,
      readJobStatusResponse,
      tables: {
        countKeys: JOB_COUNT_KEYS,
        nullableText: JOB_FAILURE_NULLABLE_TEXT,
        paginationIntegers: JOB_PAGINATION_INTEGERS,
        statuses: JOB_FAILURE_STATUSES,
      },
    };`)();
}

const failure = (overrides = {}) => ({
  attemptCount: 3,
  availableAt: "2026-09-01T10:00:00.000Z",
  completedAt: null,
  createdAt: "2026-09-01T09:00:00.000Z",
  deadAt: null,
  jobId: "job_71",
  jobType: "notifications.deliver",
  lastError: "Recipient lookup failed safely.",
  lockedAt: null,
  lockedBy: null,
  maxAttempts: 3,
  priority: 0,
  status: "failed",
  updatedAt: "2026-09-01T11:00:00.000Z",
  ...overrides,
});

const paginationEnvelope = (overrides = {}) => ({
  hasMore: false,
  limit: 10,
  maxPageSize: 50,
  nextCursor: "",
  offset: 0,
  returned: 1,
  total: 1,
  ...overrides,
});

const readout = (overrides = {}) => ({
  counts: { dead: 1, failed: 2, pending: 3, running: 0 },
  recentFailures: { items: [failure()], pagination: paginationEnvelope() },
  ...overrides,
});

const summaryLiteral = functionBody(service, "function shapeFailureSummary(row) {", "\n  };");
// Sliced from the function opener, not from the literal's first member: anchoring on a member
// meant a break that added or reordered one destroyed the anchor, so the membership claim
// failed as "must exist" instead of as itself.
const readAdminReadout = functionBody(service, "async function readAdminReadout(session, query = {}) {");
const readoutLiteral = readAdminReadout.slice(readAdminReadout.indexOf("  return {"));

describe("the jobs status route and its authorization", () => {
  it("answers the readout by name, under no-store, and spreads nothing", () => {
    const route = functionBody(routes, 'jobsRoutes.get("/jobs/status"', "\n}));");
    assert.match(route, /const jobs = await jobsService\.readAdminReadout\(request\.session, request\.query\);/,
      "the route must call the traced producer with the session and the query");
    assert.match(route, /response\.setHeader\("Cache-Control", "no-store"\);/,
      "an operational readout must not be cached");
    assert.match(route, /response\.status\(200\)\.json\(\{ jobs \}\);/,
      "the envelope must wrap the readout by name");
    assert.deepEqual(declaredMembers("BrowserJobStatusResponse"), ["jobs"],
      "so the declared envelope is exactly one member");
  });

  it("is workspace-scoped before the handler runs", () => {
    assert.match(routes, /jobsRoutes\.get\("\/jobs\/status", asyncRoute\(/,
      "the route must use the workspace async route wrapper");
    assert.match(routes, /import \{ workspaceAsyncRoute as asyncRoute \} from "\.\.\/utils\/http\.js";/,
      "and that wrapper must be the workspace one");
  });

  it("asserts the manage right before reading anything", () => {
    const body = readAdminReadout;
    assert.match(body, /await permissionsService\.assertCan\(session, REQUIRED_PERMISSION, \{\n {4}operation: "read",\n {4}workspace_id: session\.workspace_id,\n {2}\}\);/,
      "the readout must assert the required permission in the session's own workspace");
    assert.match(service, /const REQUIRED_PERMISSION = "workspace_settings\.manage";/,
      "and that permission must be workspace settings management");
    assert.ok(
      body.indexOf("assertCan") < body.indexOf("readStatusCounts"),
      "the assertion must come before any job row is read",
    );
  });
});

describe("the readout producer", () => {
  it("reconstructs two members, each of which reconstructs its own", () => {
    // The literal nests, so membership is read at the top indent rather than by scanning the
    // whole block - which would have counted the pagination helper's arguments as members.
    const top = [...readoutLiteral.matchAll(/^ {4}(\w+)[:,]/gm)].map((entry) => entry[1]).sort();
    assert.deepEqual(top, ["counts", "recentFailures"],
      "the readout must carry exactly its two members");
    assert.ok(!/^ {4}\.\.\./m.test(readoutLiteral),
      "a spread would make the exact membership unearned");
    // The one spread inside it is the producer's own normalised pagination, handed to the
    // helper that reconstructs the envelope by name - the total-reconstruction case, not the
    // untrusted-body one, which is what lets the reused pagination contract stay exact.
    assert.match(readoutLiteral, /pagination: boundedPaginationEnvelope\(\{\n {8}\.\.\.pagination,/,
      "the only spread must be the producer's own pagination, into the reconstructing helper");
    assert.deepEqual(declaredMembers("BrowserJobReadout"), ["counts", "recentFailures"],
      "and the declaration must mirror it");
    assert.deepEqual(declaredMembers("BrowserJobRecentFailures"), ["items", "pagination"],
      "the recent failures are exactly the page and its pagination");
  });

  it("counts four states, always writes all four, and never counts completed work", () => {
    const body = functionBody(service, "function shapeStatusCounts(rows) {");
    assert.match(body, /const counts = \{\n {4}dead: 0,\n {4}failed: 0,\n {4}pending: 0,\n {4}running: 0,\n {2}\};/,
      "all four counts must be written before any row is seen");
    assert.match(body, /if \(isJobReadoutStatus\(row\.status\)\) \{\n {6}counts\[row\.status\] = Number\(row\.count \|\| 0\);/,
      "and a row may only overwrite a status the readout recognises");
    const counting = functionBody(service, "function readStatusCounts(workspaceId) {");
    assert.match(counting, /AND status IN \('pending', 'running', 'failed', 'dead'\)/,
      "the counting query must group exactly the four states the readout reports");
    assert.doesNotMatch(counting, /'completed'/, "a completed job is not something this readout counts");
    assert.deepEqual(declaredMembers("BrowserJobStatusCounts"), ["dead", "failed", "pending", "running"],
      "and the declared counts must be exactly those four");
  });

  it("closes the recognised status vocabulary at the producer's own predicate", () => {
    const produced = [...functionBody(service, "function isJobReadoutStatus(value) {")
      .matchAll(/value === "([a-z]+)"/g)].map((entry) => entry[1]).sort();
    assert.deepEqual(produced, ["dead", "failed", "pending", "running"],
      "the recognised statuses must be exactly the four the predicate names");
    assert.deepEqual([...shippedReader().tables.countKeys].sort(), produced,
      "and the reader must check exactly those four count keys");
  });

  it("uses the shared bounded-pagination helper rather than a shape of its own", () => {
    const body = readAdminReadout;
    assert.match(body, /const pagination = normalizeBoundedPagination\(query, \{/,
      "the request must be normalised by the shared helper");
    assert.match(body, /pagination: boundedPaginationEnvelope\(\{/,
      "and the answer must be built by the shared helper");
    assert.match(service, /import \{ boundedPaginationEnvelope, normalizeBoundedPagination \} from "\.\.\/core\/bounded-pagination\.js";/,
      "from the one module that owns it");
    assert.deepEqual(
      membersOf(functionBody(pagination, "function boundedPaginationEnvelope(pagination = {}, options = {}) {", "\n  };")
        .slice(functionBody(pagination, "function boundedPaginationEnvelope(pagination = {}, options = {}) {", "\n  };").indexOf("return {"))),
      declaredMembers("BrowserBoundedPagination"),
      "so the reused contract must still equal what that helper reconstructs",
    );
    assert.match(declaredInterface("BrowserJobRecentFailures"), /pagination: BrowserBoundedPagination;/,
      "and this response must reuse it rather than declare a second pagination shape");
  });

  it("bounds the failure page rather than answering the whole history", () => {
    assert.match(service, /const RECENT_FAILURE_DEFAULT_PAGE_SIZE = 10;/, "the page must have a default size");
    assert.match(service, /const RECENT_FAILURE_MAX_PAGE_SIZE = 50;/, "and a maximum");
    assert.match(
      readAdminReadout,
      /defaultLimit: RECENT_FAILURE_DEFAULT_PAGE_SIZE,\n {4}maxLimit: RECENT_FAILURE_MAX_PAGE_SIZE,/,
      "and both must be handed to the normaliser",
    );
  });
});

describe("the failure summary is a safe projection, not the jobs row", () => {
  it("reconstructs fourteen members by name and spreads nothing", () => {
    assert.deepEqual(
      membersOf(summaryLiteral),
      [
        "attemptCount", "availableAt", "completedAt", "createdAt", "deadAt", "jobId", "jobType",
        "lastError", "lockedAt", "lockedBy", "maxAttempts", "priority", "status", "updatedAt",
      ],
      "the failure summary must carry exactly its fourteen members",
    );
    assert.ok(!summaryLiteral.includes("..."), "a spread would make the exact membership unearned");
    assert.deepEqual(declaredMembers("BrowserJobFailureSummary"), membersOf(summaryLiteral),
      "and the declaration must mirror the producer");
  });

  it("leaves the payload and the dedupe key behind, by enumerating its columns", () => {
    assert.match(schema, /^ {2}dedupe_key TEXT,$/m, "the jobs table really does carry a dedupe key");
    assert.match(schema, /^ {2}payload_json TEXT NOT NULL DEFAULT '\{\}',$/m, "and a payload");
    const query = functionBody(service, "function readRecentFailures(workspaceId, pagination) {");
    assert.doesNotMatch(query, /SELECT\s+\*/, "the failure query must enumerate its columns rather than select everything");
    assert.doesNotMatch(query, /payload_json|dedupe_key/,
      "and must not select the payload or the dedupe key");
    assert.doesNotMatch(summaryLiteral, /payload|dedupe/i,
      "so no member of the summary can carry them");
    for (const member of ["payload", "payloadJson", "dedupeKey", "workspaceId"]) {
      assert.ok(!declaredMembers("BrowserJobFailureSummary").includes(member),
        member + " must not be a browser contract member");
    }
  });

  it("collapses the recorded failure text rather than passing a column through", () => {
    assert.match(summaryLiteral, /lastError: safeText\(row\.last_error\),/,
      "the failure text must go through the shaper's own normaliser");
    assert.match(
      functionBody(service, "function safeText(value) {"),
      /return String\(value \|\| ""\)\.replace\(\/\\s\+\/g, " "\)\.trim\(\);/,
      "which collapses whitespace and always answers a string",
    );
  });

  it("renders the failure text as text rather than as markup", () => {
    const row = functionBody(consumer, "  function createJobFailureRow(item) {", "\n  }\n");
    assert.match(row, /message\.textContent = String\(item\.lastError \|\| ""\)\.trim\(\) \|\| "No failure summary\.";/,
      "the one member the server does not construct must reach the page as textContent");
    assert.doesNotMatch(row, /innerHTML|insertAdjacentHTML/,
      "and never as markup");
  });

  it("can only list failed and dead work", () => {
    const query = functionBody(service, "function readRecentFailures(workspaceId, pagination) {");
    assert.match(query, /AND status IN \('failed', 'dead'\)/,
      "the failure query must select only failed and dead jobs");
    assert.match(query, /AND last_error IS NOT NULL/,
      "and only ones that recorded a failure");
    assert.match(schema, /status TEXT NOT NULL DEFAULT 'pending' CHECK \(status IN \('pending', 'running', 'completed', 'failed', 'dead'\)\)/,
      "the column allows five states");
    const alias = contracts.slice(contracts.indexOf("export type BrowserJobFailureStatus ="));
    assert.deepEqual(
      [...alias.slice(0, alias.indexOf(";")).matchAll(/"([a-z]+)"/g)].map((entry) => entry[1]).sort(),
      ["dead", "failed"],
      "but the declared failure status must be only the two this query selects",
    );
  });

  it("takes its attempt bounds from the constraints the table carries", () => {
    assert.match(schema, /attempt_count INTEGER NOT NULL DEFAULT 0 CHECK \(attempt_count >= 0\)/,
      "attempts are constrained non-negative by the schema");
    assert.match(schema, /max_attempts INTEGER NOT NULL DEFAULT 3 CHECK \(max_attempts > 0\)/,
      "and the maximum is constrained positive");
    assert.match(declaredInterface("BrowserJobFailureSummary"), /the `jobs` table constrains `attempt_count >= 0`/,
      "and the contract must say where its bounds come from");
    assert.match(declaredInterface("BrowserJobFailureSummary"), /the `jobs` table constrains `max_attempts > 0`/,
      "for both bounds");
  });

  it("counts the failure total from the same filter the page uses", () => {
    assert.match(
      functionBody(service, "function countRecentFailures(workspaceId) {"),
      /AND status IN \('failed', 'dead'\)\n {2}AND last_error IS NOT NULL;/,
      "the total must count exactly the rows the page can page through",
    );
  });
});

describe("the shipped reader, run against real bodies", () => {
  const { isJobFailureSummary, readJobStatusResponse, tables } = shippedReader();

  it("checks every member the failure shaper writes", () => {
    const covered = [
      ...tables.nullableText, "jobId", "jobType", "lastError", "status",
      "attemptCount", "maxAttempts", "priority",
    ].sort();
    assert.deepEqual(covered, membersOf(summaryLiteral), "the reader must check every summary member");
    assert.deepEqual([...tables.statuses].sort(), ["dead", "failed"],
      "against the two statuses the query selects");
    assert.deepEqual([...tables.paginationIntegers].sort(), ["limit", "maxPageSize", "offset", "returned"],
      "and the four pagination integers the helper normalises");
  });

  it("accepts a real readout", () => {
    const result = readJobStatusResponse({ jobs: readout() });
    assert.ok(result, "a real readout must be accepted");
    assert.equal(result.counts.failed, 2, "and keep its counts");
    assert.equal(result.recentFailures.items.length, 1, "and its failures");
  });

  it("accepts a workspace with no failed work at all", () => {
    const quiet = readout({
      counts: { dead: 0, failed: 0, pending: 0, running: 0 },
      recentFailures: { items: [], pagination: paginationEnvelope({ returned: 0, total: 0 }) },
    });
    const result = readJobStatusResponse({ jobs: quiet });
    assert.ok(result, "four real zeros are a real readout");
    assert.equal(result.recentFailures.items.length, 0, "and an empty page is a real page");
  });

  it("accepts a producer that had no total to give", () => {
    assert.ok(
      readJobStatusResponse({ jobs: readout({
        recentFailures: { items: [failure()], pagination: paginationEnvelope({ total: null }) },
      }) }),
      "the helper answers null when there was no count, and that is not malformed",
    );
  });

  it("refuses a body that is not this producer's envelope", () => {
    for (const bad of [null, undefined, 7, "jobs", [], {}, { jobs: null }, { jobs: [] }, { jobs: "ok" }]) {
      assert.equal(readJobStatusResponse(bad), null, "an unusable jobs body must be refused");
    }
  });

  it("refuses a readout missing any one of the four counts", () => {
    for (const key of ["dead", "failed", "pending", "running"]) {
      /** @type {Record<string, number>} */
      const counts = { dead: 1, failed: 2, pending: 3, running: 0 };
      delete counts[key];
      assert.equal(readJobStatusResponse({ jobs: readout({ counts }) }), null,
        "a missing " + key + " count is not a workspace with none of that work");
    }
    assert.equal(readJobStatusResponse({ jobs: readout({ counts: {} }) }), null,
      "and neither is an empty counts record");
  });

  it("refuses a count that is not a count", () => {
    for (const bad of ["2", null, undefined, -1, 1.5, Number.NaN, {}, true]) {
      assert.equal(
        readJobStatusResponse({ jobs: readout({ counts: { dead: 0, failed: bad, pending: 0, running: 0 } }) }),
        null,
        "a malformed count must make the readout unreadable rather than zero: " + String(bad),
      );
    }
  });

  it("refuses the whole readout when one failure row is malformed", () => {
    const result = readJobStatusResponse({ jobs: readout({
      recentFailures: {
        items: [failure(), { jobId: "job_72" }],
        pagination: paginationEnvelope({ returned: 2, total: 2 }),
      },
    }) });
    assert.equal(result, null, "a failure the page cannot vouch for must not become a shorter history");
  });

  it("refuses a failure row whose status is not one this query selects", () => {
    for (const bad of ["pending", "running", "completed", "", null, undefined, "Failed"]) {
      assert.equal(isJobFailureSummary(failure({ status: bad })), false,
        "this list can only contain failed and dead work: " + String(bad));
    }
  });

  it("refuses a failure row whose text members are not text", () => {
    for (const key of ["jobId", "jobType", "lastError"]) {
      assert.equal(isJobFailureSummary(failure({ [key]: null })), false,
        "a malformed " + key + " must refuse the row");
    }
  });

  it("accepts null timestamps, because the shaper maps an empty column to null", () => {
    for (const key of ["availableAt", "completedAt", "createdAt", "deadAt", "lockedAt", "lockedBy", "updatedAt"]) {
      assert.equal(isJobFailureSummary(failure({ [key]: null })), true,
        key + " may legitimately be null");
      assert.equal(isJobFailureSummary(failure({ [key]: 7 })), false,
        key + " may not be anything else");
    }
  });

  it("refuses attempt bounds the table's own constraints forbid", () => {
    assert.equal(isJobFailureSummary(failure({ attemptCount: -1 })), false, "attempts cannot be negative");
    assert.equal(isJobFailureSummary(failure({ attemptCount: 0 })), true, "but zero attempts is real");
    assert.equal(isJobFailureSummary(failure({ maxAttempts: 0 })), false, "the maximum cannot be zero");
    assert.equal(isJobFailureSummary(failure({ maxAttempts: 1.5 })), false, "nor fractional");
    assert.equal(isJobFailureSummary(failure({ priority: -5 })), true,
      "priority has no such constraint, so a negative one is not malformed");
    assert.equal(isJobFailureSummary(failure({ priority: 1.5 })), false, "but it is still an integer column");
  });

  it("refuses malformed pagination rather than paging from it", () => {
    for (const bad of [
      undefined, null, {}, "none",
      paginationEnvelope({ hasMore: "yes" }),
      paginationEnvelope({ nextCursor: null }),
      paginationEnvelope({ limit: -1 }),
      paginationEnvelope({ offset: "0" }),
      paginationEnvelope({ returned: 1.5 }),
      paginationEnvelope({ maxPageSize: undefined }),
      paginationEnvelope({ total: "12" }),
    ]) {
      assert.equal(
        readJobStatusResponse({ jobs: readout({ recentFailures: { items: [failure()], pagination: bad } }) }),
        null,
        "malformed pagination must not decide what the page appends next",
      );
    }
  });

  it("refuses a recentFailures section that is not one", () => {
    for (const bad of [undefined, null, 7, [], { pagination: paginationEnvelope() }, { items: [] }]) {
      assert.equal(readJobStatusResponse({ jobs: readout({ recentFailures: bad }) }), null,
        "the failure page must be the two members the producer writes");
    }
    assert.equal(
      readJobStatusResponse({ jobs: readout({ recentFailures: { items: "none", pagination: paginationEnvelope() } }) }),
      null,
      "and its items must be a list",
    );
  });

  it("proves the failure list is a list before iterating it", () => {
    // This guard cannot be attacked behaviourally: removing it makes `every` throw rather than
    // refuse, so what a break changes is a clean refusal into a crash. It is pinned by source
    // instead, the way the active-timer container check was.
    const reader = functionBody(consumer, "  function isJobReadout(value) {", "\n  }\n");
    assert.match(reader, /\|\| !Array\.isArray\(recentFailures\.items\)\) \{\n\s+return false;/,
      "the container must be proved a list before every() is called on it");
    assert.ok(
      reader.indexOf("Array.isArray(recentFailures.items)") < reader.indexOf("recentFailures.items.every"),
      "and that proof must come first",
    );
  });

  it("answers the producer's own readout rather than a rebuilt one", () => {
    const wire = readout({ aFutureMember: 1 });
    const result = readJobStatusResponse({ jobs: wire });
    assert.ok(result, "an unrecognised member must not refuse the readout");
    assert.equal(result, wire, "and a vouched readout is passed on by identity, not copied");
  });
});

describe("the workspace settings consumer", () => {
  const load = functionBody(consumer, "  async function loadJobObservability(options = {}) {", "\n  }\n");
  const render = functionBody(consumer, "  function renderJobObservability(jobs, options = {}) {", "\n  }\n");

  it("no longer defaults an unreadable readout to an empty one", () => {
    assert.ok(!consumer.includes("result.jobs || {}"), "the raw readout default must be gone");
    assert.ok(!render.includes("jobs.counts || {}"), "the counts default must be gone");
    assert.ok(!render.includes("recentFailures.pagination || {}"), "the pagination default must be gone");
    assert.ok(!render.includes("Array.isArray(recentFailures.items)"),
      "the items container test must be gone, because the reader has already made it true");
  });

  it("reads the response through the vouching reader", () => {
    assert.match(load, /const jobs = readJobStatusResponse\(\n\s+await requireApi\(\)\.getJson\(`\/api\/jobs\/status\?\$\{params\.toString\(\)\}`, \{ cache: "no-store" \}\),\n\s+\);/,
      "the readout must be read through its reader, from the bounded route");
    assert.match(load, /throw new Error\("The job status readout could not be read\./,
      "and an unreadable readout must be refused rather than rendered");
  });

  it("refuses before anything reaches the accumulated failure list", () => {
    const refusal = load.indexOf("could not be read.");
    assert.notEqual(refusal, -1, "an unreadable readout must be refused");
    assert.ok(refusal < load.indexOf("renderJobObservability(jobs,"),
      "the refusal must come before the render that appends to accumulated state");
    assert.match(render, /jobObservabilityFailureItems = options\.append\n\s+\? \[\.\.\.jobObservabilityFailureItems, \.\.\.incomingItems\]\n\s+: incomingItems;/,
      "and that render is what accumulates, which is why nothing unvouched may reach it");
  });

  it("routes the refusal into the readout's existing error state", () => {
    assert.ok(
      load.indexOf("could not be read.") < load.indexOf("} catch (error) {"),
      "the refusal must land in the existing catch",
    );
    assert.match(load, /\} catch \(error\) \{\n\s+renderJobObservabilityError\(error\);/,
      "which is the page's own job-observability failure path");
    assert.match(
      functionBody(consumer, "  function renderJobObservabilityError(error) {", "\n  }\n"),
      /createRuntimeDiagnosticItem\("Jobs", "Unavailable"\)/,
      "and that path says the readout is unavailable rather than showing zeros",
    );
  });

  it("still prints how many failures are shown against the producer's total", () => {
    assert.match(render, /`\$\{jobObservabilityFailureItems\.length\} of \$\{formatRuntimeNumber\(pagination\.total\)\}`/,
      "the page states its history as a fraction of the total, which a shortened list would falsify");
  });

  it("leaves the runtime diagnostics read to its own child", () => {
    assert.ok(consumer.includes("result.diagnostics || {}"),
      "the runtime diagnostics read is a different producer and is untouched here");
  });
});
