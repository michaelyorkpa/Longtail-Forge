const SUPPORTED_SELECTOR_MESSAGE = "Fake DOM selectors support tags, classes, IDs, attributes, descendant relationships, comma lists, and :not([attribute='value']).";

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
  const window = {
    document,
    ...windowOverrides,
  };
  const framework = {
    ...longtailForge,
  };

  if (responses) {
    framework.api = createQueuedJsonApi(responses);
  }
  if (api) {
    framework.api = api;
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
    ...globals,
  };
}

export function createQueuedJsonApi(responses = []) {
  const queue = [...responses];
  const calls = [];
  return {
    calls,
    async getJson(url) {
      calls.push(url);
      const next = queue.length > 0 ? queue.shift() : responses[responses.length - 1];
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

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
    this.activeElement = null;
    this.body = this.createElement("body");
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  createTextNode(text) {
    const node = new FakeElement("#text", this);
    node.textContent = String(text);
    return node;
  }

  querySelector(selector) {
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

export class FakeElement {
  constructor(tagName, ownerDocument = null) {
    this.tagName = String(tagName).toUpperCase();
    this.nodeType = this.tagName === "#TEXT" ? 3 : 1;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.classList = new FakeClassList(this);
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

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  appendChild(child) {
    if (child === null || child === undefined || child === false) return child;
    this.children.push(child);
    child.parentNode = this;
    if (!child.ownerDocument) child.ownerDocument = this.ownerDocument;
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter((candidate) => candidate !== child);
    child.parentNode = null;
    return child;
  }

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

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

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

  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ listener, once: Boolean(options?.once) });
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event = {}) {
    const eventObject = event;
    eventObject.type ||= "";
    eventObject.target ||= this;
    eventObject.currentTarget = this;
    eventObject.defaultPrevented ??= false;
    eventObject.preventDefault ||= function preventDefault() { this.defaultPrevented = true; };
    eventObject.stopPropagation ||= function stopPropagation() { this.propagationStopped = true; };
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

  close(value = "") {
    this.returnValue = String(value);
    this.removeAttribute("open");
    this.dispatchEvent(createFakeEvent("close", { target: this }));
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  querySelector(selector) {
    return findElements(this, selector)[0] || null;
  }

  querySelectorAll(selector) {
    return findElements(this, selector);
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get options() {
    return this.children.filter((child) => child.tagName === "OPTION");
  }

  get selectedOptions() {
    return this.options.filter((option) => option.selected);
  }

  get className() {
    return this.classList.toString();
  }

  set className(value) {
    this.classList = new FakeClassList(this);
    String(value || "").split(/\s+/).filter(Boolean).forEach((name) => this.classList.add(name));
  }

  get textContent() {
    return this._textContent || this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this._textContent = String(value ?? "");
    this.children = [];
  }
}

export class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  add(...names) {
    names.filter(Boolean).forEach((name) => {
      const token = String(name);
      if (/\s/.test(token)) throw new Error("The token can not contain whitespace.");
      this.values.add(token);
    });
    this.sync();
  }

  remove(...names) {
    names.filter(Boolean).forEach((name) => this.values.delete(String(name)));
    this.sync();
  }

  toggle(name, force) {
    const token = String(name);
    const shouldAdd = force === undefined ? !this.values.has(token) : Boolean(force);
    if (shouldAdd) this.values.add(token);
    else this.values.delete(token);
    this.sync();
    return shouldAdd;
  }

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

function findElements(root, selector) {
  const selectors = splitSelectorList(selector).map(parseDescendantSelector);
  const descendants = collectDescendants(root);
  return descendants.filter((element) => selectors.some((parts) => matchesSelectorChain(element, parts)));
}

function collectDescendants(root) {
  const results = [];
  const queue = [...(root.children || [])];
  while (queue.length > 0) {
    const element = queue.shift();
    results.push(element);
    queue.push(...(element.children || []));
  }
  return results;
}

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
  const [, tagName, attribute, expectedValue] = match;
  if (tagName && element.tagName.toLowerCase() !== tagName.toLowerCase()) return false;
  if (!attribute) return Boolean(tagName);
  const actualValue = attribute.startsWith("data-")
    ? element.getAttribute(attribute) ?? element.dataset[toDatasetKey(attribute.slice(5))] ?? null
    : element.getAttribute(attribute);
  if (expectedValue !== undefined) return actualValue === expectedValue;
  if (attribute === "tabindex") return actualValue !== null;
  return actualValue !== null;
}

function splitSelectorList(selector) {
  return String(selector).split(",").map((entry) => entry.trim()).filter(Boolean);
}

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

function toDatasetKey(name) {
  return String(name).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}
