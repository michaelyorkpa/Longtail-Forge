(function initNotesEditor(global) {
  const namespace = global.LongtailForge = global.LongtailForge || {};

  /**
   * The eleven commands, by name, exactly as the surface publishes them.
   * @type {Readonly<Record<string, NotesEditorCommand>>}
   */
  const COMMANDS = Object.freeze({
    bold: { prefix: "**", suffix: "**", placeholder: "bold text" },
    italic: { prefix: "*", suffix: "*", placeholder: "italic text" },
    underline: { prefix: "++", suffix: "++", placeholder: "underlined text" },
    heading: { prefix: "## ", suffix: "", placeholder: "Heading" },
    link: { prefix: "[", suffix: "](https://example.com)", placeholder: "link text" },
    checklist: { prefix: "- [ ] ", suffix: "", placeholder: "Checklist item" },
    unorderedList: { prefix: "- ", suffix: "", placeholder: "List item" },
    orderedList: { prefix: "1. ", suffix: "", placeholder: "List item" },
    codeBlock: { prefix: "```\n", suffix: "\n```", placeholder: "code" },
    blockquote: { prefix: "> ", suffix: "", placeholder: "Quote" },
    wikiLink: { prefix: "[[", suffix: "]]", placeholder: "Note Title" },
  });
  const INDENT = "  ";

  /** @typedef {import("../../../src/types/browser-contracts.js").NotesEditorCommand} NotesEditorCommand */
  /** @typedef {import("../../../src/types/browser-contracts.js").NotesPlainTextareaController} NotesPlainTextareaController */

  /**
   * A member of a value this helper was handed, read as the member access read it: a missing
   * value still fails as a `TypeError`, and anything else is read with itself as the receiver.
   * The editor's textarea and event are `unknown` at its published boundary, and every caller
   * that is not the page hands over a stand-in rather than an element.
   * @param {unknown} value
   * @param {string} key
   * @returns {unknown}
   */
  function editorMember(value, key) {
    if (value === null || value === undefined) {
      throw new TypeError(`Notes editor member '${key}' is unavailable.`);
    }
    return Reflect.get(Object(value), key, value);
  }

  /**
   * A caret index. The DOM answers a number here and every falsy one still reads as `0`, which is
   * what the `|| 0` answered; a value that is not a number is converted rather than carried into
   * the arithmetic below.
   * @param {unknown} value
   * @param {string} key
   * @returns {number}
   */
  function caretIndex(value, key) {
    return Number(editorMember(value, key)) || 0;
  }

  /**
   * `target[key] = value`, through the target's own setter and receiver.
   * @param {unknown} target
   * @param {string} key
   * @param {unknown} value
   * @returns {void}
   */
  function setEditorMember(target, key, value) {
    Reflect.set(Object(target), key, value, target);
  }

  /**
   * `target[key](...args)`, with the target as receiver and the same `TypeError` for a member
   * that cannot be called.
   * @param {unknown} target
   * @param {string} key
   * @param {readonly unknown[]} args
   * @returns {unknown}
   */
  function callEditorMethod(target, key, args) {
    const method = editorMember(target, key);
    if (typeof method !== "function") {
      throw new TypeError(`Notes editor member '${key}' is not a function.`);
    }
    return Reflect.apply(method, target, args);
  }

  /**
   * The command a name selects, read as `COMMANDS[commandName]` read it: the name takes the same
   * property-key conversion, a name the table carries - its own or its prototype's - answers what
   * that lookup answered, and a symbol selects nothing, because the table has no symbol keys.
   * @param {unknown} commandName
   * @returns {NotesEditorCommand | undefined}
   */
  function commandFor(commandName) {
    const key = Reflect.ownKeys(Object.fromEntries([[commandName, undefined]]))[0];
    return typeof key === "string" && key in COMMANDS ? COMMANDS[key] : undefined;
  }

  /**
   * Whether a value is the textarea the controller publishes. A node of any realm answers this,
   * and an element whose tag is `TEXTAREA` in an HTML document is that element.
   * @param {unknown} value
   * @returns {value is HTMLTextAreaElement}
   */
  function isTextareaElement(value) {
    return value !== null && typeof value === "object"
      && Reflect.get(value, "nodeType") === 1 && Reflect.get(value, "tagName") === "TEXTAREA";
  }

  /** @param {unknown} markdown @returns {string} */
  function normalizeMarkdown(markdown) {
    return String(markdown || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .trim();
  }

  /** @param {unknown} textarea @param {unknown} commandName @returns {string} */
  function applyCommand(textarea, commandName) {
    const command = commandFor(commandName);

    if (!textarea || !command) {
      return "";
    }

    const start = caretIndex(textarea, "selectionStart");
    const end = Number(editorMember(textarea, "selectionEnd")) || start;
    const value = String(editorMember(textarea, "value") || "");
    const selected = value.slice(start, end) || command.placeholder;
    const inserted = `${command.prefix}${selected}${command.suffix}`;

    setEditorMember(textarea, "value", `${value.slice(0, start)}${inserted}${value.slice(end)}`);
    setEditorMember(textarea, "selectionStart", start + command.prefix.length);
    setEditorMember(textarea, "selectionEnd", start + command.prefix.length + selected.length);
    callEditorMethod(textarea, "dispatchEvent", [new global.Event("input", { bubbles: true })]);
    callEditorMethod(textarea, "focus", []);

    return String(editorMember(textarea, "value"));
  }

  /** @param {unknown} event @param {unknown} textarea @returns {void} */
  function handleKeydown(event, textarea) {
    if (!textarea) {
      return;
    }

    if (editorMember(event, "key") === "Tab") {
      callEditorMethod(event, "preventDefault", []);
      if (editorMember(event, "shiftKey")) {
        outdentSelection(textarea);
      } else {
        indentSelection(textarea);
      }
      return;
    }

    if (editorMember(event, "key") === "Enter" && continueListMarker(textarea)) {
      callEditorMethod(event, "preventDefault", []);
    }
  }

  /** @param {unknown} textarea @returns {void} */
  function indentSelection(textarea) {
    const start = caretIndex(textarea, "selectionStart");
    const end = Number(editorMember(textarea, "selectionEnd")) || start;
    const value = String(editorMember(textarea, "value") || "");

    if (start === end) {
      setEditorMember(textarea, "value", `${value.slice(0, start)}${INDENT}${value.slice(end)}`);
      setEditorMember(textarea, "selectionStart", start + INDENT.length);
      setEditorMember(textarea, "selectionEnd", start + INDENT.length);
      emitInput(textarea);
      return;
    }

    const range = selectedLineRange(value, start, end);
    const original = value.slice(range.start, range.end);
    const lines = original.split("\n");
    const replacement = lines.map((line) => `${INDENT}${line}`).join("\n");

    setEditorMember(textarea, "value", `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`);
    setEditorMember(textarea, "selectionStart", start + INDENT.length);
    setEditorMember(textarea, "selectionEnd", end + (INDENT.length * lines.length));
    emitInput(textarea);
  }

  /** @param {unknown} textarea @returns {void} */
  function outdentSelection(textarea) {
    const start = caretIndex(textarea, "selectionStart");
    const end = Number(editorMember(textarea, "selectionEnd")) || start;
    const value = String(editorMember(textarea, "value") || "");
    const range = selectedLineRange(value, start, end);
    const original = value.slice(range.start, range.end);
    const lines = original.split("\n");
    let removedBeforeStart = 0;
    let removedTotal = 0;

    const replacement = lines.map((line, index) => {
      const removed = removableIndent(line);
      removedTotal += removed.length;
      if (range.start + lineOffset(lines, index) < start) {
        removedBeforeStart += Math.min(removed.length, Math.max(0, start - (range.start + lineOffset(lines, index))));
      }
      return line.slice(removed.length);
    }).join("\n");

    setEditorMember(textarea, "value", `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`);
    setEditorMember(textarea, "selectionStart", Math.max(range.start, start - removedBeforeStart));
    setEditorMember(textarea, "selectionEnd", Math.max(Number(editorMember(textarea, "selectionStart")), end - removedTotal));
    emitInput(textarea);
  }

  /** @param {unknown} textarea @returns {boolean} */
  function continueListMarker(textarea) {
    const start = caretIndex(textarea, "selectionStart");
    const end = Number(editorMember(textarea, "selectionEnd")) || start;

    if (start !== end) {
      return false;
    }

    const value = String(editorMember(textarea, "value") || "");
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const lineEnd = value.indexOf("\n", start);
    const currentLineEnd = lineEnd === -1 ? value.length : lineEnd;
    const beforeCursor = value.slice(lineStart, start);
    const afterCursor = value.slice(start, currentLineEnd);
    const marker = parseListMarker(beforeCursor);

    if (!marker || afterCursor.trim()) {
      return false;
    }

    if (!marker.content.trim()) {
      setEditorMember(textarea, "value", `${value.slice(0, lineStart)}${value.slice(start)}`);
      setEditorMember(textarea, "selectionStart", lineStart);
      setEditorMember(textarea, "selectionEnd", lineStart);
      emitInput(textarea);
      return true;
    }

    const nextMarker = `${marker.indent}${marker.next}`;
    const insertion = `\n${nextMarker}`;
    setEditorMember(textarea, "value", `${value.slice(0, start)}${insertion}${value.slice(start)}`);
    setEditorMember(textarea, "selectionStart", start + insertion.length);
    setEditorMember(textarea, "selectionEnd", editorMember(textarea, "selectionStart"));
    emitInput(textarea);
    return true;
  }

  /** @param {string} linePrefix */
  function parseListMarker(linePrefix) {
    const taskMatch = linePrefix.match(/^(\s*)([-+*])\s+\[[ xX]\]\s+(.*)$/);
    if (taskMatch) {
      return {
        content: taskMatch[3],
        indent: taskMatch[1],
        next: `${taskMatch[2]} [ ] `,
      };
    }

    const unorderedMatch = linePrefix.match(/^(\s*)([-+*])\s+(.*)$/);
    if (unorderedMatch) {
      return {
        content: unorderedMatch[3],
        indent: unorderedMatch[1],
        next: `${unorderedMatch[2]} `,
      };
    }

    const orderedMatch = linePrefix.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
    if (orderedMatch) {
      return {
        content: orderedMatch[4],
        indent: orderedMatch[1],
        next: `${Number.parseInt(orderedMatch[2], 10) + 1}${orderedMatch[3]} `,
      };
    }

    return null;
  }

  /** @param {string} value @param {number} start @param {number} end */
  function selectedLineRange(value, start, end) {
    const adjustedEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
    const rangeStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextBreak = value.indexOf("\n", adjustedEnd);

    return {
      start: rangeStart,
      end: nextBreak === -1 ? value.length : nextBreak,
    };
  }

  /** @param {string} line @returns {string} */
  function removableIndent(line) {
    if (line.startsWith("\t")) {
      return "\t";
    }
    const spaces = line.match(/^ {1,2}/);
    return spaces ? spaces[0] : "";
  }

  /** @param {readonly string[]} lines @param {number} lineIndex @returns {number} */
  function lineOffset(lines, lineIndex) {
    return lines.slice(0, lineIndex).reduce((offset, line) => offset + line.length + 1, 0);
  }

  /** @param {unknown} textarea @returns {void} */
  function emitInput(textarea) {
    callEditorMethod(textarea, "dispatchEvent", [new global.Event("input", { bubbles: true })]);
  }

  /**
   * The controller the page holds for its own `<textarea>`.
   *
   * The published controller carries the element as an `HTMLTextAreaElement`, and the page hands
   * over the one it rendered. Anything else is named here rather than published as a textarea.
   * @param {unknown} element
   * @param {unknown} [options]
   * @returns {NotesPlainTextareaController | null}
   */
  function createPlainTextarea(element, options = {}) {
    if (!element) {
      return null;
    }

    if (!isTextareaElement(element)) {
      throw new TypeError("The plain Markdown editor requires a textarea element.");
    }

    element.value = normalizeMarkdown(editorMember(options, "value") || element.value || "");
    element.dataset.notesEditor = "plain-markdown";
    element.addEventListener("keydown", (event) => handleKeydown(event, element));

    return {
      element,
      getValue: () => normalizeMarkdown(element.value),
      /** @param {unknown} value */
      setValue: (value) => {
        element.value = normalizeMarkdown(value);
      },
      /** @param {unknown} commandName */
      applyCommand: (commandName) => applyCommand(element, commandName),
      continueList: () => continueListMarker(element),
      indent: () => indentSelection(element),
      outdent: () => outdentSelection(element),
      commands: Object.keys(COMMANDS),
    };
  }

  namespace.notesEditor = {
    applyCommand,
    commands: COMMANDS,
    continueListMarker,
    createPlainTextarea,
    handleKeydown,
    normalizeMarkdown,
  };
})(window);
