import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import { collectBrowserPublicationInventory } from "./browser-publication-inventory.mjs";
import { NAMESPACE, createNamespaceResolver, isNode } from "./browser-namespace-resolver.mjs";

/**
 * What each browser diagnostic is *about*, derived from the diagnostics of one compiler run
 * and the tree that run read.
 *
 * **The estate's numbers had no in-repo producer.** The canonical families, the
 * `0.33.33.39`-`.44` budgets and the root-optionality classes were all computed by analysis
 * scripts living outside the repository that CI never ran, which is how a classification
 * defect survived three checkpoints without a single test failing. Two of those scripts were
 * later found stale in two different ways - one resolved bindings from whatever happened to be
 * checked out, and one carried a frozen set of declared members holding *one* member while the
 * declaration held thirty.
 *
 * Both defects have the same root, so this module has one rule: **if a durable number depends
 * on it, derive it.** Nothing here is carried. The declared members are read from the live
 * declaration, the published surfaces from the live publication inventory, and every identity
 * question goes to the `0.33.33.38.2.4.1` resolver against the same tree the caller's compiler
 * run just typechecked.
 *
 * **A diagnostic's code is not its cause**, which is the distinction the families exist to
 * keep. `TS18046` on a namespace member with no declaration is an index-signature symptom: the
 * member reads `unknown` because nothing named it, and it resolves the moment the member is
 * declared. Only a value still unshaped *after* its member is declared is a genuine trust
 * boundary. Reading the code alone merges those two, and reading the identifier spelling
 * instead of the binding merges more.
 *
 * @typedef {import("./browser-namespace-resolver.mjs").AstNode} AstNode
 * @typedef {import("./browser-namespace-resolver.mjs").Scope} Scope
 *
 * @typedef {{ filePath: string, code: number, line: number, column: number, message: string }} LocatedDiagnostic
 *
 * @typedef {"params" | "state" | "dom" | "unknown" | "namespace" | "assorted"} CanonicalFamily
 *
 * @typedef {object} ClassifiedDiagnostic
 * @property {string} filePath
 * @property {number} code
 * @property {number} line
 * @property {number} column
 * @property {CanonicalFamily} family
 * @property {string | null} owner future checkpoint, for the three families they hold
 * @property {string | null} member the namespace member this reads, when one resolves
 *
 * @typedef {object} Classification
 * @property {ClassifiedDiagnostic[]} diagnostics
 * @property {Record<CanonicalFamily, number>} families
 * @property {number} total
 * @property {Record<string, {params: number, state: number, assorted: number, total: number}>} owners
 * @property {{adoptable: number, parked: number, parkedByMember: Record<string, number>, bareRoot: number}} rootOptionality
 * @property {string[]} declaredMembers
 * @property {string[]} knownMembers
 */

/**
 * The file-ownership map the roadmap publishes for `0.33.33.39` - `.44`. This is a roadmap
 * decision rather than a derived fact, so it is stated here and asserted against the family
 * totals rather than inferred from the tree.
 * @type {readonly [string, readonly string[]][]}
 */
const OWNER_FILES = Object.freeze([
  ["0.33.33.40 Notes", ["notes.js"]],
  ["0.33.33.41 Tasks and Task Dialog", [
    "tasks.js", "task-dialog.js", "tasks-dashboard.js", "task-resume-note-capture.js", "task-calendar.js",
  ]],
  ["0.33.33.42 Workbench", ["workbench.js"]],
  ["0.33.33.43 Lists, Files, Clients/Projects", [
    "lists.js", "files.js", "clients-projects.js", "files-settings.js", "lists-settings.js",
  ]],
]);

const SHARED_OWNER = "0.33.33.39 shared browser framework";
const REMAINDER_OWNER = "0.33.33.44 remaining page controllers";
const SHARED_ROOT_FILES = new Set(["app-shell-bootstrap.js", "navigation.js"]);

/** Families whose debt the `0.33.33.39` - `.44` owners hold. */
const OWNED_FAMILIES = new Set(["params", "state", "assorted"]);

const PARAM_CODES = new Set([7006, 7031, 7019, 7010]);
const STATE_CODES = new Set([7005, 7034, 7053, 7023, 7024, 7008]);
const DOM_TYPE = /^(Element|EventTarget|Node|HTML\w*Element|SVG\w*Element|ChildNode|ParentNode)$/;
const DOM_QUERY = /(document\.(getElementById|querySelector|querySelectorAll|createElement)|\.querySelector|\.closest\(|\.parentElement|\.firstElementChild|\.nextElementSibling|createElement\()/;
const IDENT_TAIL = /([A-Za-z_$][\w$]*)\s*$/;

/** @param {string} filePath */
function ownerOf(filePath) {
  const name = filePath.replace(/^public\/js\//, "");
  if (name.startsWith("shared/") || SHARED_ROOT_FILES.has(name)) return SHARED_OWNER;
  for (const [owner, files] of OWNER_FILES) if (files.includes(name)) return owner;
  return REMAINDER_OWNER;
}

/**
 * The members the live declaration names. **Read from the tree, never carried**: the defect
 * this replaces was a JSON snapshot holding one member against a declaration holding thirty.
 * @param {string} declarationSource
 * @returns {Set<string>}
 */
export function declaredNamespaceMembers(declarationSource) {
  const block = declarationSource.match(/export interface LongtailForgeBrowserNamespace \{([\s\S]*?)\n\}/);
  if (!block) throw new Error("Could not find LongtailForgeBrowserNamespace in the browser declaration");
  return new Set([...block[1].matchAll(/^ {2}(\w+)\??:/gm)].map((match) => match[1]));
}

/**
 * Line/column to absolute offset, one-based in and zero-based out, matching how the compiler
 * reports positions.
 * @param {string} text
 * @returns {(line: number, column: number) => number}
 */
function offsetIndex(text) {
  /** @type {number[]} */
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) if (text[index] === "\n") starts.push(index + 1);
  return (line, column) => (starts[line - 1] ?? 0) + (column - 1);
}

/**
 * Everything the classifier needs to know about one parsed file, indexed by position.
 *
 * `scopeAt` is what replaces asking whether an identifier is "spelled like the namespace".
 * `memberBindings` is the one bounded step beyond the resolver's own model: a `const` whose
 * **own initialiser** reads a namespace member is recorded as naming that member. That is the
 * same shape as classifying a root alias from its initialiser and stops at exactly the same
 * place - nothing is followed through reassignment, calls, or containers.
 * @param {AstNode} sourceFile @param {string} text
 * @param {ReturnType<typeof createNamespaceResolver>} resolver
 */
function indexFile(sourceFile, text, resolver) {
  const offsetOf = offsetIndex(text);
  /** @type {{start: number, end: number, scope: Scope}[]} */
  const spans = [];
  /** @type {Map<string, string>} */
  const memberBindings = new Map();
  /** @type {Map<number, {member: string | null, kind: string}>} */
  const atStart = new Map();
  /**
   * Property-name position to the identity of the expression it is read *from*.
   * `TS2339` is reported at the property, not at the receiver, so this is what answers
   * "does `LongtailForge?.workspaceContext?.workspaceId` read a namespace member" without
   * re-deriving the receiver from source text.
   * @type {Map<number, {member: string | null, kind: string}>}
   */
  const atPropertyName = new Map();

  resolver.walkScoped(sourceFile, (node, scope) => {
    const kind = resolver.kindOf(node);
    const start = node.getStart();
    spans.push({ start, end: start + node.getText().length, scope });
    if (kind === "PropertyAccessExpression" || kind === "ElementAccessExpression" || kind === "Identifier") {
      const identity = { member: resolver.namespaceMemberOf(node, scope), kind: resolver.classifyExpression(node, scope) };
      const existing = atStart.get(start);
      // Several expressions share one start - `window.LongtailForge`, the member read through
      // it, and the call around that. **The resolving one wins**, because the diagnostic is
      // about the read rooted there; keeping whichever was visited first lets the outermost
      // expression, which stops at a call and resolves to nothing, hide the member underneath.
      const resolves = Boolean(identity.member) || identity.kind === "namespace";
      const existingResolves = Boolean(existing?.member) || existing?.kind === "namespace";
      if (!existing || (resolves && !existingResolves)) atStart.set(start, identity);
    }
    if (kind === "PropertyAccessExpression") {
      const nameNode = node.getNamedChild("name");
      const base = node.getNamedChild("expression");
      if (isNode(nameNode) && isNode(base) && !atPropertyName.has(nameNode.getStart())) {
        atPropertyName.set(nameNode.getStart(), {
          member: resolver.namespaceMemberOf(base, scope),
          kind: resolver.classifyExpression(base, scope),
        });
      }
    }
    if (kind === "VariableDeclaration") {
      const nameNode = resolver.kindOf(node) === "VariableDeclaration" ? node.getNamedChild("name") : undefined;
      const initializer = node.getNamedChild("initializer");
      if (isNode(nameNode) && isNode(initializer) && resolver.kindOf(nameNode) === "Identifier") {
        // `const context = window.LongtailForge?.workspaceContext || {}` still names the member
        // it defaults away from, so the `|| {}` guard is peeled exactly as the resolver peels it
        // for a root alias. Nothing else about the initialiser is followed.
        let source = resolver.unwrapParentheses(initializer);
        if (resolver.kindOf(source) === "BinaryExpression") {
          const operator = source.getNamedChild("operatorToken");
          const left = source.getNamedChild("left");
          const right = source.getNamedChild("right");
          if (isNode(operator) && isNode(left) && isNode(right)
            && ["BarBarToken", "QuestionQuestionToken"].includes(resolver.kindOf(operator))
            && resolver.isEmptyObjectLiteral(resolver.unwrapParentheses(right))) {
            source = resolver.unwrapParentheses(left);
          }
        }
        const member = resolver.namespaceMemberOf(source, scope);
        const name = nameNode.getText().trim();
        if (member && !memberBindings.has(name)) memberBindings.set(name, member);
      }
    }
  });

  spans.sort((left, right) => (right.end - right.start) - (left.end - left.start));

  /** @param {number} offset */
  const scopeAt = (offset) => {
    /** @type {Scope | undefined} */
    let found;
    for (const span of spans) if (offset >= span.start && offset < span.end) found = span.scope;
    return found;
  };

  return {
    offsetOf,
    memberBindings,
    /** @param {number} offset */
    identityAt: (offset) => atStart.get(offset) ?? null,
    /** @param {number} offset the position of a property name */
    receiverAt: (offset) => atPropertyName.get(offset) ?? null,
    /**
     * What a name is bound to at the position the diagnostic was reported. **The position
     * matters**: resolving from the start of the line lands outside every node span in
     * indented source, which answers `other` for a binding that is plainly the namespace.
     * @param {number} offset @param {string} name
     */
    bindingKind: (offset, name) => {
      const scope = scopeAt(offset);
      return scope ? resolver.resolveBinding(scope, name) : "other";
    },
  };
}

/**
 * Classify the browser diagnostics of one compiler run.
 *
 * @param {object} options
 * @param {LocatedDiagnostic[]} options.diagnostics diagnostics from the caller's own run
 * @param {string} [options.root]
 * @param {string} [options.configFile]
 * @param {string} [options.declarationFile]
 * @param {string} [options.scanDirectory] where the publication inventory looks for writers
 * @returns {Classification}
 */
export function classifyBrowserDiagnostics({
  diagnostics,
  root = process.cwd(),
  configFile = "tsconfig.public.json",
  declarationFile = "src/types/browser-contracts.d.ts",
  scanDirectory = "public/js",
} = { diagnostics: [] }) {
  const { API } = createRequire(`${process.cwd()}/package.json`)("typescript/unstable/sync");
  const resolver = createNamespaceResolver();

  const declared = declaredNamespaceMembers(fs.readFileSync(path.join(root, declarationFile), "utf8"));
  const inventory = collectBrowserPublicationInventory({ root, configFile, scanDirectory });
  const known = new Set(declared);
  for (const surface of inventory.surfaces.keys()) {
    const prefix = `window.${NAMESPACE}.`;
    if (surface.startsWith(prefix)) known.add(surface.slice(prefix.length));
  }

  const api = new API({ cwd: root });
  const project = api.updateSnapshot({ openProjects: [path.resolve(root, configFile)] }).getProjects()[0];
  if (!project) throw new Error(`No TypeScript project for ${configFile}`);

  /** @type {Map<string, ReturnType<typeof indexFile> & {text: string, lines: string[]}>} */
  const files = new Map();
  /** @param {string} filePath */
  const fileIndex = (filePath) => {
    const cached = files.get(filePath);
    if (cached) return cached;
    const absolute = path.resolve(root, filePath);
    const text = fs.readFileSync(absolute, "utf8");
    const parsed = project.program.getSourceFile(absolute.replaceAll("\\", "/"));
    if (!isNode(parsed)) throw new Error(`${filePath} is in the diagnostics but not in the program`);
    const entry = { ...indexFile(parsed, text, resolver), text, lines: text.split("\n") };
    files.set(filePath, entry);
    return entry;
  };

  /**
   * The namespace member a diagnostic reads, or `null`.
   *
   * **A read of the root itself names no member**, and is deliberately not chased into the
   * expression that follows it: stepping along the source text to find the next identifier
   * walks straight through a computed key and invents `namespace[key].render` as a read of
   * `render`. The root is identified as the root, and that is enough to classify it.
   * @param {LocatedDiagnostic} diagnostic
   */
  const memberOf = (diagnostic) => {
    const index = fileIndex(diagnostic.filePath);
    return index.identityAt(index.offsetOf(diagnostic.line, diagnostic.column))?.member ?? null;
  };

  /** @param {LocatedDiagnostic} diagnostic @returns {CanonicalFamily} */
  const familyOf = (diagnostic) => {
    if (PARAM_CODES.has(diagnostic.code)) return "params";
    if (STATE_CODES.has(diagnostic.code)) return "state";
    if (diagnostic.code === 2531) return "dom";

    const index = fileIndex(diagnostic.filePath);
    const line = index.lines[diagnostic.line - 1] ?? "";
    const before = line.slice(0, diagnostic.column - 1);

    if (diagnostic.code === 2339) {
      const receiverType = diagnostic.message.match(/on type '(.*)'\.$/)?.[1] ?? "";
      const offset = index.offsetOf(diagnostic.line, diagnostic.column);
      const receiver = index.receiverAt(offset);
      if (receiver && (receiver.member || receiver.kind === "namespace")) return "namespace";
      if (DOM_TYPE.test(receiverType)) return "dom";
      if (receiverType === "{}") {
        const trimmed = before.replace(/[?.\s]+$/, "");
        const name = trimmed.match(IDENT_TAIL)?.[1] ?? null;
        if (name) {
          if (new RegExp(`[(,]\\s*${name.replace(/[$]/g, "\\$&")}\\s*=\\s*\\{\\s*\\}`).test(index.text)) return "params";
          if (index.memberBindings.has(name) || index.bindingKind(offset, name) === "namespace") return "namespace";
        }
        return "state";
      }
      if (receiverType === "never" || receiverType.startsWith("{")) return "state";
      return "assorted";
    }

    if (diagnostic.code === 18047 || diagnostic.code === 18048) {
      const subject = diagnostic.message.match(/'(.*)' is possibly/)?.[1] ?? "";
      const rootName = subject.split(".")[0].split("[")[0];
      const identity = index.identityAt(index.offsetOf(diagnostic.line, diagnostic.column));
      if (identity && (identity.member || identity.kind === "namespace")) return "namespace";
      const declaration = index.text.match(new RegExp(`\\b(?:const|let|var)\\s+${rootName.replace(/[$]/g, "\\$&")}\\s*=\\s*(.{0,120})`));
      if (declaration && DOM_QUERY.test(declaration[1])) return "dom";
      if (index.memberBindings.has(rootName)) return "namespace";
      if (/@type \{[^}]*Element[^}]*\}/.test(index.text)
        && new RegExp(`\\blet\\s+${rootName.replace(/[$]/g, "\\$&")}\\s*=\\s*null`).test(index.text)) return "dom";
      return "state";
    }

    if (diagnostic.code === 18046) {
      const index2 = index.identityAt(index.offsetOf(diagnostic.line, diagnostic.column));
      if (index2?.kind === "namespace") return "namespace";
      const member = memberOf(diagnostic);
      if (member && known.has(member) && !declared.has(member)) return "namespace";
      if (member && known.has(member) && declared.has(member)) return "unknown";
      const subject = diagnostic.message.match(/'(.*)' is of type 'unknown'/)?.[1] ?? "";
      const rootName = subject.split(".")[0].split("[")[0];
      const bound = index.memberBindings.get(rootName);
      if (bound && known.has(bound) && !declared.has(bound)) return "namespace";
      return "unknown";
    }

    return "assorted";
  };

  /** @type {ClassifiedDiagnostic[]} */
  const classified = [];
  for (const diagnostic of diagnostics) {
    const family = familyOf(diagnostic);
    classified.push({
      filePath: diagnostic.filePath,
      code: diagnostic.code,
      line: diagnostic.line,
      column: diagnostic.column,
      family,
      owner: OWNED_FAMILIES.has(family) ? ownerOf(diagnostic.filePath) : null,
      member: memberOf(diagnostic),
    });
  }
  classified.sort((left, right) => left.filePath.localeCompare(right.filePath) || left.line - right.line || left.column - right.column || left.code - right.code);

  /** @type {Record<CanonicalFamily, number>} */
  const families = { params: 0, state: 0, dom: 0, unknown: 0, namespace: 0, assorted: 0 };
  /** @type {Record<string, {params: number, state: number, assorted: number, total: number}>} */
  const owners = {};
  for (const owner of [SHARED_OWNER, ...OWNER_FILES.map(([name]) => name), REMAINDER_OWNER]) {
    owners[owner] = { params: 0, state: 0, assorted: 0, total: 0 };
  }
  for (const entry of classified) {
    families[entry.family] += 1;
    if (!entry.owner) continue;
    const bucket = owners[entry.owner];
    if (entry.family === "params") bucket.params += 1;
    else if (entry.family === "state") bucket.state += 1;
    else bucket.assorted += 1;
    bucket.total += 1;
  }

  // Root-optionality, reported rather than acted on. `TS18048` is the whole class: a read
  // that is only unsafe because the root or the member it goes through is optional. The
  // bare-root reads belong to `0.33.33.38.2.6` and this checkpoint does not touch them.
  let adoptable = 0;
  let bareRoot = 0;
  /** @type {Record<string, number>} */
  const parkedByMember = {};
  for (const diagnostic of diagnostics) {
    if (diagnostic.code !== 18048) continue;
    const subject = diagnostic.message.match(/'(.*)' is possibly/)?.[1] ?? "";
    const index = fileIndex(diagnostic.filePath);
    const offset = index.offsetOf(diagnostic.line, diagnostic.column);
    const head = subject.split(".")[0].split("[")[0];
    const rootSubject = subject.endsWith(`.${NAMESPACE}`) || subject === NAMESPACE
      || (!subject.includes(".") && index.bindingKind(offset, head) === "namespace");
    if (rootSubject) {
      bareRoot += 1;
      continue;
    }
    const member = memberOf(diagnostic);
    if (member && declared.has(member)) adoptable += 1;
  }

  // Class E is a different symptom of the same optionality: a member read that is `unknown`
  // because nothing declared it. It is counted from `TS18046` rather than `TS18048` because
  // that is the code the compiler reports for it, and it drains when the member is declared
  // rather than when a consumer is adopted.
  for (const diagnostic of diagnostics) {
    if (diagnostic.code !== 18046) continue;
    const member = memberOf(diagnostic);
    if (member && known.has(member) && !declared.has(member)) {
      parkedByMember[member] = (parkedByMember[member] ?? 0) + 1;
    }
  }

  return {
    diagnostics: classified,
    families,
    total: classified.length,
    owners,
    rootOptionality: {
      adoptable,
      parked: Object.values(parkedByMember).reduce((sum, count) => sum + count, 0),
      parkedByMember,
      bareRoot,
    },
    declaredMembers: [...declared].sort(),
    knownMembers: [...known].sort(),
  };
}
