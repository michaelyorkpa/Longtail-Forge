(function initNotesEditor(global) {
  const namespace = global.LongtailForge = global.LongtailForge || {};

  const COMMANDS = Object.freeze({
    bold: { prefix: "**", suffix: "**", placeholder: "bold text" },
    italic: { prefix: "*", suffix: "*", placeholder: "italic text" },
    heading: { prefix: "## ", suffix: "", placeholder: "Heading" },
    link: { prefix: "[", suffix: "](https://example.com)", placeholder: "link text" },
    checklist: { prefix: "- [ ] ", suffix: "", placeholder: "Checklist item" },
    unorderedList: { prefix: "- ", suffix: "", placeholder: "List item" },
    orderedList: { prefix: "1. ", suffix: "", placeholder: "List item" },
    codeBlock: { prefix: "```\n", suffix: "\n```", placeholder: "code" },
    blockquote: { prefix: "> ", suffix: "", placeholder: "Quote" },
    wikiLink: { prefix: "[[", suffix: "]]", placeholder: "Note Title" },
  });

  function normalizeMarkdown(markdown) {
    return String(markdown || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .trim();
  }

  function applyCommand(textarea, commandName) {
    const command = COMMANDS[commandName];

    if (!textarea || !command) {
      return "";
    }

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    const value = String(textarea.value || "");
    const selected = value.slice(start, end) || command.placeholder;
    const inserted = `${command.prefix}${selected}${command.suffix}`;

    textarea.value = `${value.slice(0, start)}${inserted}${value.slice(end)}`;
    textarea.selectionStart = start + command.prefix.length;
    textarea.selectionEnd = start + command.prefix.length + selected.length;
    textarea.dispatchEvent(new global.Event("input", { bubbles: true }));
    textarea.focus();

    return textarea.value;
  }

  function createPlainTextarea(element, options = {}) {
    if (!element) {
      return null;
    }

    element.value = normalizeMarkdown(options.value || element.value || "");
    element.dataset.notesEditor = "plain-markdown";

    return {
      element,
      getValue: () => normalizeMarkdown(element.value),
      setValue: (value) => {
        element.value = normalizeMarkdown(value);
      },
      applyCommand: (commandName) => applyCommand(element, commandName),
      commands: Object.keys(COMMANDS),
    };
  }

  namespace.notesEditor = {
    applyCommand,
    commands: COMMANDS,
    createPlainTextarea,
    normalizeMarkdown,
  };
})(window);
