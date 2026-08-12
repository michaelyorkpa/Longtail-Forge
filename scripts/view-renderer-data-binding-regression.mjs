import assert from "node:assert/strict";
import vm from "node:vm";

import { createFakeBrowserContext } from "./test-support/fake-dom.mjs";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const builder = readText("public/js/shared/view-builder.js");
const renderer = readText("public/js/shared/view-renderer.js");
const responseRecords = readText("public/js/shared/view-response-records.js");
const surfaceDescriptor = readText("public/js/shared/view-surface-descriptor.js");
const staticService = readText("src/services/static.service.js");
const changelog = readText("CHANGELOG.md");

assert.match(renderer, /api\.getJson\(route, \{ cache: "no-store" \}\)/, "Renderer should fetch dataSource routes through shared api-client");
assert.match(renderer, /appendFilterQuery\(descriptor\.dataSource\.route/, "Renderer should derive the fetch route from the descriptor dataSource route");
assert.doesNotMatch(renderer, /\bfetch\(/, "Renderer should not bypass shared api-client with direct fetch");
assert.match(renderer, /bindRecord\(record, descriptor\.dataSource\.fieldBindings/, "Renderer should map records through descriptor fieldBindings");
assert.match(renderer, /responseRecords\.read\(body, descriptor\.dataSource\.recordsKey\)/, "Renderer should select response records through the checked declared-key adapter");
assert.doesNotMatch(renderer, /extractRecords|Object\.values\(body\)|\["records", "items", "data"/, "Renderer should not guess response envelope keys");
assert.match(renderer, /Object\.defineProperty\(surface, "refresh"/, "Rendered surfaces should expose a descriptor-driven refresh path");
assert.match(staticService, /app-shell-bootstrap\.js[\s\S]*view-surface-descriptor\.js[\s\S]*view-response-records\.js/, "The checked descriptor and response adapters should load before page assets");

const adapterContext = vm.createContext({ window: { LongtailForge: {} } });
vm.runInContext(responseRecords, adapterContext, { filename: "view-response-records.js" });
const readResponseRecords = adapterContext.window.LongtailForge.viewResponseRecords.read;
assert.deepEqual(
  plain(readResponseRecords({ records: [{ id: "compatibility" }], samples: [{ id: "declared" }] }, "samples")),
  [{ id: "declared" }],
  "A declared response key should win over compatibility candidates",
);
assert.deepEqual(plain(readResponseRecords({ records: [{ id: "legacy" }] })), [{ id: "legacy" }], "Legacy descriptor envelopes should retain the measured compatibility fallback");
assert.deepEqual(plain(readResponseRecords([{ id: "array" }], "records")), [{ id: "array" }], "Top-level array responses should remain compatible");
assert.deepEqual(plain(readResponseRecords({ resultSet: [{ id: "first-array" }] })), [{ id: "first-array" }], "Unknown legacy envelope keys should retain the first-array fallback");

const context = createFakeBrowserContext({ responses: [
  {
    records: [{ record_id: "compatibility-decoy", name: "Wrong envelope" }],
    samples: [
      {
        record_id: "sample-1",
        name: "Alpha",
        state: "Active",
        owner: "Sam",
        stats: { count: 2 },
        children: [
          { title: "First item", description: "Ready" },
        ],
      },
    ],
  },
  { records: [{ record_id: "compatibility-decoy" }], samples: [] },
], iconButton: { iconClass: false, iconOnlyText: true } });
vm.runInNewContext(surfaceDescriptor, context, { filename: "view-surface-descriptor.js" });
vm.runInNewContext(builder, context, { filename: "view-builder.js" });
vm.runInNewContext(responseRecords, context, { filename: "view-response-records.js" });
vm.runInNewContext(renderer, context, { filename: "view-renderer.js" });

const host = context.document.createElement("main");
const surface = context.window.LongtailForge.view.renderSurface(descriptor(), host);
assert.equal(typeof surface.refresh, "function", "Rendered surfaces should expose refresh()");
assert.match(surface.textContent, /Loading records/, "Initial data-bound render should show a loading status");

await surface.refresh();
assert.equal(context.window.LongtailForge.api.calls[0], "/api/sample-records", "Renderer should request the descriptor dataSource route");
assert.equal(surface.viewState.records[0].id, "sample-1", "Field bindings should map source IDs onto descriptor IDs");
assert.equal(surface.viewState.records[0].title, "Alpha", "Field bindings should map source names onto descriptor titles");
assert.match(surface.textContent, /Alpha/, "Bound table/detail/index text should render mapped title values");
assert.match(surface.textContent, /Active/, "Bound table/detail/badge text should render mapped status values");
assert.match(surface.textContent, /Sam/, "Bound detail metadata should render mapped owner values");
assert.match(surface.textContent, /2/, "Bound summary panels should render nested mapped values");
assert.match(surface.textContent, /First item/, "Bound item collections should render nested item rows");

await surface.refresh();
assert.match(surface.textContent, /No sample records/, "Empty responses should render descriptor empty states");

const errorContext = createFakeBrowserContext({ responses: [new Error("Data unavailable")], iconButton: { iconClass: false, iconOnlyText: true } });
vm.runInNewContext(surfaceDescriptor, errorContext, { filename: "view-surface-descriptor.js" });
vm.runInNewContext(builder, errorContext, { filename: "view-builder.js" });
vm.runInNewContext(responseRecords, errorContext, { filename: "view-response-records.js" });
vm.runInNewContext(renderer, errorContext, { filename: "view-renderer.js" });
const errorHost = errorContext.document.createElement("main");
const errorSurface = errorContext.window.LongtailForge.view.renderSurface(descriptor(), errorHost);
await errorSurface.refresh();
assert.match(errorSurface.textContent, /Data unavailable/, "Renderer should render framework-owned error states");

const noSelectionContext = createFakeBrowserContext({ responses: [
  {
    samples: [
      {
        record_id: "sample-2",
        name: "Beta",
        state: "Active",
      },
    ],
  },
], iconButton: { iconClass: false, iconOnlyText: true } });
vm.runInNewContext(surfaceDescriptor, noSelectionContext, { filename: "view-surface-descriptor.js" });
vm.runInNewContext(builder, noSelectionContext, { filename: "view-builder.js" });
vm.runInNewContext(responseRecords, noSelectionContext, { filename: "view-response-records.js" });
vm.runInNewContext(renderer, noSelectionContext, { filename: "view-renderer.js" });
const noSelectionHost = noSelectionContext.document.createElement("main");
const noSelectionSurface = noSelectionContext.window.LongtailForge.view.renderSurface(noInitialSelectionDescriptor(), noSelectionHost);
await noSelectionSurface.refresh();
assert.equal(noSelectionSurface.viewState.selectedRecord, null, "Descriptors should be able to start with a blank detail selection");
assert.match(noSelectionSurface.textContent, /Choose a sample/, "Blank detail surfaces should keep descriptor guidance visible");

assert.match(changelog, /## Version 0\.33\.5\.16\.6 - /, "Changelog should include renderer data-binding version");

console.log("View renderer data binding regression passed.");

function descriptor() {
  return {
    id: "sample-data-bound",
    layout: "table-page",
    pageHeader: {
      title: "Samples",
      description: "Data-bound samples.",
    },
    indexPanel: {
      title: "Sample index",
      itemTitleField: "title",
      itemSubtitleField: "status",
      itemMetaFields: ["meta"],
      emptyState: {
        title: "No sample records",
      },
    },
    table: {
      columns: [
        { field: "title", label: "Title" },
        { field: "status", label: "Status" },
      ],
      emptyState: {
        title: "No sample records",
      },
    },
    detail: {
      header: {
        titleField: "title",
        metaField: "meta",
        badges: [{ field: "status" }],
      },
      summaryPanels: [
        {
          title: "Summary",
          items: [{ label: "Items", field: "itemCount" }],
        },
      ],
      itemForm: {
        fields: [
          { field: "title", type: "text", label: "Title" },
          { field: "status", type: "text", label: "Status" },
        ],
      },
      itemRows: {
        itemsField: "items",
        itemTitleField: "title",
        itemSubtitleField: "description",
        emptyState: {
          title: "No items",
        },
      },
    },
    dataSource: {
      route: "/api/sample-records",
      recordsKey: "samples",
      fieldBindings: {
        id: "record_id",
        title: "name",
        status: "state",
        meta: "owner",
        itemCount: "stats.count",
        items: "children",
      },
    },
  };
}

function noInitialSelectionDescriptor() {
  const next = descriptor();
  next.indexPanel = {
    ...next.indexPanel,
    initialSelection: "none",
    collapseOnSelect: true,
  };
  next.detail = {
    header: {
      title: "Choose a sample",
      description: "Select a sample to inspect it.",
    },
    emptyState: {
      title: "Choose a sample",
      message: "Select a sample to inspect it.",
    },
  };
  return next;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
