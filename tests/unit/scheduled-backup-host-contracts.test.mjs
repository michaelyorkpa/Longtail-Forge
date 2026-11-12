import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Source contracts between the durability patch's host scripts, which run on different machines and
// cannot call one another: the posture the scheduled backup verifies is the deploy helper's, and each
// time limit fits inside the one that contains it.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCHEDULED = "scripts/release/longtail-forge-scheduled-backup-host.example";
const DEPLOY = "scripts/release/longtail-forge-compose-deploy-host.example";
const SERVICE = "scripts/release/longtail-forge-scheduled-backup.service.example";
const HOOK = "scripts/release/longtail-forge-offsite-copy-host.example";
const RECEIVER = "scripts/release/longtail-forge-offsite-receive-host.example";

/** @param {string} relative */
function read(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), "utf8");
}

/** @param {string} source @param {string} text */
function occurrences(source, text) {
  return source.split(text).length - 1;
}

/** The jq program a helper runs over `docker inspect` of its application container. @param {string} source */
function posturePredicate(source) {
  const opening = "| jq -e --arg image \"$reference\" --arg backup \"$BACKUP_ROOT\" '\n";
  expect(occurrences(source, opening)).toBe(1);
  const start = source.indexOf(opening) + opening.length;
  const end = source.indexOf("\n  ' >/dev/null", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

/** A `readonly NAME=<integer>` constant. @param {string} source @param {string} name */
function constant(source, name) {
  const matches = [...source.matchAll(new RegExp(`^readonly ${name}=(\\d+)$`, "gm"))];
  expect(matches.length, `${name} must be defined once as an integer`).toBe(1);
  return Number(matches[0]?.[1]);
}

describe("the scheduled backup's container checks", () => {
  it("verifies the posture by exactly the deploy helper's predicate", () => {
    const scheduled = posturePredicate(read(SCHEDULED));
    expect(scheduled).toBe(posturePredicate(read(DEPLOY)));
    for (const clause of ['.Config.User == "10001:10001"', ".HostConfig.ReadonlyRootfs == true", '.HostConfig.CapDrop == ["ALL"]', '.[0].HostIp == "127.0.0.1"']) {
      expect(scheduled).toContain(clause);
    }
  });

  it("starts the stopped container as itself, and never recreates or pulls one", () => {
    const source = read(SCHEDULED);
    expect(source).toContain("compose_within \"$START_LIMIT\" start longtail-forge");
    expect(source).not.toMatch(/\bup -d\b|--force-recreate|--pull\b/);
  });
});

describe("the scheduled backup's time limits", () => {
  const scheduled = read(SCHEDULED);
  const backupLimit = constant(scheduled, "BACKUP_LIMIT");
  const recoveryLimit = constant(scheduled, "RECOVERY_LIMIT");
  const copyLimit = constant(scheduled, "COPY_LIMIT");

  it("gives the run's backstop room for the backup, its recovery, and the copy", () => {
    expect(occurrences(scheduled, "readonly RUN_LIMIT=$((BACKUP_LIMIT + RECOVERY_LIMIT + COPY_LIMIT + 600))\n")).toBe(1);
    expect(occurrences(scheduled, "timeout --kill-after=60 \"$RUN_LIMIT\" bash \"$SELF\" backup")).toBe(1);
    const runLimit = backupLimit + recoveryLimit + copyLimit + 600;
    const service = read(SERVICE).match(/^TimeoutStartSec=(\d+)h$/m);
    expect(service, "the service states its limit in hours").not.toBeNull();
    expect(Number(service?.[1]) * 3600).toBeGreaterThan(runLimit + 60);
  });

  it("fits every recovery step inside recovery's own limit", () => {
    const remove = constant(scheduled, "REMOVE_LIMIT");
    const start = constant(scheduled, "START_LIMIT");
    const stop = constant(scheduled, "STOP_LIMIT");
    const health = Number(scheduled.match(/deadline=\$\(\(SECONDS \+ (\d+)\)\)/)?.[1]);
    const requests = [...scheduled.matchAll(/curl --fail --silent --show-error --max-time (\d+) "\$origin/g)].map((match) => Number(match[1]));
    expect(requests).toHaveLength(3);
    // Two step containers removed, the start, the health wait, three requests to each of two origins,
    // and the stop of a release that did not verify; each timeout allows ten seconds more to kill.
    const total = 2 * (remove + 10) + (start + 10) + health + 2 * requests.reduce((sum, seconds) => sum + seconds, 0) + (stop + 10);
    expect(total).toBeLessThanOrEqual(recoveryLimit);
  });

  it("ends the receipt at the destination when the sender's own transfer ends, inside the time the backup gives the hook", () => {
    const transferLimit = constant(read(HOOK), "TRANSFER_LIMIT");
    expect(constant(read(RECEIVER), "RECEIVE_LIMIT")).toBe(transferLimit);
    expect(transferLimit).toBeLessThan(copyLimit);
  });
});

describe("the receiver's resource bounds", () => {
  const receiver = read(RECEIVER);

  it("reads the copy under its time limit", () => {
    expect(occurrences(receiver, "timeout --kill-after=5 \"$RECEIVE_LIMIT\" head -c \"$((DECLARED_BYTES + 1))\" > \"$INCOMING\"")).toBe(1);
  });

  it("compares only the age header's own bytes, never a whole first line", () => {
    expect(receiver).toContain("cmp --silent --bytes=\"$(( ${#AGE_HEADER} + 1 ))\" - \"$INCOMING\"");
    expect(receiver).not.toMatch(/head -n|read -r[^\n]*INCOMING|\$\(cat /);
  });
});
