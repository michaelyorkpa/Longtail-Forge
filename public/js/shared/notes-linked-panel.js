/* global CustomEvent */

(function attachNotesLinkedPanel(global) {
  const namespace = global.LongtailForge = global.LongtailForge || {};

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserErrorContract} BrowserErrorContract */

  /**
   * The narrowing contract for the values this file catches.
   *
   * A `catch` binding is `unknown` and no declaration can change that: anything can be
   * thrown. Every page that loads this script also loads `shared/error-contract.js`, so the
   * checked read fails exactly where the raw `error.message` read failed before.
   * @returns {BrowserErrorContract}
   */
  function requireErrors() {
    const errors = namespace?.errors;
    if (!errors) {
      throw new Error("The linked notes panel requires LongtailForge.errors.");
    }
    return errors;
  }

  /**
   * The API client this file cannot run without.
   *
   * Acquired per call rather than once at module scope, so a missing client still fails at
   * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
   * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
   * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
   * @returns {BrowserApi}
   */
  function requireApi() {
    const apiClient = namespace?.api;
    if (!apiClient) {
      throw new Error("The linked notes panel requires LongtailForge.api.");
    }
    return apiClient;
  }
  function mount(container, options = {}) {
    if (!container) {
      throw new Error("Notes linked panel container is required.");
    }

    const state = {
      error: "",
      isLoading: false,
      isLinking: false,
      notes: [],
      options: normalizeOptions(options),
      panel: null,
      selectableNotes: [],
      status: "",
    };
    const controller = {
      refresh: () => refresh(container, state),
      destroy: () => container.replaceChildren(),
    };

    render(container, state);
    refresh(container, state);
    return controller;
  }

  async function refresh(container, state) {
    const api = requireApi();
    const { options } = state;

    if (!options.targetType || !options.targetId) {
      state.notes = [];
      state.panel = null;
      state.error = "";
      render(container, state);
      emit(container, "refresh", { notes: [] });
      return;
    }

    state.isLoading = true;
    state.error = "";
    render(container, state);

    try {
      const params = new URLSearchParams({
        targetType: options.targetType,
        targetId: options.targetId,
        sort: options.sort,
      });
      if (options.moduleId) {
        params.set("moduleId", options.moduleId);
      }
      if (options.clientId) {
        params.set("clientId", options.clientId);
      }
      if (options.projectId) {
        params.set("projectId", options.projectId);
      }
      const panel = readForTarget(await api.getJson(`/api/notes/for-target?${params.toString()}`, { cache: "no-store" }));
      if (!panel) {
        throw new Error("Linked notes could not be read.");
      }
      state.panel = panel;
      state.notes = panel.linkedNotes;
      state.status = "";
      emit(container, "refresh", { notes: state.notes, panel });
    } catch (error) {
      state.error = requireErrors().caughtMessage(error, "Linked notes could not be loaded.");
    } finally {
      state.isLoading = false;
      render(container, state);
    }
  }

  function render(container, state) {
    const { options } = state;
    const root = document.createElement("section");
    const header = document.createElement("div");
    const title = document.createElement("h3");
    const status = document.createElement("p");

    root.className = "notes-linked-panel";
    root.dataset.notesLinkedPanel = options.targetType || "";
    header.className = "notes-linked-panel-header";
    title.textContent = options.title || "Notes";
    status.className = state.error ? "notes-linked-panel-status is-error" : "notes-linked-panel-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = panelStatus(state);

    header.append(title, status);
    root.append(header);

    if (!options.targetId) {
      root.append(emptyState(options.saveFirstMessage || "Save before adding notes."));
    } else {
      root.append(noteList(container, state), panelControls(container, state));
    }

    container.replaceChildren(root);
  }

  function noteList(container, state) {
    const list = document.createElement("div");

    list.className = "notes-linked-panel-list";
    if (state.isLoading) {
      list.append(emptyState("Loading notes..."));
      return list;
    }
    if (state.error) {
      list.append(emptyState(state.error, true));
      return list;
    }
    if (state.notes.length === 0) {
      const empty = state.panel?.emptyState;
      list.append(emptyState(state.options.emptyMessage || empty?.body || empty?.title || "No linked notes yet."));
      return list;
    }

    if (namespace.view?.createLinkedContextList) {
      return namespace.view?.createLinkedContextList({
        ariaLabel: "Linked notes",
        className: "notes-linked-panel-list",
        emptyMessage: state.options.emptyMessage || "No linked notes yet.",
        items: state.notes.map((note) => linkedNoteListItem(state, note)),
        onRemove: (/** @type {{ note: { [key: string]: unknown } }} */ item) =>
          unlinkNote(container, state, item.note),
        removeAction: "unlink-note",
        removeLabel: "Unlink note",
        readonly: isReadonly(state),
      });
    }

    state.notes.forEach((note) => list.append(noteItem(container, state, note)));
    return list;
  }

  /**
   * The item the linked-context list hands back to `onRemove`, so its `note` needs a type.
   * @param {{ [key: string]: unknown }} state
   * @param {{ [key: string]: unknown, id?: unknown, label?: unknown }} note
   */
  function linkedNoteListItem(state, note) {
    return {
      className: "notes-linked-panel-item",
      displayLabel: note.label || "Untitled note",
      fullLabel: note.label || "Untitled note",
      hintLabel: note.excerpt || (note.security_mode === "secure" ? "Secure note body is hidden." : ""),
      isAvailable: note.isAvailable !== false,
      moduleId: "notes",
      note,
      removable: canUnlink(state, note),
      secondaryLabel: linkedNoteSecondaryLabel(note),
      sourceUrl: note.sourceUrl || `notes.html?note=${encodeURIComponent(String(note.id || ""))}`,
      targetId: note.id || "",
      targetType: "note",
    };
  }

  function linkedNoteSecondaryLabel(note) {
    return [note.visibility, note.security_mode, note.status]
      .filter(Boolean)
      .map(formatToken)
      .join(" | ");
  }

  function noteItem(container, state, note) {
    const item = document.createElement("article");
    const body = document.createElement("div");
    const title = document.createElement("a");
    const meta = document.createElement("p");
    const excerpt = document.createElement("p");
    const remove = document.createElement("button");

    item.className = "notes-linked-panel-item";
    body.className = "notes-linked-panel-item-body";
    title.href = note.sourceUrl || `notes.html?note=${encodeURIComponent(note.id || "")}`;
    title.textContent = note.label || "Untitled note";
    meta.className = "notes-linked-panel-meta";
    meta.append(...badges(note));
    excerpt.className = "notes-linked-panel-excerpt";
    excerpt.textContent = note.excerpt || (note.security_mode === "secure" ? "Secure note body is hidden." : "");
    body.append(title, meta);
    if (excerpt.textContent) {
      body.append(excerpt);
    }
    item.append(body);

    if (canUnlink(state, note)) {
      remove.type = "button";
      remove.textContent = "Unlink";
      remove.addEventListener("click", () => unlinkNote(container, state, note));
      item.append(remove);
    }

    return item;
  }

  function panelControls(container, state) {
    const wrapper = document.createElement("div");
    const create = document.createElement("a");

    wrapper.className = "notes-linked-panel-controls";
    if (state.isLoading || state.error) {
      return wrapper;
    }
    if (isReadonly(state)) {
      wrapper.append(readonlyNotice(state));
      return wrapper;
    }

    if (state.panel?.actions?.canCreate !== false) {
      create.href = createNoteUrl(state.options);
      create.textContent = "Create Note";
      create.className = "button-link";
      wrapper.append(create);
    }
    if (state.panel?.actions?.canLink !== false) {
      wrapper.append(linkExistingForm(container, state));
    }

    return wrapper;
  }

  function linkExistingForm(container, state) {
    const form = document.createElement("form");
    const select = document.createElement("select");
    const search = document.createElement("input");
    const submit = document.createElement("button");
    let searchTimer = null;

    form.className = "notes-linked-panel-link-form";
    search.type = "search";
    search.placeholder = "Find an existing note";
    select.required = true;
    submit.type = "submit";
    submit.textContent = state.isLinking ? "Linking" : "Link Note";
    submit.disabled = state.isLinking;

    form.append(search, select, submit);
    loadSelectableNotes(state, select, search.value);
    search.addEventListener("input", () => {
      global.clearTimeout(searchTimer);
      searchTimer = global.setTimeout(() => loadSelectableNotes(state, select, search.value), 180);
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await linkExistingNote(container, state, select.value);
    });

    return form;
  }

  async function loadSelectableNotes(state, select, search = "") {
    const api = requireApi();
    select.disabled = true;
    select.replaceChildren(new global.Option("Loading notes...", ""));

    try {
      const params = new global.URLSearchParams({
        limit: "50",
        status: "active",
        sort: "updated_desc",
      });
      if (String(search || "").trim()) {
        params.set("q", String(search || "").trim());
      }
      const result = await api.getJson(`/api/notes?${params.toString()}`, { cache: "no-store" });
      const linkedIds = new Set(state.notes.map((note) => note.id));
      const needle = String(search || "").trim().toLowerCase();
      const notes = (result.notes || [])
        .filter((note) => !linkedIds.has(note.note_id))
        .filter((note) => !needle || [note.title, note.body_excerpt].filter(Boolean).join(" ").toLowerCase().includes(needle))
        .slice(0, 50);
      select.replaceChildren(...(notes.length > 0
        ? notes.map((note) => new global.Option(note.title || "Untitled note", note.note_id))
        : [new global.Option("No notes available", "")]));
    } catch {
      select.replaceChildren(new global.Option("Notes unavailable", ""));
    } finally {
      select.disabled = false;
    }
  }

  async function linkExistingNote(container, state, noteId) {
    const api = requireApi();
    if (!noteId) {
      return;
    }

    state.isLinking = true;
    render(container, state);
    try {
      await api.postJson(`/api/notes/${encodeURIComponent(noteId)}/links`, linkPayload(state.options));
      emit(container, "link", { noteId });
      state.isLinking = false;
      await refresh(container, state);
    } catch (error) {
      state.error = requireErrors().caughtMessage(error, "Note could not be linked.");
      state.isLinking = false;
      render(container, state);
    }
  }

  async function unlinkNote(container, state, note) {
    const api = requireApi();
    const link = (note.links || []).find((item) =>
      (item.targetType || item.target_type) === state.options.targetType &&
      (item.targetId || item.target_id) === state.options.targetId);
    const noteLinkId = link?.noteLinkId || link?.note_link_id;

    if (!noteLinkId) {
      return;
    }

    await api.postJson(`/api/notes/${encodeURIComponent(note.id)}/links/${encodeURIComponent(noteLinkId)}/remove`, {});
    emit(container, "unlink", { noteId: note.id });
    await refresh(container, state);
  }

  function badges(note) {
    return [note.visibility, note.security_mode, note.status]
      .filter(Boolean)
      .map((value) => {
        const badge = document.createElement("span");
        badge.className = "notes-linked-panel-badge";
        badge.textContent = formatToken(value);
        return badge;
      });
  }

  function readonlyNotice(state) {
    const notice = document.createElement("p");

    notice.className = "notes-linked-panel-readonly";
    notice.textContent = state.options.readonly
      ? "Linked notes are read-only here."
      : "Notes is disabled. Historical linked notes are read-only.";
    return notice;
  }

  function canUnlink(state, note) {
    return !isReadonly(state) && state.panel?.actions?.canUnlink !== false && note.status !== "archived";
  }

  function isReadonly(state) {
    return state.options.readonly || state.panel?.actions?.readonly || state.panel?.moduleState?.enabled === false;
  }

  function panelStatus(state) {
    if (state.error) {
      return state.error;
    }
    if (state.isLoading) {
      return "Loading notes...";
    }
    if (state.status) {
      return state.status;
    }
    return state.notes.length === 1 ? "1 linked note" : `${state.notes.length} linked notes`;
  }

  function createNoteUrl(options) {
    const params = new URLSearchParams({
      targetType: options.targetType,
      targetId: options.targetId,
    });
    if (options.moduleId) {
      params.set("moduleId", options.moduleId);
    }
    if (options.clientId) {
      params.set("clientId", options.clientId);
    }
    if (options.projectId) {
      params.set("projectId", options.projectId);
    }
    if (options.targetType === "task") {
      params.set("noteKind", "log");
      params.set("libraryBucket", "active_work");
    }
    return `notes.html?${params.toString()}`;
  }

  function linkPayload(options) {
    return {
      moduleId: options.moduleId,
      targetType: options.targetType,
      targetId: options.targetId,
    };
  }

  function emptyState(message, isError = false) {
    const empty = document.createElement("p");

    empty.className = isError ? "notes-linked-panel-empty is-error" : "notes-linked-panel-empty";
    empty.textContent = message;
    return empty;
  }

  function emit(container, eventName, detail = {}) {
    container.dispatchEvent(new CustomEvent(`notes-linked-panel:${eventName}`, { detail }));
  }

  function normalizeOptions(options = {}) {
    return {
      clientId: normalizeText(options.clientId || options.client_id),
      emptyMessage: normalizeText(options.emptyMessage || options.empty_message),
      moduleId: normalizeText(options.moduleId || options.module_id),
      projectId: normalizeText(options.projectId || options.project_id),
      readonly: Boolean(options.readonly),
      saveFirstMessage: options.saveFirstMessage || "",
      sort: normalizeText(options.sort) || "updated",
      targetId: normalizeText(options.targetId || options.target_id),
      targetType: normalizeText(options.targetType || options.target_type),
      title: normalizeText(options.title),
    };
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function formatToken(value) {
    return String(value || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserLinkedNoteItem} BrowserLinkedNoteItem */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserLinkedNotePanelResponse} BrowserLinkedNotePanelResponse */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserLinkedNotePanelActions} BrowserLinkedNotePanelActions */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserLinkedNotePanelEmptyState} BrowserLinkedNotePanelEmptyState */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserLinkedNoteTarget} BrowserLinkedNoteTarget */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserNotesModuleState} BrowserNotesModuleState */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserLinkedNoteSort} BrowserLinkedNoteSort */
  /** @typedef {import("../../../src/types/browser-contracts.js").BrowserWorkspaceType} BrowserWorkspaceType */

  /** The four sort modes the panel options normalise to. @type {readonly BrowserLinkedNoteSort[]} */
  const LINKED_NOTE_SORTS = Object.freeze(["pinned", "recent", "title", "updated"]);
  /** @type {readonly BrowserWorkspaceType[]} */
  const PANEL_WORKSPACE_TYPES = Object.freeze(["business", "family", "personal"]);

  /** The note columns `shapeNoteForBrowser` always supplies as text. */
  const PANEL_NOTE_TEXT_COLUMNS = Object.freeze([
    "created_at", "library_bucket", "library_bucket_source", "note_id", "note_type",
    "security_mode", "status", "title", "updated_at", "visibility", "workspace_id",
  ]);

  /** The note columns it names and may answer as `null`. */
  const PANEL_NOTE_NULLABLE_COLUMNS = Object.freeze([
    "archived_at", "body_excerpt", "client_id", "created_by_user_id", "deleted_at",
    "import_source", "import_source_id", "imported_at", "linked_user_id", "note_collection_id",
    "owner_user_id", "project_id", "slug", "task_id", "ticket_id", "updated_by_user_id",
  ]);

  /** The members the panel projection adds over those columns. */
  const PANEL_ITEM_TEXT_MEMBERS = Object.freeze(["id", "label", "sourceUrl"]);

  /** The three action hints that must all be false while the module cannot be written. */
  const PANEL_WRITE_ACTIONS = Object.freeze(["canCreate", "canLink", "canUnlink"]);

  /** @param {unknown} value @returns {value is Record<string, unknown>} */
  function isPanelRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  /** @param {Record<string, unknown>} value @param {readonly string[]} keys */
  function hasPanelText(value, keys) {
    return keys.every((key) => typeof value[key] === "string");
  }

  /** @param {Record<string, unknown>} value @param {readonly string[]} keys */
  function hasPanelNullableText(value, keys) {
    return keys.every((key) => value[key] === null || typeof value[key] === "string");
  }

  /** @param {Record<string, unknown>} value @param {readonly string[]} keys */
  function hasPanelBooleans(value, keys) {
    return keys.every((key) => typeof value[key] === "boolean");
  }

  /**
   * One linked note as `shapeLinkedNotePanelItem` builds it.
   *
   * The three members that shaper **deletes** - the markdown body, the plaintext index and the
   * metadata blob - are not checked here because they are not promised; a panel item that carried
   * them would not be what this producer sends.
   * @param {unknown} value
   * @returns {value is BrowserLinkedNoteItem}
   */
  function isLinkedNoteItem(value) {
    return isPanelRecord(value)
      && hasPanelText(value, PANEL_NOTE_TEXT_COLUMNS)
      && hasPanelNullableText(value, PANEL_NOTE_NULLABLE_COLUMNS)
      && hasPanelText(value, PANEL_ITEM_TEXT_MEMBERS)
      && (value.excerpt === null || typeof value.excerpt === "string")
      && Array.isArray(value.links)
      && value.note_id !== "";
  }

  /** @param {unknown} value @returns {BrowserLinkedNoteTarget | null} */
  function readLinkedNoteTarget(value) {
    if (!isPanelRecord(value) || !hasPanelText(value, ["moduleId", "targetId", "targetType", "sourceUrl"])) {
      return null;
    }
    return {
      moduleId: String(value.moduleId),
      sourceUrl: String(value.sourceUrl),
      targetId: String(value.targetId),
      targetType: String(value.targetType),
    };
  }

  /** @param {unknown} value @returns {BrowserNotesModuleState | null} */
  function readNotesModuleState(value) {
    if (!isPanelRecord(value) || !hasPanelBooleans(value, ["enabled", "historicalReadAccess", "notesModuleEnabled"])) {
      return null;
    }
    const workspaceType = PANEL_WORKSPACE_TYPES.find((word) => word === value.workspaceType);
    return workspaceType ? {
      enabled: value.enabled === true,
      historicalReadAccess: value.historicalReadAccess === true,
      notesModuleEnabled: value.notesModuleEnabled === true,
      workspaceType,
    } : null;
  }

  /**
   * The action hints, or `null` when they contradict the module state that produced them.
   *
   * `readonly` is `!enabled` in the producer, and a module that cannot be written yields three
   * false hints. The reverse is deliberately **not** enforced: an enabled module may still be
   * denied create or link by permissions, so an enabled state with false hints is ordinary.
   * @param {unknown} value
   * @param {BrowserNotesModuleState} moduleState
   * @returns {BrowserLinkedNotePanelActions | null}
   */
  function readPanelActions(value, moduleState) {
    if (!isPanelRecord(value) || !hasPanelBooleans(value, ["canCreate", "canLink", "canUnlink", "readonly"])) {
      return null;
    }
    if (value.readonly !== !moduleState.enabled) {
      return null;
    }
    if (!moduleState.enabled && PANEL_WRITE_ACTIONS.some((key) => value[key] === true)) {
      return null;
    }
    return {
      canCreate: value.canCreate === true,
      canLink: value.canLink === true,
      canUnlink: value.canUnlink === true,
      readonly: value.readonly === true,
    };
  }

  /** @param {unknown} value @returns {BrowserLinkedNotePanelEmptyState | null} */
  function readPanelEmptyState(value) {
    if (!isPanelRecord(value) || !hasPanelText(value, ["body", "title"]) || !isPanelRecord(value.action)) {
      return null;
    }
    const action = value.action;
    if (!hasPanelText(action, ["href", "label"])) {
      return null;
    }
    return {
      action: { href: String(action.href), label: String(action.label) },
      body: String(value.body),
      title: String(value.title),
    };
  }

  /**
   * What `GET /api/notes/for-target` answered, or `null` when it cannot be vouched for.
   *
   * **Refused whole, never shortened.** This one response decides a note count, the linked list,
   * the create/link/unlink controls and the read-only state. Dropping a malformed item would hide
   * a note while leaving the panel looking authoritative, and defaulting a malformed count would
   * tell Tasks a record has no notes. Both are claims the response never made.
   * @param {unknown} body
   * @returns {BrowserLinkedNotePanelResponse | null}
   */
  function readForTarget(body) {
    if (!isPanelRecord(body) || !Array.isArray(body.linkedNotes) || !Array.isArray(body.notes)) {
      return null;
    }
    const sort = LINKED_NOTE_SORTS.find((word) => word === body.sort);
    const target = readLinkedNoteTarget(body.target);
    const moduleState = readNotesModuleState(body.moduleState);
    if (!sort || !target || !moduleState) {
      return null;
    }
    const actions = readPanelActions(body.actions, moduleState);
    if (!actions) {
      return null;
    }
    // The count needs no separate type or range test: requiring it to be strictly equal to the
    // list length already forces it to be that number, and a break harness proved every extra
    // guard around it changed no outcome. One check that bites beats three that decorate.
    const linkedNotes = body.linkedNotes.filter(isLinkedNoteItem);
    if (linkedNotes.length !== body.linkedNotes.length
      || body.count !== linkedNotes.length
      || body.notes.length !== linkedNotes.length) {
      return null;
    }
    const emptyState = linkedNotes.length > 0 ? null : readPanelEmptyState(body.emptyState);
    if (linkedNotes.length > 0 ? body.emptyState !== null : !emptyState) {
      return null;
    }
    return {
      actions,
      count: body.count,
      emptyState,
      linkedNotes,
      moduleState,
      notes: body.notes,
      sort,
      target,
    };
  }

  namespace.notesLinkedPanel = {
    mount,
    readForTarget,
  };
})(window);
