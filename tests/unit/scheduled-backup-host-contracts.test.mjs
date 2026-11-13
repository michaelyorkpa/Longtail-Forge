import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Source contracts between the durability patch's host scripts, which run on different machines and
// cannot call one another: the posture the scheduled backup verifies is the deploy helper's, every
// Docker call it makes has a time limit, and each time limit fits inside the one that contains it.

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

/** The lines that are not comments. @param {string} source */
function codeLines(source) {
  return source.split("\n").filter((line) => !/^\s*#/.test(line));
}

describe("the scheduled backup's container checks", () => {
  it("verifies the posture by exactly the deploy helper's predicate", () => {
    const scheduled = posturePredicate(read(SCHEDULED));
    expect(scheduled).toBe(posturePredicate(read(DEPLOY)));
    for (const clause of ['.Config.User == "10001:10001"', ".HostConfig.ReadonlyRootfs == true", '.HostConfig.CapDrop == ["ALL"]', '.[0].HostIp == "127.0.0.1"']) {
      expect(scheduled).toContain(clause);
    }
  });

  it("starts the stopped container as itself, and never recreates one", () => {
    const source = read(SCHEDULED);
    expect(source).toContain("compose_within \"$START_LIMIT\" start longtail-forge");
    expect(source).not.toMatch(/\bup -d\b|--force-recreate/);
  });

  it("runs both backup steps without pulling, under this attempt's own name and label, and pulls nowhere else", () => {
    const source = read(SCHEDULED);
    for (const step of ["create", "inspect"]) {
      expect(occurrences(source, `work_step run --rm --no-deps --pull never --name "$STEP_PREFIX-${step}" --label "$STEP_LABEL=$OPERATION_ID" `)).toBe(1);
    }
    expect([...source.matchAll(/--pull\b/g)]).toHaveLength(2);
  });
});

describe("the shipped schedule", () => {
  it("names no copy hook, so the first manual run needs nothing the off-server setup installs later", () => {
    const lines = codeLines(read("docs/longtail-forge-scheduled-backup.env.example")).filter((line) => line.trim() !== "");
    expect(lines).toEqual(["LTF_SCHEDULED_BACKUP_ENABLED=true", "LTF_SCHEDULED_BACKUP_COPY_HOOK="]);
  });
});

describe("the scheduled backup's Docker calls", () => {
  const scheduled = read(SCHEDULED);

  it("gives every Docker call a time limit", () => {
    // Every line that runs `docker` itself, apart from the list of required commands; the query and
    // Compose wrappers are among them.
    const calls = codeLines(scheduled).filter((line) => /(^|[^\w-])docker\s/.test(line) && !/^\s*for command in /.test(line));
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const line of calls) expect(line, line).toMatch(/\bwithin "\$[A-Za-z_]+" docker /);
    expect(occurrences(scheduled, "within \"$QUERY_LIMIT\" docker \"$@\"")).toBe(1);
    expect(scheduled).not.toMatch(/^compose\(\)/m);
  });

  it("gives every request to the restarted release a time limit", () => {
    const requests = codeLines(scheduled).filter((line) => /\bcurl --fail /.test(line));
    expect(requests).toHaveLength(3);
    for (const line of requests) expect(line, line).toMatch(/\bwithin "\$REQUEST_LIMIT" curl --fail --silent --show-error --max-time "\$REQUEST_LIMIT" /);
  });
});

describe("the scheduled backup's time limits", () => {
  const scheduled = read(SCHEDULED);
  const query = constant(scheduled, "QUERY_LIMIT");
  const preflight = constant(scheduled, "PREFLIGHT_LIMIT");
  const backupLimit = constant(scheduled, "BACKUP_LIMIT");
  const recoveryLimit = constant(scheduled, "RECOVERY_LIMIT");
  const stopReserve = constant(scheduled, "STOP_RESERVE");
  const copyLimit = constant(scheduled, "COPY_LIMIT");
  // Each call's `timeout` allows five seconds more to kill it.
  const KILL = 5;

  it("gives the run's backstop room for the checks, the backup, its recovery, and the copy", () => {
    expect(occurrences(scheduled, "readonly RUN_LIMIT=$((PREFLIGHT_LIMIT + BACKUP_LIMIT + RECOVERY_LIMIT + COPY_LIMIT + 600))\n")).toBe(1);
    expect(occurrences(scheduled, "setsid timeout --kill-after=60 \"$RUN_LIMIT\" bash \"$SELF\" backup")).toBe(1);
    const runLimit = preflight + backupLimit + recoveryLimit + copyLimit + 600;
    const service = read(SERVICE).match(/^TimeoutStartSec=(\d+)h$/m);
    expect(service, "the service states its limit in hours").not.toBeNull();
    expect(Number(service?.[1]) * 3600).toBeGreaterThan(runLimit + 60);
  });

  it("keeps room in recovery's own limit for its restart, and for proving a stop", () => {
    const remove = constant(scheduled, "REMOVE_LIMIT");
    const start = constant(scheduled, "START_LIMIT");
    const health = constant(scheduled, "HEALTH_LIMIT");
    const request = constant(scheduled, "REQUEST_LIMIT");
    const stop = constant(scheduled, "STOP_LIMIT");
    // Two listings of this attempt's step containers and the removal of its two, the start, the listing
    // of the started container, the health wait, the posture query, and three requests to each of two
    // origins.
    const restart = 2 * (query + KILL) + 2 * (remove + KILL) + (start + KILL) + (query + KILL) + (health + KILL) + (query + KILL) + 6 * (request + KILL);
    expect(restart).toBeLessThanOrEqual(recoveryLimit - stopReserve);
    // Compose's stop, a listing of the running service, the kill, and the listing again.
    expect((stop + KILL) + 3 * (query + KILL)).toBeLessThanOrEqual(stopReserve);
    // Both restarts set their deadline from those constants, and the stop from the reserve.
    expect(occurrences(scheduled, "DEADLINE=$((SECONDS + RECOVERY_LIMIT - STOP_RESERVE))")).toBe(2);
    expect(occurrences(scheduled, "DEADLINE=$((SECONDS + STOP_RESERVE))")).toBe(1);
    expect(occurrences(scheduled, "timeout --kill-after=5 \"$limit\" \"$@\"")).toBe(1);
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
