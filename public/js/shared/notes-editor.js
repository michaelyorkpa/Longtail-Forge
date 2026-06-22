(function initNotesEditor(global) {
  const namespace = global.LongtailForge = global.LongtailForge || {};

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

  function handleKeydown(event, textarea) {
    if (!textarea) {
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      if (event.shiftKey) {
        outdentSelection(textarea);
      } else {
        indentSelection(textarea);
      }
      return;
    }

    if (event.key === "Enter" && continueListMarker(textarea)) {
      event.preventDefault();
    }
  }

  function indentSelection(textarea) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    const value = String(textarea.value || "");

    if (start === end) {
      textarea.value = `${value.slice(0, start)}${INDENT}${value.slice(end)}`;
      textarea.selectionStart = start + INDENT.length;
      textarea.selectionEnd = start + INDENT.length;
      emitInput(textarea);
      return;
    }

    const range = selectedLineRange(value, start, end);
    const original = value.slice(range.start, range.end);
    const lines = original.split("\n");
    const replacement = lines.map((line) => `${INDENT}${line}`).join("\n");

    textarea.value = `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`;
    textarea.selectionStart = start + INDENT.length;
    textarea.selectionEnd = end + (INDENT.length * lines.length);
    emitInput(textarea);
  }

  function outdentSelection(textarea) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    const value = String(textarea.value || "");
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

    textarea.value = `${value.slice(0, range.start)}${replacement}${value.slice(range.end)}`;
    textarea.selectionStart = Math.max(range.start, start - removedBeforeStart);
    textarea.selectionEnd = Math.max(textarea.selectionStart, end - removedTotal);
    emitInput(textarea);
  }

  function continueListMarker(textarea) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;

    if (start !== end) {
      return false;
    }

    const value = String(textarea.value || "");
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
      textarea.value = `${value.slice(0, lineStart)}${value.slice(start)}`;
      textarea.selectionStart = lineStart;
      textarea.selectionEnd = lineStart;
      emitInput(textarea);
      return true;
    }

    const nextMarker = `${marker.indent}${marker.next}`;
    const insertion = `\n${nextMarker}`;
    textarea.value = `${value.slice(0, start)}${insertion}${value.slice(start)}`;
    textarea.selectionStart = start + insertion.length;
    textarea.selectionEnd = textarea.selectionStart;
    emitInput(textarea);
    return true;
  }

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

  function selectedLineRange(value, start, end) {
    const adjustedEnd = end > start && value[end - 1] === "\n" ? end - 1 : end;
    const rangeStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextBreak = value.indexOf("\n", adjustedEnd);

    return {
      start: rangeStart,
      end: nextBreak === -1 ? value.length : nextBreak,
    };
  }

  function removableIndent(line) {
    if (line.startsWith("\t")) {
      return "\t";
    }
    const spaces = line.match(/^ {1,2}/);
    return spaces ? spaces[0] : "";
  }

  function lineOffset(lines, lineIndex) {
    return lines.slice(0, lineIndex).reduce((offset, line) => offset + line.length + 1, 0);
  }

  function emitInput(textarea) {
    textarea.dispatchEvent(new global.Event("input", { bubbles: true }));
  }

  function createPlainTextarea(element, options = {}) {
    if (!element) {
      return null;
    }

    element.value = normalizeMarkdown(options.value || element.value || "");
    element.dataset.notesEditor = "plain-markdown";
    element.addEventListener("keydown", (event) => handleKeydown(event, element));

    return {
      element,
      getValue: () => normalizeMarkdown(element.value),
      setValue: (value) => {
        element.value = normalizeMarkdown(value);
      },
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
