import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";


/**
 * The shared execution and restoration half of this estate's break harnesses.
 *
 * **Only the parts every harness got wrong are shared.** Case tables, anchors and the behavioural
 * assertions they aim at stay in the harness that owns them, because those are the checkpoint's
 * own claims. What moved here is the machinery three harnesses had written three different ways:
 * launching the suite, bounding it, telling a refusal apart from a crash, and putting the source
 * back. `0.33.33.44.33` lost forty minutes to an unbounded run, and two harnesses still counted
 * any non-zero exit as coverage - which credits a runner that failed to start.
 *
 * @typedef {"assertion" | "nontermination" | "survivor" | "invalid-syntax" | "incidental-error" | "infrastructure"} MutationOutcome
 *
 * `assertion` and `nontermination` are the only outcomes that count as behavioural detection.
 * `incidental-error` is a suite that failed without an assertion failing - a crash the mutation
 * caused somewhere the test never got to check, which is not proof the test would have noticed.
 * `infrastructure` is the runner itself failing, and never counts for anything.
 */

const CAUGHT = new Set(["assertion", "nontermination"]);

/** @param {Buffer} bytes */
export const hashBytes = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * A retained, hash-verified copy of the source, written **before** the first mutation.
 *
 * It is kept after a successful campaign on purpose: `0.33.33.44.33` had to reconstruct a mutated
 * file by reasoning backwards from a previous run's printed hash, because the only copy was the
 * working tree the campaign was busy rewriting.
 * @param {string} sourcePath
 */
export function createSourceBackup(sourcePath) {
  const original = readFileSync(sourcePath);
  const sha = hashBytes(original);
  const backupPath = join(mkdtempSync(join(tmpdir(), "ltf-breaks-")), basename(sourcePath));
  writeFileSync(backupPath, original);
  if (hashBytes(readFileSync(backupPath)) !== sha) {
    throw new Error(`Durable backup of ${sourcePath} did not verify; refusing to mutate anything.`);
  }
  return {
    original,
    sha,
    backupPath,
    text: () => original.toString("utf8"),
    /** Put the source back and prove it, byte for byte. */
    restore: () => {
      writeFileSync(sourcePath, original);
      const restored = hashBytes(readFileSync(sourcePath));
      if (restored !== sha) {
        throw new Error(`Restore of ${sourcePath} did not verify: ${restored} != ${sha}`);
      }
    },
    verifyBackup: () => {
      if (hashBytes(readFileSync(backupPath)) !== sha) {
        throw new Error(`Retained backup ${backupPath} no longer matches the source it was taken from.`);
      }
    },
  };
}

/**
 * Run Node directly - **never through a shell**.
 *
 * A shell between this process and the child means the timeout kills the shell and leaves the
 * real worker running, which is exactly how a campaign wedges. The suite is asked for threads and
 * a single worker for the same reason: its parallelism then lives inside the process this timeout
 * can actually terminate.
 * @param {readonly string[]} args
 * @param {{ timeoutMs: number, maxBuffer?: number }} options
 */
export function runBoundedNode(args, { timeoutMs, maxBuffer = 8 * 1024 * 1024 }) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, [...args], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout: timeoutMs,
    killSignal: "SIGKILL",
    maxBuffer,
  });
  return { ...result, elapsedMs: Date.now() - startedAt, timeoutMs };
}

/** @param {{ error?: Error | null, signal?: string | null }} result */
function timedOut(result) {
  if (result.signal === "SIGKILL") return true;
  return result.error instanceof Error && "code" in result.error && result.error.code === "ETIMEDOUT";
}

/**
 * Decide what a finished suite run actually proved.
 *
 * **A non-zero exit is not evidence on its own.** Vitest exits 1 when a test fails, when it cannot
 * import a file, when it finds no tests at all, and when it dies of something unrelated. Reading
 * its own summary line is what separates "the suite ran and refused the mutation" from "the runner
 * never got far enough to have an opinion".
 * @param {{ status: number | null, signal?: string | null, error?: Error | null, stdout?: string, stderr?: string }} result
 * @returns {{ outcome: MutationOutcome, detail: string }}
 */
export function classifySuiteRun(result) {
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.error instanceof Error && "code" in result.error && result.error.code === "ENOBUFS") {
    return { outcome: "infrastructure", detail: "suite output exceeded the runner's buffer" };
  }
  if (timedOut(result)) {
    return { outcome: "nontermination", detail: "suite did not terminate within its bound" };
  }
  if (result.signal) {
    return { outcome: "infrastructure", detail: `suite process was killed by ${result.signal}` };
  }
  if (result.error instanceof Error) {
    return { outcome: "infrastructure", detail: `suite could not be launched: ${result.error.message}` };
  }
  if (/No test files found/i.test(output)) {
    return { outcome: "infrastructure", detail: "no test files matched" };
  }
  const failed = /Tests\s+\d+ failed/.test(output) || /Test Files\s+\d+ failed/.test(output);
  const passed = /Tests\s+\d+ passed/.test(output) || /Test Files\s+\d+ passed/.test(output);
  if (result.status === 0) {
    return passed
      ? { outcome: "survivor", detail: "suite passed with the mutation in place" }
      : { outcome: "infrastructure", detail: "suite exited 0 without reporting any test result" };
  }
  if (!failed) {
    return { outcome: "infrastructure", detail: `suite exited ${result.status} without reporting a test result` };
  }
  return /AssertionError/.test(output)
    ? { outcome: "assertion", detail: "an assertion refused the mutation" }
    : { outcome: "incidental-error", detail: "the suite failed without an assertion failing" };
}

// A `file://` URL, not a path: an absolute Windows path is not a valid ESM specifier.
const SOURCE_SCAN = new URL("./source-scan.mjs", import.meta.url).href;

/**
 * Invoke lifted functions directly, under a short bound.
 *
 * **This exists for mutations that break a page by not returning.** Waiting out a whole-suite
 * timeout to learn that a removed loop guard loops is slow and tells you less: the probe names the
 * call that hangs. A probe that returns proves nothing on its own, so the suite still runs.
 * @param {{ sourcePath: string, lift: readonly string[], invoke: string, setup?: string, timeoutMs: number }} probe
 *   `setup` runs in the context first, for the state a lifted function closes over.
 */
export function runBoundedProbe({ sourcePath, lift, invoke, setup = "", timeoutMs }) {
  const script = [
    'import vm from "node:vm";',
    'import { readFileSync } from "node:fs";',
    `import { extractFunctionBlock } from ${JSON.stringify(SOURCE_SCAN)};`,
    `const source = readFileSync(${JSON.stringify(sourcePath)}, "utf8");`,
    "const context = vm.createContext({ console });",
    `if (${JSON.stringify(setup)}) vm.runInContext(${JSON.stringify(setup)}, context);`,
    `for (const name of ${JSON.stringify([...lift])}) vm.runInContext(extractFunctionBlock(source, name), context);`,
    `vm.runInContext(${JSON.stringify(invoke)}, context);`,
  ].join("\n");
  const result = runBoundedNode(["--input-type=module", "--eval", script], { timeoutMs });
  if (timedOut(result)) {
    return { outcome: /** @type {MutationOutcome} */ ("nontermination"), detail: `probe did not return within ${timeoutMs}ms`, elapsedMs: result.elapsedMs };
  }
  if (result.status === 0) {
    return { outcome: /** @type {MutationOutcome | null} */ (null), detail: "probe returned", elapsedMs: result.elapsedMs };
  }
  return { outcome: /** @type {MutationOutcome} */ ("infrastructure"), detail: `probe failed to run: ${(result.stderr || "").trim().split("\n").at(-1)}`, elapsedMs: result.elapsedMs };
}

/**
 * @typedef {object} MutationCase
 * @property {string} name
 * @property {string} find text that must appear exactly once in the source
 * @property {string} replace
 * @property {{ lift: readonly string[], invoke: string, setup?: string, timeoutMs?: number }} [probe]
 *   a bounded direct invocation for a mutation expected to hang, run instead of waiting out the
 *   suite bound
 *
 * @typedef {object} CampaignOptions
 * @property {string} sourcePath
 * @property {readonly string[]} suites
 * @property {readonly MutationCase[]} cases
 * @property {number} [suiteTimeoutMs]
 * @property {number} [syntaxTimeoutMs]
 * @property {number} [probeTimeoutMs]
 * @property {number} [campaignTimeoutMs] wall-clock bound for the whole campaign
 */

/**
 * Run a break campaign: verify a backup, prove the anchors, prove the baseline, then mutate.
 *
 * Every mutation is restored and hash-verified in its own `finally`, and again when the campaign
 * ends, so an interrupted run never leaves a mutated file behind.
 * @param {CampaignOptions} options
 */
export function runMutationCampaign(options) {
  const {
    sourcePath, suites, cases,
    suiteTimeoutMs = 60000,
    syntaxTimeoutMs = 10000,
    probeTimeoutMs = 5000,
    campaignTimeoutMs = 30 * 60000,
  } = options;

  const backup = createSourceBackup(sourcePath);
  const source = backup.text();
  console.log(`Retained source backup: ${backup.backupPath}`);

  // Every anchor is proved before anything is written, so a duplicate or missing anchor cannot
  // surface fifty cases into a campaign that has already spent ten minutes.
  for (const testCase of cases) {
    const occurrences = source.split(testCase.find).length - 1;
    if (occurrences !== 1) {
      throw new Error(`Anchor for "${testCase.name}" appears ${occurrences} times; it must appear exactly once.`);
    }
  }

  const suiteArgs = ["node_modules/vitest/vitest.mjs", "run", "--pool=threads", "--maxWorkers=1", ...suites];
  const runSuite = () => runBoundedNode(suiteArgs, { timeoutMs: suiteTimeoutMs });

  const startedAt = Date.now();
  /** @type {{ name: string, outcome: MutationOutcome, detail: string, elapsedMs: number }[]} */
  const results = [];

  try {
    const baseline = runSuite();
    const baselineOutcome = classifySuiteRun(baseline);
    if (baselineOutcome.outcome !== "survivor") {
      throw new Error(`Unmodified baseline is not green (${baselineOutcome.detail}); no mutation result would mean anything.\n${baseline.stdout}${baseline.stderr}`);
    }
    console.log(`Baseline green in ${baseline.elapsedMs}ms; ${cases.length} cases to run.`);

    for (const [index, testCase] of cases.entries()) {
      if (Date.now() - startedAt > campaignTimeoutMs) {
        throw new Error(`Campaign exceeded its ${campaignTimeoutMs}ms bound at case ${index + 1} of ${cases.length}.`);
      }
      const caseStartedAt = Date.now();
      /** @type {{ outcome: MutationOutcome, detail: string }} */
      let verdict;
      try {
        writeFileSync(sourcePath, source.replace(testCase.find, testCase.replace), "utf8");
        const syntax = runBoundedNode(["--check", sourcePath], { timeoutMs: syntaxTimeoutMs });
        if (syntax.status !== 0) {
          verdict = { outcome: "invalid-syntax", detail: "a mutation the parser refuses is not coverage" };
        } else {
          const probe = testCase.probe
            ? runBoundedProbe({ sourcePath, ...testCase.probe, timeoutMs: testCase.probe.timeoutMs ?? probeTimeoutMs })
            : null;
          verdict = probe?.outcome
            ? { outcome: probe.outcome, detail: probe.detail }
            : classifySuiteRun(runSuite());
        }
      } finally {
        backup.restore();
      }
      const elapsedMs = Date.now() - caseStartedAt;
      results.push({ name: testCase.name, ...verdict, elapsedMs });
      const mark = CAUGHT.has(verdict.outcome) ? "CAUGHT" : verdict.outcome.toUpperCase();
      console.log(`[${index + 1}/${cases.length}] ${mark} (${verdict.detail}) in ${elapsedMs}ms: ${testCase.name}`);
    }
  } finally {
    backup.restore();
    backup.verifyBackup();
    console.log(`Restored SHA-256 ${backup.sha}`);
  }

  const caught = results.filter((entry) => CAUGHT.has(entry.outcome));
  const survivors = results.filter((entry) => entry.outcome === "survivor");
  const infrastructure = results.filter((entry) => entry.outcome === "infrastructure");
  const unusable = results.filter((entry) => entry.outcome === "invalid-syntax" || entry.outcome === "incidental-error");
  const totalMs = Date.now() - startedAt;
  console.log(`${caught.length}/${cases.length} caught; ${survivors.length} survivors; ${unusable.length} unusable; ${infrastructure.length} infrastructure; ${totalMs}ms total.`);

  if (infrastructure.length > 0) {
    throw new Error(`The runner failed on ${infrastructure.length} case(s), which is never behavioural detection: ${infrastructure.map((entry) => `${entry.name} - ${entry.detail}`).join("; ")}`);
  }
  return { results, caught, survivors, unusable, totalMs };
}
