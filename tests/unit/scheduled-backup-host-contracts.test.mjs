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

  it("stops and starts the container as itself, by its ID with Docker alone, and never recreates one", () => {
    const source = read(SCHEDULED);
    expect(occurrences(source, "within \"$START_LIMIT\" docker start \"$CONTAINER\" >/dev/null || return 1")).toBe(1);
    expect(occurrences(source, "\nwork_step stop \"$CONTAINER\"\n")).toBe(1);
    expect(occurrences(source, "within \"$STOP_LIMIT\" docker stop \"$id\" >/dev/null 2>&1")).toBe(1);
    expect(occurrences(source, "docker_query kill \"$id\" >/dev/null 2>&1")).toBe(1);
    expect(source).not.toMatch(/\bup -d\b|--force-recreate/);
    // Compose's own lifecycle commands run the configuration's hooks, and copy its content in.
    expect(codeLines(source).filter((line) => /\bcompose_(within|query)\b[^\n]*\b(start|stop|kill|restart|up|run|create)\b/.test(line))).toEqual([]);
  });

  it("runs both backup steps in one profile it names whole, from the running container's image and volume, never through Compose", () => {
    const source = read(SCHEDULED);
    expect(occurrences(source, [
      "  work_step run --rm --pull never --name \"$STEP_PREFIX-$role\" --label \"$STEP_LABEL=$OPERATION_ID\" \\",
      "    --network none --user 10001:10001 --read-only --cap-drop ALL --security-opt no-new-privileges:true --init \\",
      "    --log-driver local --tmpfs \"/tmp:$STEP_TMPFS\" \\",
      "    --mount \"type=volume,source=$DATA_VOLUME,target=$DATA_ROOT,volume-nocopy\" \\",
      "    --mount \"type=bind,source=$BACKUP_ROOT,target=$BACKUP_CONTAINER_ROOT\" \\",
      "    \"${KEY_MOUNT[@]}\" \"${STEP_ENV[@]}\" \\",
      "    --workdir /opt/longtail-forge --entrypoint node \"$IMAGE_ID\" /opt/longtail-forge/scripts/backup.mjs \"$role\" \"$@\"",
    ].join("\n"))).toBe(1);
    for (const step of ["create", "inspect"]) expect(codeLines(source).filter((line) => line.startsWith(`backup_step ${step} `))).toHaveLength(1);
    // The profile is the only place anything runs or pulls, and nothing is created by Compose.
    expect([...source.matchAll(/--pull\b/g)]).toHaveLength(1);
    expect(codeLines(source).filter((line) => /\bwork_step run\b/.test(line))).toHaveLength(1);
    expect(source).not.toMatch(/\brun --rm --no-deps\b|--volumes-from|--privileged/);
  });

  it("labels each step container as the deploy helper looks for it", () => {
    const label = "'longtail-forge.scheduled-backup.operation'";
    expect(occurrences(read(SCHEDULED), `readonly STEP_LABEL=${label}\n`)).toBe(1);
    expect(occurrences(read(DEPLOY), `readonly SCHEDULED_STEP_LABEL=${label}\n`)).toBe(1);
    expect(occurrences(read(DEPLOY), "docker ps --all --quiet --filter \"label=$SCHEDULED_STEP_LABEL\"")).toBe(1);
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
    // The listing of the service's running container, its stop, the listing again, its kill, and the
    // listing once more.
    expect((stop + KILL) + 4 * (query + KILL)).toBeLessThanOrEqual(stopReserve);
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
