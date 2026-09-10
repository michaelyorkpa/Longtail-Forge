import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extractFunctionBlock } from "../../scripts/test-support/source-scan.mjs";

// Run explicitly, with no server or other verification reading this source concurrently.
// This harness is not a standing gate; it proves the checkpoint's new behavioral assertions.
const sourcePath = "public/js/notes.js";
const original = Buffer.from(readFileSync(sourcePath));
const source = original.toString("utf8");
/** @param {Buffer} bytes */
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const beforeHash = hash(original);
const cases = [
  [
    "absent control required",
    "writeNoteNotificationFollowFields",
    "if (!notificationToggle)",
    "if (false)"
  ],
  [
    "unsaved identity invented",
    "writeNoteNotificationFollowFields",
    "note?.note_id || \"\"",
    "note?.note_id || \"invented\""
  ],
  [
    "secure note offered",
    "writeNoteNotificationFollowFields",
    "!isSecureNote(note)",
    "true"
  ],
  [
    "optional root required",
    "writeNoteNotificationFollowFields",
    "window.LongtailForge?.notificationSubscriptions",
    "window.LongtailForge.notificationSubscriptions"
  ],
  [
    "missing capability offered",
    "writeNoteNotificationFollowFields",
    "&& subscriptions?.noteTarget",
    ""
  ],
  [
    "previous following retained during read",
    "writeNoteNotificationFollowFields",
    "writeNoteNotificationFollowState(false);",
    "writeNoteNotificationFollowState(true);"
  ],
  [
    "hidden control shown",
    "writeNoteNotificationFollowFields",
    "notificationToggle.hidden = !canToggleNotifications;",
    "notificationToggle.hidden = false;"
  ],
  [
    "available control hidden",
    "writeNoteNotificationFollowFields",
    "notificationToggle.hidden = !canToggleNotifications;",
    "notificationToggle.hidden = true;"
  ],
  [
    "unavailable control enabled",
    "writeNoteNotificationFollowFields",
    "notificationToggle.disabled = !canToggleNotifications;",
    "notificationToggle.disabled = false;"
  ],
  [
    "unsupported read attempted",
    "writeNoteNotificationFollowFields",
    "if (!subscriptions || !canToggleNotifications)",
    "if (false)"
  ],
  [
    "unsaved hint omitted",
    "writeNoteNotificationFollowFields",
    "\"Save the note before following notifications\"",
    "\"\""
  ],
  [
    "unavailable hint omitted",
    "writeNoteNotificationFollowFields",
    "\"Note notifications unavailable\"",
    "\"\""
  ],
  [
    "hidden accessible label omitted",
    "writeNoteNotificationFollowFields",
    "notificationToggle.setAttribute(\"aria-label\", notificationToggle.title);",
    ";"
  ],
  [
    "pending control enabled",
    "writeNoteNotificationFollowFields",
    "notificationToggle.disabled = true;",
    "notificationToggle.disabled = false;"
  ],
  [
    "checking title omitted",
    "writeNoteNotificationFollowFields",
    "notificationToggle.title = \"Checking notification follow state\";",
    "notificationToggle.title = \"\";"
  ],
  [
    "checking accessible label omitted",
    "writeNoteNotificationFollowFields",
    "notificationToggle.setAttribute(\"aria-label\", \"Checking notification follow state\");",
    ";"
  ],
  [
    "wrong note status queried",
    "writeNoteNotificationFollowFields",
    "subscriptions.noteTarget(noteId)",
    "subscriptions.noteTarget(\"other-note\")"
  ],
  [
    "checked result inverted",
    "writeNoteNotificationFollowFields",
    "result.isFollowing === true",
    "result.isFollowing !== true"
  ],
  [
    "read unavailable title lost",
    "writeNoteNotificationFollowFields",
    "notificationToggle.title = \"Notification follow state unavailable\";",
    "notificationToggle.title = \"\";"
  ],
  [
    "read unavailable accessible label lost",
    "writeNoteNotificationFollowFields",
    "notificationToggle.setAttribute(\"aria-label\", \"Notification follow state unavailable\");",
    ";"
  ],
  [
    "state requires absent control",
    "writeNoteNotificationFollowState",
    "if (!notificationToggle)",
    "if (false)"
  ],
  [
    "following label inverted",
    "writeNoteNotificationFollowState",
    "isFollowing ? \"Unfollow note notifications\" : \"Follow note notifications\"",
    "isFollowing ? \"Follow note notifications\" : \"Unfollow note notifications\""
  ],
  [
    "dataset state inverted",
    "writeNoteNotificationFollowState",
    "notificationToggle.dataset.isFollowing = String(isFollowing);",
    "notificationToggle.dataset.isFollowing = String(!isFollowing);"
  ],
  [
    "following class omitted",
    "writeNoteNotificationFollowState",
    "notificationToggle.classList.toggle(\"is-following\", isFollowing);",
    ";"
  ],
  [
    "resolved control remains disabled",
    "writeNoteNotificationFollowState",
    "notificationToggle.disabled = false;",
    "notificationToggle.disabled = true;"
  ],
  [
    "state title omitted",
    "writeNoteNotificationFollowState",
    "notificationToggle.title = label;",
    ";"
  ],
  [
    "state accessible label omitted",
    "writeNoteNotificationFollowState",
    "notificationToggle.setAttribute(\"aria-label\", label);",
    ";"
  ],
  [
    "pressed state inverted",
    "writeNoteNotificationFollowState",
    "notificationToggle.setAttribute(\"aria-pressed\", String(isFollowing));",
    "notificationToggle.setAttribute(\"aria-pressed\", String(!isFollowing));"
  ],
  [
    "wrong DOM subtype accepted",
    "cacheNotesElements",
    "notificationToggle = findNotesControl(\"[data-note-notification-toggle]\", HTMLButtonElement);",
    "notificationToggle = document.querySelector(\"[data-note-notification-toggle]\");"
  ],
  [
    "valid button discarded",
    "cacheNotesElements",
    "notificationToggle = findNotesControl(\"[data-note-notification-toggle]\", HTMLButtonElement);",
    "notificationToggle = null;"
  ],
  [
    "toggle result not applied",
    "toggleNoteNotificationFollow",
    "writeNoteNotificationFollowState(result.isFollowing === true);",
    ";"
  ],
  [
    "failed toggle rollback lost",
    "toggleNoteNotificationFollow",
    "writeNoteNotificationFollowState(isFollowing);",
    "writeNoteNotificationFollowState(!isFollowing);"
  ],
  [
    "reset leaves toggle visible",
    "resetNoteNotificationFollowFields",
    "notificationToggle.hidden = true;",
    "notificationToggle.hidden = false;"
  ],
  [
    "reset leaves toggle enabled",
    "resetNoteNotificationFollowFields",
    "notificationToggle.disabled = true;",
    "notificationToggle.disabled = false;"
  ]
];

let caught = 0;
/** @type {string[]} */
const inert = [];
try {
  const baseline = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-follow-toggle.test.mjs"],
    { encoding: "utf8", windowsHide: true });
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  for (const [label, name, from, to] of cases) {
    assert.ok(label && name && from && to !== undefined);
    const region = name === "types" ? source : extractFunctionBlock(source, name);
    assert.ok(region.includes(from), `${label}: mutation must hit its intended statement`);
    const broken = source.replace(region, region.replaceAll(from, to));
    try {
      writeFileSync(sourcePath, broken);
      const syntax = spawnSync(process.execPath, ["--check", sourcePath], { encoding: "utf8", windowsHide: true });
      assert.equal(syntax.status, 0, `${label}: syntax failure is not a caught break\n${syntax.stderr}`);
      const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/unit/notes-follow-toggle.test.mjs"],
        { encoding: "utf8", windowsHide: true });
      const output = result.stdout + result.stderr;
      if (result.status === 0) {
        inert.push(label);
        console.log(`INERT: ${label} - re-aim before claiming coverage`);
      } else {
        assert.equal(result.status, 1, output);
        assert.match(output, /AssertionError/, `${label}: infrastructure or runtime crash is not assertion coverage\n${output}`);
        caught += 1;
        console.log(`CAUGHT (syntax valid, assertion failed): ${label}`);
      }
    } finally {
      writeFileSync(sourcePath, original);
      assert.equal(hash(readFileSync(sourcePath)), beforeHash, `${label}: byte restoration failed`);
    }
  }
} finally {
  writeFileSync(sourcePath, original);
  assert.equal(hash(readFileSync(sourcePath)), beforeHash, "final byte restoration failed");
  console.log(`Restored SHA-256 ${beforeHash}`);
}
console.log(`${caught}/${cases.length} caught; ${inert.length} inert.`);
assert.equal(inert.length, 0, `Re-aim inert breaks: ${inert.join(", ")}`);
