Note bodies use Markdown as the editable format. Headings, emphasis, safe underline using `++underlined text++`, links, blockquotes, inline code, fenced code blocks, ordered lists, unordered lists, nested lists, task lists, and tables are supported. Unsafe HTML and scriptable input are rejected before saving.

The editor toolbar provides compact controls for bold, italic, underline, headings, unordered lists, ordered lists, checklists, links, wiki links, and Preview. Each toolbar control has a tooltip and accessible label. The toolbar stays above the Body editor and Preview area when Preview is toggled.

In the note body editor, Tab indents the current line or selected lines and Shift+Tab removes one indent level. Indented list markers render as nested lists, so a list item under another list item can be created by indenting the child line before its `-`, `*`, `+`, checklist, or numbered marker.

Pressing Enter after a predictable list item continues the same list style. Pressing Enter on an empty list marker clears that marker so you can keep writing normal text. Single newlines stay visible in Preview and in the saved note view, while blank lines still separate paragraphs. The Preview button renders the draft through the same safe Markdown path used after saving, so nested lists, task lists, tables, code blocks, links, and line breaks should match the saved note view.

Wiki-style link text can be detected as note metadata, but detection does not auto-create notes and does not reveal private or secure notes to users who cannot read them.
