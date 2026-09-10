import assert from "node:assert/strict";
import vm from "node:vm";
import { URLSearchParams } from "node:url";
import { describe, it } from "vitest";
import { FakeDocument, fakeDomConstructors } from "../../scripts/test-support/fake-dom.mjs";
import { createProjectTextReader, extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

const reader = createProjectTextReader();
const source = reader.readText("public/js/notes.js");
const shared = reader.readText("public/js/shared/notification-subscriptions.js");
const names = ["findNotesControl", "writeNoteNotificationFollowFields", "writeNoteNotificationFollowState", "toggleNoteNotificationFollow", "resetNoteNotificationFollowFields", "isSecureNote"];
const note = { note_id: "saved-note", security_mode: "plain", effective_security_mode: "plain" };
function defer() {
  /** @type {(value: unknown) => void} */
  let resolve = () => {};
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function fixture() {
  const document = new FakeDocument();
  const button = Object.assign(document.createElement("button"), { title: "" });
  button.dataset.noteNotificationToggle = ""; document.body.append(button);
  /** @type {unknown[]} */
  const calls = [];
  /** @type {unknown[]} */
  const statuses = [];
  const wire = {
    /** @type {unknown} */
    body: { isFollowing: false }, fail: false,
    /** @type {Promise<unknown> | null} */ pending: null };
  const apiTransport = Object.fromEntries(["getJson", "postJson", "deleteJson"].map((method) => [method, async (/** @type {unknown} */ url, /** @type {unknown} */ options) => {
    calls.push([method, url, options]);
    if (wire.fail) throw new Error("wire failure");
    return wire.pending || wire.body;
  }]));
  const window = { LongtailForge: { api: apiTransport } };
  vm.runInNewContext(shared, { window, URLSearchParams });
  const state = { editingNoteId: "editing-note", editorNote: { ...note } };
  const context = vm.createContext({ window, document, ...fakeDomConstructors(), state, notificationToggle: null,
    setEditorFormStatus: (/** @type {unknown} */ message, /** @type {unknown} */ error) => statuses.push([message, error]),
    requireErrors: () => ({ caughtMessage: () => "Notification follow change failed." }) });
  const binding = extractFunctionBlock(source, "cacheNotesElements").match(/^\s*notificationToggle = .*;$/m); assert.ok(binding);
  const api = vm.runInContext(`${names.map((name) => extractFunctionBlock(source, name)).join("\n")}\nfunction bind() { ${binding[0]} }\n({${names.join(",")}, bind})`, context);
  api.bind();
  return { api, context, wire, button, calls, statuses, state };
}
/** @param {ReturnType<typeof fixture>["button"]} button @param {boolean} following */
function assertState(button, following) {
  const label = following ? "Unfollow note notifications" : "Follow note notifications";
  assert.equal(button.dataset.isFollowing, String(following));
  assert.equal(button.classList.contains("is-following"), following);
  assert.equal(button.disabled, false);
  assert.equal(button.title, label);
  assert.equal(button.getAttribute("aria-label"), label);
  assert.equal(button.getAttribute("aria-pressed"), String(following));
}

describe("Notes notification follow toggle", () => {
  it("caches only a button, tolerating absent and wrong-kind controls without a required lookup", async () => {
    const f = fixture(); assert.equal(f.context.notificationToggle, f.button);
    f.button.remove(); f.api.bind(); assert.equal(f.context.notificationToggle, null);
    for (const tag of ["div", "input", "select"]) {
      const wrong = f.context.document.createElement(tag); wrong.dataset.noteNotificationToggle = ""; f.context.document.body.append(wrong);
      f.api.bind(); assert.equal(f.context.notificationToggle, null); wrong.remove();
    }
    await assert.doesNotReject(() => f.api.writeNoteNotificationFollowFields(note));
    assert.doesNotThrow(() => f.api.writeNoteNotificationFollowState(true));
    assert.doesNotThrow(() => f.api.resetNoteNotificationFollowFields());
    await assert.doesNotReject(() => f.api.toggleNoteNotificationFollow()); assert.deepEqual(f.calls, []);
  });

  it("writes both follow states consistently, including accessibility and re-enabling", () => {
    const f = fixture();
    for (const following of [true, false, true, false]) {
      f.button.disabled = true; f.api.writeNoteNotificationFollowState(following); assertState(f.button, following);
    }
  });

  it("hides unsaved, directly secure and effectively secure notes without reading subscriptions", async () => {
    for (const value of [null, {}, { ...note, note_id: "" }, { ...note, security_mode: "secure" }, { ...note, effective_security_mode: "secure" }]) {
      const f = fixture(); f.api.writeNoteNotificationFollowState(true);
      await assert.doesNotReject(() => f.api.writeNoteNotificationFollowFields(value));
      assert.equal(f.button.hidden, true); assert.equal(f.button.disabled, true); assert.equal(f.button.dataset.isFollowing, "false");
      const label = value && "note_id" in value && value.note_id ? "Note notifications unavailable" : "Save the note before following notifications";
      assert.equal(f.button.title, label); assert.equal(f.button.getAttribute("aria-label"), label); assert.deepEqual(f.calls, []);
    }
  });

  it("tolerates a missing root, missing surface and missing target capability", async () => {
    for (const root of [undefined, {}, { notificationSubscriptions: {} }]) {
      const f = fixture(); f.context.window.LongtailForge = root;
      await assert.doesNotReject(() => f.api.writeNoteNotificationFollowFields(note));
      assert.equal(f.button.hidden, true); assert.equal(f.button.disabled, true);
      assert.equal(f.button.title, "Note notifications unavailable"); assert.equal(f.button.getAttribute("aria-label"), f.button.title);
      await assert.doesNotReject(() => f.api.toggleNoteNotificationFollow()); assert.deepEqual(f.calls, []);
    }
  });

  it("shows checking before the actual checked read resolves, then reflects literal following", async () => {
    for (const following of [true, false]) {
      const f = fixture(); const deferred = defer(); f.wire.pending = deferred.promise;
      f.api.writeNoteNotificationFollowState(true);
      const operation = f.api.writeNoteNotificationFollowFields(note);
      assert.equal(f.button.hidden, false); assert.equal(f.button.disabled, true);
      assert.equal(f.button.title, "Checking notification follow state"); assert.equal(f.button.getAttribute("aria-label"), f.button.title);
      assert.equal(f.button.dataset.isFollowing, "false");
      assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [["getJson", "/api/notifications/subscriptions?moduleId=notes&targetType=note&targetId=saved-note", { cache: "no-store" }]].map((value) => JSON.parse(JSON.stringify(value))));
      deferred.resolve({ isFollowing: following }); await assert.doesNotReject(() => operation); assertState(f.button, following);
    }
  });

  it("uses the shared producer's boolean normalization for hostile wire bodies", async () => {
    for (const body of [null, undefined, false, 7, "true", [], { isFollowing: "true" }, { isFollowing: 1 }, { isFollowing: {} }, { isFollowing: [] }, { isFollowing: true }, { isFollowing: false }]) {
      const f = fixture(); f.wire.body = body;
      await assert.doesNotReject(() => f.api.writeNoteNotificationFollowFields(note));
      assertState(f.button, body !== null && typeof body === "object" && "isFollowing" in body && body.isFollowing === true);
      assert.equal(f.button.hidden, false);
    }
  });

  it("keeps failed reads visible and disabled with the unavailable accessible label", async () => {
    const f = fixture(); f.wire.fail = true;
    await assert.doesNotReject(() => f.api.writeNoteNotificationFollowFields(note));
    assert.equal(f.button.hidden, false); assert.equal(f.button.disabled, true); assert.equal(f.button.dataset.isFollowing, "false");
    assert.equal(f.button.title, "Notification follow state unavailable"); assert.equal(f.button.getAttribute("aria-label"), f.button.title);
  });

  it("dispatches follow/unfollow with editing identity first, pending labels and checked results", async () => {
    for (const following of [false, true]) {
      const f = fixture(); f.api.writeNoteNotificationFollowState(following);
      const deferred = defer(); f.wire.pending = deferred.promise;
      const operation = f.api.toggleNoteNotificationFollow();
      assert.equal(f.button.disabled, true); assert.equal(f.button.title, following ? "Unfollowing note notifications" : "Following note notifications");
      assert.equal(f.button.getAttribute("aria-label"), f.button.title);
      assert.deepEqual(f.statuses, [[`${f.button.title}...`, undefined]]);
      const observed = JSON.parse(JSON.stringify(f.calls));
      assert.deepEqual(observed, following ? [["deleteJson", "/api/notifications/subscriptions?moduleId=notes&targetType=note&targetId=editing-note", null]] : [["postJson", "/api/notifications/subscriptions", { moduleId: "notes", targetType: "note", targetId: "editing-note", eventType: "" }]]);
      deferred.resolve({ isFollowing: !following }); await assert.doesNotReject(() => operation); assertState(f.button, !following);
      assert.deepEqual(f.statuses[1], [following ? "Note notifications unfollowed." : "Note notifications followed.", undefined]);
    }
    const f = fixture(); f.state.editingNoteId = ""; await f.api.toggleNoteNotificationFollow();
    assert.match(JSON.stringify(f.calls), /saved-note/);
    const missing = fixture(); missing.state.editingNoteId = ""; missing.state.editorNote.note_id = "";
    await assert.doesNotReject(() => missing.api.toggleNoteNotificationFollow()); assert.deepEqual(missing.calls, []);
  });

  it("rolls failed changes back to the previous state and resets to hidden disabled", async () => {
    for (const following of [false, true]) {
      const f = fixture(); f.api.writeNoteNotificationFollowState(following); f.wire.fail = true;
      await assert.doesNotReject(() => f.api.toggleNoteNotificationFollow()); assertState(f.button, following);
      assert.deepEqual(f.statuses.at(-1), ["Notification follow change failed.", true]);
      f.button.hidden = false; f.api.resetNoteNotificationFollowFields();
      assert.equal(f.button.hidden, true); assert.equal(f.button.disabled, true);
      assert.equal(f.button.dataset.isFollowing, "false"); assert.equal(f.button.getAttribute("aria-pressed"), "false");
    }
  });
});
