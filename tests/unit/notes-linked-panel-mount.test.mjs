import assert from "node:assert/strict";
import vm from "node:vm";
import { describe, it } from "vitest";
import { createFakeBrowserContext } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader } from "../../scripts/test-support/source-scan.mjs";

const source = createProjectTextReader().readText("public/js/shared/notes-linked-panel.js");

/**
 * The linked-notes panel's mount, render, unlink and event paths, through the real module.
 *
 * `0.33.33.39.29` took `notes-linked-panel.js` to zero and rewrote a handful of executable reads.
 * `mount` keeps the published `unknown` parameters and establishes the container's
 * `replaceChildren` before its first render; `emit` establishes `dispatchEvent` where it uses it;
 * the caller's options and each opaque link row are read through `panelFields`, which answers what
 * the member access answered and still fails on a missing value. These cases hold every one of
 * those to what it did, including where each malformed input fails.
 *
 * The view factory is left out, so the panel renders its own fallback list, whose Unlink button
 * drives `unlinkNote` directly.
 */

/** @typedef {Record<string, unknown>} Bag */

/** @param {unknown} value @returns {value is Bag} */
const isBag = (value) => value !== null && typeof value === "object";

/** @param {unknown} value @returns {value is (...args: unknown[]) => unknown} */
const isCallable = (value) => typeof value === "function";

const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

/** @param {Bag} [overrides] */
const note = (overrides = {}) => ({
  archived_at: null, body_excerpt: "note body", client_id: null, created_at: "2026-09-01",
  created_by_user_id: null, deleted_at: null, import_source: null, import_source_id: null,
  imported_at: null, library_bucket: "reference", library_bucket_source: "manual",
  linked_user_id: null, note_collection_id: null, note_id: "note-1", note_type: "note",
  owner_user_id: null, project_id: null, security_mode: "normal", slug: null, status: "active",
  task_id: null, ticket_id: null, title: "A note", updated_at: "2026-09-02",
  updated_by_user_id: null, visibility: "workspace", workspace_id: "ws-1",
  id: "note-1", label: "A note", excerpt: "note body", sourceUrl: "/notes/note-1", links: [],
  ...overrides,
});

/** @param {Bag[]} linkedNotes */
const panelBody = (linkedNotes) => ({
  actions: { canCreate: true, canLink: true, canUnlink: true, readonly: false },
  count: linkedNotes.length,
  emptyState: linkedNotes.length ? null : { action: { href: "x", label: "Add" }, body: "Nothing yet.", title: "No linked notes yet." },
  linkedNotes,
  moduleState: { enabled: true, historicalReadAccess: true, notesModuleEnabled: true, workspaceType: "business" },
  notes: linkedNotes.map(() => ({})),
  sort: "updated",
  target: { moduleId: "tasks", sourceUrl: "/tasks/t1", targetId: "t1", targetType: "task" },
});

class FakeCustomEvent {
  /** @param {string} type @param {{ detail?: unknown }} [init] */
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

/** @param {{ linkedNotes?: Bag[], holdFirstLoad?: boolean }} [options] */
function panel({ linkedNotes = [note()], holdFirstLoad = false } = {}) {
  /** @type {string[]} */
  const posts = [];
  let loads = 0;
  const context = createFakeBrowserContext({
    globals: { CustomEvent: FakeCustomEvent, URLSearchParams },
    longtailForge: {
      api: {
        getJson: (/** @type {string} */ route) => {
          if (!route.startsWith("/api/notes/for-target")) return Promise.resolve({ notes: [] });
          loads += 1;
          // Holding the load `mount` starts leaves its refresh pending, so the one under test is
          // the explicit refresh a caller awaits.
          return holdFirstLoad && loads === 1 ? new Promise(() => {}) : Promise.resolve(panelBody(linkedNotes));
        },
        postJson: async (/** @type {string} */ route) => { posts.push(route); return {}; },
        patchJson: async () => ({}),
        putJson: async () => ({}),
        deleteJson: async () => ({}),
      },
      errors: { caughtMessage: (/** @type {unknown} */ _error, /** @type {string} */ fallback) => fallback },
    },
  });
  const document = context.document;
  Object.assign(context.window, {
    URLSearchParams,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    Option: function Option(/** @type {string} */ text, /** @type {string} */ value) {
      const option = document.createElement("option");
      option.textContent = text;
      option.value = value;
      return option;
    },
  });
  vm.runInNewContext(source, context, { filename: "notes-linked-panel.js" });
  const api = context.window.LongtailForge?.notesLinkedPanel;
  assert.ok(isBag(api) && isCallable(api.mount));
  /** @param {unknown} container @param {unknown} [options] */
  const mount = (container, options) => Reflect.apply(/** @type {(...args: unknown[]) => unknown} */ (api.mount), api, [container, options]);
  return { document, mount, posts };
}

/** A real element that records the events dispatched on it. @param {ReturnType<typeof panel>["document"]} document */
function recordingContainer(document) {
  const container = document.createElement("section");
  /** @type {unknown[][]} */
  const events = [];
  const dispatch = container.dispatchEvent;
  Reflect.set(container, "dispatchEvent", /** @this {unknown} */ function recordDispatch(/** @type {Bag} */ event) {
    events.push([this, event.type, event.detail]);
    return Reflect.apply(dispatch, this, [event]);
  });
  return { container, events };
}

/** @param {() => unknown} build */
function failure(build) {
  try {
    build();
  } catch (error) {
    assert.ok(isBag(error));
    return { name: String(error.name), message: String(error.message) };
  }
  return null;
}

describe("mount establishes the container it renders into", () => {
  it("renders into a real element and emits refresh on the container itself", async () => {
    const f = panel();
    const { container, events } = recordingContainer(f.document);
    f.mount(container, { targetType: "task", targetId: "t1" });
    await settle();
    assert.ok(container.querySelector("[data-notes-linked-panel='task']"), "the panel renders");
    assert.deepEqual(events.map(([receiver, type]) => [receiver === container, type]), [[true, "notes-linked-panel:refresh"]]);
  });

  it("still refuses a missing container with its original error", () => {
    const f = panel();
    assert.deepEqual(failure(() => f.mount(null)), { name: "Error", message: "Notes linked panel container is required." });
  });

  it("fails as a TypeError for a container that cannot replace its children, after reading the options", () => {
    const f = panel();
    /** @type {string[]} */
    const reads = [];
    const options = { get targetType() { reads.push("targetType"); return "task"; } };
    assert.deepEqual(failure(() => f.mount({}, options)),
      { name: "TypeError", message: "The linked notes panel container must be able to replace its children." });
    assert.deepEqual(reads, ["targetType"], "the options were read before the container failed, as before");
  });

  it("mounts a container without dispatchEvent, which fails only at the emit and is shown as a load error", async () => {
    // With a target, `refresh` emits inside its own try, so the failed dispatch has always been
    // caught and shown as the load error rather than thrown. `emit` now names that failure, and
    // it lands in the same place.
    const f = panel({ holdFirstLoad: true });
    /** @type {Bag[]} */
    const rendered = [];
    const container = { replaceChildren: (/** @type {Bag[]} */ ...children) => { rendered.push(...children); } };
    const controller = f.mount(container, { targetType: "task", targetId: "t1" });
    assert.ok(isBag(controller) && isCallable(controller.refresh), "mount still succeeds and renders");
    assert.ok(rendered.length > 0);
    await Reflect.apply(controller.refresh, controller, []);
    const latest = rendered.at(-1);
    assert.ok(isBag(latest) && isCallable(latest.querySelectorAll));
    const statuses = Reflect.apply(latest.querySelectorAll, latest, [".notes-linked-panel-status"]);
    assert.ok(Array.isArray(statuses) && isBag(statuses[0]));
    assert.equal(statuses[0].textContent, "Linked notes could not be loaded.");
  });
});

describe("The caller's options are read member by member", () => {
  it("honours the snake_case aliases and the unconverted save-first message", async () => {
    const f = panel();
    const { container } = recordingContainer(f.document);
    f.mount(container, { target_type: "task", title: " Linked ", saveFirstMessage: 42 });
    await settle();
    assert.ok(container.querySelector("[data-notes-linked-panel='task']"));
    const [empty] = container.querySelectorAll(".notes-linked-panel-empty");
    assert.equal(empty.textContent, "42", "the node's own setter converts the message, as before");
    const [title] = container.querySelectorAll("h3");
    assert.equal(title.textContent, "Linked");
  });

  it("still fails as a TypeError for null options", () => {
    const f = panel();
    const { container } = recordingContainer(f.document);
    assert.equal(failure(() => f.mount(container, null))?.name, "TypeError");
  });
});

describe("Unlinking reads each opaque link row as the member access did", () => {
  /** @param {unknown[]} links */
  async function unlink(links) {
    const f = panel({ linkedNotes: [note({ links })] });
    const { container, events } = recordingContainer(f.document);
    f.mount(container, { targetType: "task", targetId: "t1" });
    await settle();
    const [button] = container.querySelectorAll("button").filter((node) => node.textContent === "Unlink");
    assert.ok(button, "the fallback list offers Unlink");
    return { button, events, posts: f.posts };
  }

  it("posts the removal for the matching row, camelCase or snake_case, with the id encoded", async () => {
    const camel = await unlink([{ targetType: "task", targetId: "t1", noteLinkId: "link one" }]);
    await camel.button.click();
    assert.deepEqual(camel.posts, ["/api/notes/note-1/links/link%20one/remove"]);
    assert.ok(camel.events.some(([, type]) => type === "notes-linked-panel:unlink"));

    const snake = await unlink([{ target_type: "other", target_id: "t1", note_link_id: "x" }, { target_type: "task", target_id: "t1", note_link_id: 7 }]);
    await snake.button.click();
    assert.deepEqual(snake.posts, ["/api/notes/note-1/links/7/remove"]);
  });

  it("posts nothing when no row matches the target", async () => {
    const none = await unlink([{ targetType: "task", targetId: "elsewhere", noteLinkId: "x" }]);
    await none.button.click();
    assert.deepEqual(none.posts, []);
  });

  it("still fails on a missing row, as the member access did", async () => {
    const broken = await unlink([null]);
    await assert.rejects(async () => { await broken.button.click(); }, (error) => isBag(error) && error.name === "TypeError");
    assert.deepEqual(broken.posts, []);
  });
});
