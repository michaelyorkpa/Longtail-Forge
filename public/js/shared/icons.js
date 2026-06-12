(function attachIconHelpers(global) {
  const root = global.LongtailForge || {};
  const svgNamespace = "http://www.w3.org/2000/svg";
  const iconRegistry = Object.freeze({
    add: Object.freeze([{ type: "path", attrs: { d: "M5 12h14" } }, { type: "path", attrs: { d: "M12 5v14" } }]),
    archive: Object.freeze([
      { type: "rect", attrs: { x: "3", y: "4", width: "18", height: "4", rx: "1" } },
      { type: "path", attrs: { d: "M5 8v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" } },
      { type: "path", attrs: { d: "M10 12h4" } },
    ]),
    bell: Object.freeze([
      { type: "path", attrs: { d: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" } },
      { type: "path", attrs: { d: "M13.7 21a2 2 0 0 1-3.4 0" } },
    ]),
    complete: Object.freeze([{ type: "path", attrs: { d: "M20 6 9 17l-5-5" } }]),
    close: Object.freeze([{ type: "path", attrs: { d: "M18 6 6 18" } }, { type: "path", attrs: { d: "m6 6 12 12" } }]),
    copy: Object.freeze([
      { type: "rect", attrs: { x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" } },
      { type: "path", attrs: { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" } },
    ]),
    delete: Object.freeze([
      { type: "path", attrs: { d: "M3 6h18" } },
      { type: "path", attrs: { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" } },
      { type: "path", attrs: { d: "m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" } },
      { type: "path", attrs: { d: "M10 11v6" } },
      { type: "path", attrs: { d: "M14 11v6" } },
    ]),
    down: Object.freeze([{ type: "path", attrs: { d: "m6 9 6 6 6-6" } }]),
    edit: Object.freeze([
      { type: "path", attrs: { d: "M21.2 6.8a2 2 0 0 0-4-4L4 16v4h4Z" } },
      { type: "path", attrs: { d: "m14.5 5.5 4 4" } },
    ]),
    duplicate: Object.freeze([
      { type: "rect", attrs: { x: "8", y: "8", width: "12", height: "12", rx: "2" } },
      { type: "path", attrs: { d: "M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" } },
      { type: "path", attrs: { d: "M14 11v6" } },
      { type: "path", attrs: { d: "M11 14h6" } },
    ]),
    more: Object.freeze([
      { type: "circle", attrs: { cx: "12", cy: "12", r: "1" } },
      { type: "circle", attrs: { cx: "19", cy: "12", r: "1" } },
      { type: "circle", attrs: { cx: "5", cy: "12", r: "1" } },
    ]),
    pause: Object.freeze([
      { type: "rect", attrs: { x: "6", y: "4", width: "4", height: "16", rx: "1" } },
      { type: "rect", attrs: { x: "14", y: "4", width: "4", height: "16", rx: "1" } },
    ]),
    refresh: Object.freeze([
      { type: "path", attrs: { d: "M3 12a9 9 0 0 1 15.5-6.2L21 8" } },
      { type: "path", attrs: { d: "M21 3v5h-5" } },
      { type: "path", attrs: { d: "M21 12a9 9 0 0 1-15.5 6.2L3 16" } },
      { type: "path", attrs: { d: "M3 21v-5h5" } },
    ]),
    restore: Object.freeze([
      { type: "path", attrs: { d: "M3 12a9 9 0 1 0 3-6.7" } },
      { type: "path", attrs: { d: "M3 3v6h6" } },
      { type: "path", attrs: { d: "M12 7v5l3 2" } },
    ]),
    save: Object.freeze([
      { type: "path", attrs: { d: "M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8A2 2 0 0 1 21 8.8V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" } },
      { type: "path", attrs: { d: "M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" } },
      { type: "path", attrs: { d: "M7 3v4a1 1 0 0 0 1 1h7" } },
    ]),
    start: Object.freeze([{ type: "polygon", attrs: { points: "6 3 20 12 6 21 6 3" } }]),
    up: Object.freeze([{ type: "path", attrs: { d: "m18 15-6-6-6 6" } }]),
  });

  function createIcon(name, options = {}) {
    const iconDefinition = iconRegistry[name];

    if (!iconDefinition) {
      throw new Error(`Unknown icon '${name}'.`);
    }

    const icon = document.createElementNS(svgNamespace, "svg");
    icon.classList.add("icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", String(options.size || 20));
    icon.setAttribute("height", String(options.size || 20));
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", String(options.strokeWidth || 2));
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");

    if (options.decorative !== false) {
      icon.setAttribute("aria-hidden", "true");
      icon.setAttribute("focusable", "false");
    } else {
      const label = String(options.label || "").trim();
      if (!label) {
        throw new Error("Non-decorative icons require a label.");
      }
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", label);
    }

    iconDefinition.forEach((part) => {
      const element = document.createElementNS(svgNamespace, part.type);
      Object.entries(part.attrs).forEach(([attribute, value]) => {
        element.setAttribute(attribute, value);
      });
      icon.appendChild(element);
    });

    return icon;
  }

  function createIconButton(options = {}) {
    const label = String(options.label || "").trim();
    const text = String(options.text || "").trim();

    if (!label && !text) {
      throw new Error("Icon buttons require an accessible label or visible text.");
    }

    const button = document.createElement("button");
    button.type = options.type || "button";
    button.classList.add("action-button");

    if (options.iconOnly !== false && !text) {
      button.classList.add("icon-button");
      button.setAttribute("aria-label", label);
      button.title = options.title || label;
    }

    applyVariant(button, options.variant);
    appendButtonContent(button, options);
    return button;
  }

  function decorateButton(button, options = {}) {
    if (!button || button.nodeType !== 1 || String(button.tagName || "").toLowerCase() !== "button") {
      throw new Error("decorateButton requires a button element.");
    }

    const label = String(options.label || button.getAttribute("aria-label") || button.textContent || "").trim();
    const text = options.text === undefined ? button.textContent.trim() : String(options.text || "").trim();
    button.textContent = "";
    button.classList.add("action-button");

    if (options.iconOnly === true || (!text && options.iconOnly !== false)) {
      button.classList.add("icon-button");
      if (label) {
        button.setAttribute("aria-label", label);
        button.title = options.title || label;
      }
    }

    applyVariant(button, options.variant);
    appendButtonContent(button, { ...options, label, text });
    return button;
  }

  function appendButtonContent(button, options) {
    const icon = createIcon(options.icon, { decorative: true, size: options.size });
    const text = String(options.text || "").trim();

    if (options.position === "after") {
      appendVisibleText(button, text);
      button.appendChild(icon);
    } else {
      button.appendChild(icon);
      appendVisibleText(button, text);
    }
  }

  function appendVisibleText(button, text) {
    if (!text) {
      return;
    }

    const label = document.createElement("span");
    label.className = "action-button-label";
    label.textContent = text;
    button.appendChild(label);
  }

  function applyVariant(button, variant) {
    if (variant === "danger") {
      button.classList.add("danger-button");
    } else if (variant === "secondary") {
      button.classList.add("secondary-button");
    } else if (variant === "link") {
      button.classList.add("link-button");
    }
  }

  root.icons = {
    createIcon,
    createIconButton,
    decorateButton,
    names: Object.freeze(Object.keys(iconRegistry)),
  };
  global.LongtailForge = root;
})(window);
