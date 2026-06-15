Note bodies use Markdown as the editable format. Headings, emphasis, links, blockquotes, inline code, fenced code blocks, ordered lists, unordered lists, nested lists, task lists, and tables are supported. Unsafe HTML and scriptable input are rejected before saving.

In the note body editor, Tab indents the current line or selected lines and Shift+Tab removes one indent level. Indented list markers render as nested lists, so a list item under another list item can be created by indenting the child line before its `-`, `*`, `+`, checklist, or numbered marker.

Pressing Enter after a predictable list item continues the same list style. Pressing Enter on an empty list marker clears that marker so you can keep writing normal text. The Preview button renders the draft through the same safe Markdown path used after saving, so nested lists, task lists, tables, code blocks, and links should match the saved note view.

Wiki-style link text can be detected as note metadata, but detection does not auto-create notes and does not reveal private or secure notes to users who cannot read them.
