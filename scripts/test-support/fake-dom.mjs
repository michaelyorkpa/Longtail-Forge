const SUPPORTED_SELECTOR_MESSAGE = "Fake DOM selectors support tags, classes, IDs, attributes, descendant relationships, comma lists, and :not([attribute='value']).";

/**
 * The supported fake-DOM node surface. Elements are FakeElement instances; the
 * optional extras (such as `title`) are expando properties that the harness
 * writes onto specific elements without widening the audited class.
 * @typedef {FakeElement & { title?: string }} FakeNode
 */

/**
 * @typedef {object} FakeQueuedJsonApi
 * @property {string[]} calls
 * @property {(url: string) => Promise<unknown>} getJson
 */

/** @typedef {{ createIconButton: (options?: FakeIconButtonOptions) => FakeNode } & Record<string, unknown>} FakeFrameworkIcons */

/** @typedef {{ api: FakeQueuedJsonApi, icons: FakeFrameworkIcons, workspaceContext: Record<string, unknown> } & Record<string, unknown>} FakeLongtailForgeGlobal */

/** @typedef {{ document: FakeDocument, LongtailForge: FakeLongtailForgeGlobal, confirm: Function, fetch: Function, location: Record<string, unknown> } & Record<string, unknown>} FakeWindow */

/** @typedef {{ window: FakeWindow, document: FakeDocument } & Record<string, unknown>} FakeBrowserContext */

/**
 * @typedef {object} FakeIconButtonFactoryOptions
 * @property {boolean} [actionClass]
 * @property {boolean} [iconClass]
 * @property {boolean} [iconOnlyText]
 */

/**
 * @typedef {object} FakeIconButtonOptions
 * @property {string} [icon]
 * @property {boolean} [iconOnly]
 * @property {string} [label]
 * @property {string} [text]
 * @property {string} [title]
 * @property {string} [type]
 */

/**
 * @typedef {object} FakeBrowserContextOptions
 * @property {Partial<FakeQueuedJsonApi> & Record<string, unknown>} [api]
 * @property {Function} [confirm]
 * @property {Function} [fetch]
 * @property {Record<string, unknown>} [globals]
 * @property {FakeIconButtonFactoryOptions | false} [iconButton]
 * @property {Record<string, unknown>} [location]
 * @property {Record<string, unknown>} [longtailForge]
 * @property {unknown[]} [responses]
 * @property {Record<string, unknown>} [workspaceContext]
 * @property {Record<string, unknown>} [window]
 */

/** @typedef {{ currentTarget?: FakeNode | null, defaultPrevented?: boolean, preventDefault?: () => void, propagationStopped?: boolean, stopPropagation?: () => void, target?: FakeNode | null, type?: string } & Record<string, unknown>} FakeDomEvent */

/**
 * @callback FakeEventListener
 * @param {FakeDomEvent} event
 * @returns {unknown}
 */

/**
 * @typedef {object} FakeListenerEntry
 * @property {FakeEventListener} listener
 * @property {boolean} once
 */

/**
 * @param {FakeBrowserContextOptions} [options]
 * @returns {FakeBrowserContext}
 */
export function createFakeBrowserContext({
  api,
  confirm,
  fetch,
  globals = {},
  iconButton = {},
  location,
  longtailForge = {},
  responses,
  workspaceContext,
  window: windowOverrides = {},
} = {}) {
  const document = new FakeDocument();
  const window = /** @type {FakeWindow} */ ({
    document,
    ...windowOverrides,
  });
  const framework = /** @type {FakeLongtailForgeGlobal} */ ({
    ...longtailForge,
  });

  if (responses) {
    framework.api = createQueuedJsonApi(responses);
  }
  if (api) {
    framework.api = /** @type {FakeQueuedJsonApi} */ (api);
  }
  if (workspaceContext) {
    framework.workspaceContext = workspaceContext;
  }
  if (iconButton !== false) {
    framework.icons = {
      ...framework.icons,
      createIconButton: createFakeIconButtonFactory(document, iconButton),
    };
  }
  if (Object.keys(framework).length > 0) {
    window.LongtailForge = framework;
  }
  if (confirm) window.confirm = confirm;
  if (fetch) window.fetch = fetch;
  if (location) window.location = location;

  return {
    window,
    document,
    ...fakeDomConstructors(),
    ...globals,
  };
}

/**
 * Stand-ins for the DOM constructors browser code asks `instanceof` about.
 *
 * This fake models every tag with one `FakeElement`, so the real class hierarchy does not exist
 * here. Each stand-in answers the question the hierarchy would: whether the value is an element
 * at all, and for the two control constructors, whether it is that tag. Without them a sandbox
 * evaluating a file that narrows with `instanceof` throws on the first check.
 *
 * The shape is inferred rather than annotated: naming it `Record<string, unknown>` would erase the
 * constructors back into values the operator will not accept.
 */
export function fakeDomConstructors() {
  // Classes rather than plain objects: `instanceof` requires a right-hand side with a `Function`
  // prototype, and a static `Symbol.hasInstance` then answers the question the class hierarchy
  // would have. A bare object with the same member is rejected by the compiler at every call site.
  /** @param {string} [tagName] */
  const elementConstructor = (tagName) => class FakeDomConstructor {
    /** @param {unknown} value */
    static [Symbol.hasInstance](value) {
      return value instanceof FakeElement && value.nodeType === 1
        && (tagName === undefined || value.tagName === tagName);
    }
  };

  return {
    Element: elementConstructor(),
    HTMLElement: elementConstructor(),
    HTMLInputElement: elementConstructor("INPUT"),
    HTMLSelectElement: elementConstructor("SELECT"),
    HTMLTextAreaElement: elementConstructor("TEXTAREA"),
  };
}

/**
 * @param {unknown[]} [responses]
 * @returns {FakeQueuedJsonApi}
 */
export function createQueuedJsonApi(responses = []) {
  const queue = [...responses];
  /** @type {string[]} */
  const calls = [];
  return {
    calls,
    /** @param {string} url */
    async getJson(url) {
      calls.push(url);
      const next = queue.length > 0 ? queue.shift() : responses[responses.length - 1];
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

/**
 * @param {FakeDocument} document
 * @param {FakeIconButtonFactoryOptions} [factoryOptions]
 * @returns {(options?: FakeIconButtonOptions) => FakeNode}
 */
export function createFakeIconButtonFactory(document, {
  actionClass = true,
  iconClass = true,
  iconOnlyText = false,
} = {}) {
  return (options = {}) => {
    const button = document.createElement("button");
    button.type = options.type || "button";
    if (actionClass) button.classList.add("action-button");
    const isIconOnly = options.iconOnly !== false && !options.text;
    if (isIconOnly && iconClass) button.classList.add("icon-button");
    if (isIconOnly) {
      if (options.label) button.setAttribute("aria-label", options.label);
      button.title = options.title || options.label || "";
      if (iconOnlyText) button.textContent = options.label || "";
    } else {
      button.textContent = options.text || options.label || "";
    }
    if (options.icon !== undefined) button.dataset.icon = options.icon;
    return button;
  };
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} [init]
 */
export function createFakeEvent(type, init = {}) {
  return {
    defaultPrevented: false,
    propagationStopped: false,
    type,
    ...init,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
  };
}

export class FakeDocument {
  constructor() {
    /** @type {FakeNode | null} */
    this.activeElement = null;
    this.body = this.createElement("body");
  }

  /**
   * @param {string} tagName
   * @returns {FakeNode}
   */
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  /**
   * @param {unknown} text
   * @returns {FakeNode}
   */
  createTextNode(text) {
    const node = new FakeElement("#text", this);
    node.textContent = String(text);
    return node;
  }

  /**
   * @param {string} selector
   * @returns {FakeNode}
   */
  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  /**
   * @param {string} selector
   * @returns {FakeNode[]}
   */
  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

export class FakeElement {
  /**
   * @param {string} tagName
   * @param {FakeDocument | null} [ownerDocument]
   */
  constructor(tagName, ownerDocument = null) {
    this.tagName = String(tagName).toUpperCase();
    this.nodeType = this.tagName === "#TEXT" ? 3 : 1;
    this.ownerDocument = ownerDocument;
    /** @type {FakeNode[]} */
    this.children = [];
    /** @type {FakeNode | null} */
    this.parentNode = null;
    /** @type {Map<string, string>} */
    this.attributes = new Map();
    /** @type {Record<string, string>} */
    this.dataset = {};
    this.classList = new FakeClassList(this);
    /** @type {Map<string, FakeListenerEntry[]>} */
    this.listeners = new Map();
    this._textContent = "";
    this.checked = false;
    this.colSpan = 1;
    this.disabled = false;
    this.hidden = false;
    this.multiple = false;
    this.open = false;
    this.required = false;
    this.returnValue = "";
    this.selected = false;
    this.type = "";
    this.value = "";
  }

  /** @param {...(FakeNode | null | undefined | false)} children */
  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  /**
   * @param {FakeNode | null | undefined | false} child
   * @returns {FakeNode | null | undefined | false}
   */
  appendChild(child) {
    if (child === null || child === undefined || child === false) return child;
    this.children.push(child);
    child.parentNode = this;
    if (!child.ownerDocument) child.ownerDocument = this.ownerDocument;
    return child;
  }

  /**
   * @param {FakeNode} child
   * @returns {FakeNode}
   */
  removeChild(child) {
    this.children = this.children.filter((candidate) => candidate !== child);
    child.parentNode = null;
    return child;
  }

  /** @param {...(FakeNode | null | undefined | false)} children */
  replaceChildren(...children) {
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = [];
    this._textContent = "";
    this.append(...children);
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  /**
   * @param {string} name
   * @param {unknown} value
   */
  setAttribute(name, value) {
    const normalizedName = String(name);
    const normalizedValue = String(value);
    this.attributes.set(normalizedName, normalizedValue);
    if (normalizedName === "class") this.className = normalizedValue;
    if (normalizedName === "checked") this.checked = true;
    if (normalizedName === "disabled") this.disabled = true;
    if (normalizedName === "hidden") this.hidden = true;
    if (normalizedName === "id") this.id = normalizedValue;
    if (normalizedName === "multiple") this.multiple = true;
    if (normalizedName === "name") this.name = normalizedValue;
    if (normalizedName === "open") this.open = true;
    if (normalizedName === "required") this.required = true;
    if (normalizedName === "type") this.type = normalizedValue;
    if (normalizedName === "value") this.value = normalizedValue;
    if (normalizedName.startsWith("data-")) {
      this.dataset[toDatasetKey(normalizedName.slice(5))] = normalizedValue;
    }
  }

  /**
   * @param {string} name
   * @returns {string | null}
   */
  getAttribute(name) {
    return this.attributes.has(name) ? /** @type {string} */ (this.attributes.get(name)) : null;
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  hasAttribute(name) {
    return this.attributes.has(name);
  }

  /** @param {string} name */
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "checked") this.checked = false;
    if (name === "disabled") this.disabled = false;
    if (name === "hidden") this.hidden = false;
    if (name === "multiple") this.multiple = false;
    if (name === "open") this.open = false;
    if (name === "required") this.required = false;
    if (String(name).startsWith("data-")) delete this.dataset[toDatasetKey(String(name).slice(5))];
  }

  /**
   * @param {string} type
   * @param {FakeEventListener} listener
   * @param {{ once?: boolean }} [options]
   */
  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ listener, once: Boolean(options?.once) });
    this.listeners.set(type, listeners);
  }

  /**
   * @param {FakeDomEvent} [event]
   * @returns {boolean}
   */
  dispatchEvent(event = {}) {
    const eventObject = event;
    eventObject.type ||= "";
    eventObject.target ||= this;
    eventObject.currentTarget = this;
    eventObject.defaultPrevented ??= false;
    eventObject.preventDefault ||= /** @this {FakeDomEvent} */ function preventDefault() { this.defaultPrevented = true; };
    eventObject.stopPropagation ||= /** @this {FakeDomEvent} */ function stopPropagation() { this.propagationStopped = true; };
    for (const entry of [...(this.listeners.get(eventObject.type) || [])]) {
      entry.listener.call(this, eventObject);
      if (entry.once) {
        this.listeners.set(eventObject.type, (this.listeners.get(eventObject.type) || []).filter((candidate) => candidate !== entry));
      }
    }
    return !eventObject.defaultPrevented;
  }

  async click() {
    if (this.disabled) return;
    const event = createFakeEvent("click", { target: this, currentTarget: this });
    for (const entry of [...(this.listeners.get("click") || [])]) {
      await entry.listener.call(this, event);
      if (entry.once) {
        this.listeners.set("click", (this.listeners.get("click") || []).filter((candidate) => candidate !== entry));
      }
    }
  }

  showModal() {
    this.setAttribute("open", "");
  }

  /** @param {unknown} [value] */
  close(value = "") {
    this.returnValue = String(value);
    this.removeAttribute("open");
    this.dispatchEvent(createFakeEvent("close", { target: this }));
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  /**
   * @param {string} selector
   * @returns {boolean}
   */
  matches(selector) {
    return matchesSelector(this, selector);
  }

  /**
   * @param {string} selector
   * @returns {FakeNode}
   */
  querySelector(selector) {
    return /** @type {FakeNode} */ (findElements(this, selector)[0] || null);
  }

  /**
   * @param {string} selector
   * @returns {FakeNode[]}
   */
  querySelectorAll(selector) {
    return findElements(this, selector);
  }

  /** @returns {FakeNode} */
  get firstChild() {
    return /** @type {FakeNode} */ (this.children[0] || null);
  }

  /** @returns {FakeNode[]} */
  get options() {
    return this.children.filter((child) => child.tagName === "OPTION");
  }

  /** @returns {FakeNode[]} */
  get selectedOptions() {
    return this.options.filter((option) => option.selected);
  }

  /** @returns {string} */
  get className() {
    return this.classList.toString();
  }

  /** @param {unknown} value */
  set className(value) {
    this.classList = new FakeClassList(this);
    String(value || "").split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name));
  }

  /** @returns {string} */
  get textContent() {
    return this._textContent || this.children.map((child) => child.textContent).join("");
  }

  /** @param {unknown} value */
  set textContent(value) {
    this._textContent = String(value ?? "");
    this.children = [];
  }
}

export class FakeClassList {
  /** @param {FakeElement} element */
  constructor(element) {
    this.element = element;
    /** @type {Set<string>} */
    this.values = new Set();
  }

  /** @param {...unknown} names */
  add(...names) {
    names.filter(Boolean).forEach((name) => {
      const token = String(name);
      if (/\s/.test(token)) throw new Error("The token can not contain whitespace.");
      this.values.add(token);
    });
    this.sync();
  }

  /** @param {...unknown} names */
  remove(...names) {
    names.filter(Boolean).forEach((name) => this.values.delete(String(name)));
    this.sync();
  }

  /**
   * @param {unknown} name
   * @param {unknown} [force]
   * @returns {boolean}
   */
  toggle(name, force) {
    const token = String(name);
    const shouldAdd = force === undefined ? !this.values.has(token) : Boolean(force);
    if (shouldAdd) this.values.add(token);
    else this.values.delete(token);
    this.sync();
    return shouldAdd;
  }

  /**
   * @param {string} name
   * @returns {boolean}
   */
  contains(name) {
    return this.values.has(name);
  }

  toString() {
    return [...this.values].join(" ");
  }

  sync() {
    this.element.attributes.set("class", this.toString());
  }
}

/**
 * @param {FakeNode} root
 * @param {string} selector
 * @returns {FakeNode[]}
 */
function findElements(root, selector) {
  const selectors = splitSelectorList(selector).map(parseDescendantSelector);
  const descendants = collectDescendants(root);
  return descendants.filter((element) => selectors.some((parts) => matchesSelectorChain(element, parts)));
}

/**
 * @param {FakeNode} root
 * @returns {FakeNode[]}
 */
function collectDescendants(root) {
  /** @type {FakeNode[]} */
  const results = [];
  const queue = [...(root.children || [])];
  while (queue.length > 0) {
    const element = /** @type {FakeNode} */ (queue.shift());
    results.push(element);
    queue.push(...(element.children || []));
  }
  return results;
}

/**
 * @param {FakeNode} element
 * @param {string[]} parts
 * @returns {boolean}
 */
function matchesSelectorChain(element, parts) {
  if (!matchesSelector(element, parts.at(-1))) return false;
  let ancestor = element.parentNode;
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    while (ancestor && !matchesSelector(ancestor, parts[index])) ancestor = ancestor.parentNode;
    if (!ancestor) return false;
    ancestor = ancestor.parentNode;
  }
  return true;
}

/**
 * @param {FakeNode} element
 * @param {string | undefined} selector
 * @returns {boolean}
 */
function matchesSelector(element, selector) {
  const candidate = String(selector).trim();
  const notMatch = candidate.match(/^(.*):not\(\[([\w-]+)=['"]([^'"]*)['"]\]\)$/);
  if (notMatch) {
    return matchesSelector(element, notMatch[1]) && element.getAttribute(notMatch[2]) !== notMatch[3];
  }
  if (candidate.startsWith(".")) return element.classList.contains(candidate.slice(1));
  if (candidate.startsWith("#")) return element.id === candidate.slice(1);

  const match = candidate.match(/^([a-z][\w-]*)?(?:\[([\w-]+)(?:=['"]([^'"]*)['"])?\])?$/i);
  if (!match) throw new Error(`${SUPPORTED_SELECTOR_MESSAGE} Unsupported selector: ${selector}`);
  const [, tagName, attribute, expectedValue] = /** @type {(string | undefined)[]} */ (match);
  if (tagName && element.tagName.toLowerCase() !== tagName.toLowerCase()) return false;
  if (!attribute) return Boolean(tagName);
  const actualValue = attribute.startsWith("data-")
    ? element.getAttribute(attribute) ?? element.dataset[toDatasetKey(attribute.slice(5))] ?? null
    : element.getAttribute(attribute);
  if (expectedValue !== undefined) return actualValue === expectedValue;
  if (attribute === "tabindex") return actualValue !== null;
  return actualValue !== null;
}

/**
 * @param {string} selector
 * @returns {string[]}
 */
function splitSelectorList(selector) {
  return String(selector).split(",").map((entry) => entry.trim()).filter(Boolean);
}

/**
 * @param {string} selector
 * @returns {string[]}
 */
function parseDescendantSelector(selector) {
  const parts = selector.split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error(`${SUPPORTED_SELECTOR_MESSAGE} Empty selector.`);
  for (const part of parts) {
    const withoutNot = part.replace(/:not\(\[[\w-]+=['"][^'"]*['"]\]\)$/, "");
    if (!/^(?:\.[\w-]+|#[\w-]+|[a-z][\w-]*(?:\[[\w-]+(?:=['"][^'"]*['"])?\])?|\[[\w-]+(?:=['"][^'"]*['"])?\])$/i.test(withoutNot)) {
      throw new Error(`${SUPPORTED_SELECTOR_MESSAGE} Unsupported selector: ${selector}`);
    }
  }
  return parts;
}

/**
 * @param {string} name
 * @returns {string}
 */
function toDatasetKey(name) {
  return String(name).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}
