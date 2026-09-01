import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

import {
  NAMESPACE,
  createNamespaceResolver,
  isNode,
  namedList,
  namedNode,
} from "./browser-namespace-resolver.mjs";

/**
 * Inventory of the browser surfaces first-party code actually publishes at runtime.
 *
 * `0.33.33.33` closed against a scanner that recognised only direct
 * `window.<surface> = ...` assignments. The `0.33.33.34` preflight proved that model
 * incomplete: most of the namespace is published through an alias, so the recorded
 * inventory reported 19 surfaces where the estate holds far more, a third writer of
 * `window.LongtailForge.filesDialog` was invisible, and so was a third `window.fetch`
 * guard.
 *
 * This inventory is built from the TypeScript AST rather than from source text. The
 * compiler is already a repository dependency and these are JavaScript sources, so the
 * assignment forms below are read as syntax instead of matched as strings. That matters
 * for the false-positive classes an expanding regex family cannot separate: a local
 * object that happens to be called `namespace`, a parameter called `global` that is not
 * the global object, a read rather than a write, and a call rather than an assignment.
 *
 * **Provenance is the contract, and provenance is a binding rather than a spelling.**
 * `0.33.33.38.2.4.1` moved that half of this file into
 * `browser-namespace-resolver.mjs`, which is now the one implementation every durable
 * measurement calls: root identity, member identity, and lexical binding, including the
 * index-paired parameter rule and the logical-assignment root. **Nothing about the
 * resolution changed** - it was lifted so that the next tool answering these questions
 * cannot answer them differently, which five independent implementations already did.
 *
 * What stays here is publication *policy*, and each rule below exists because its absence
 * produced a real defect during `0.33.33.33.8`:
 *
 * - A namespace-root write is safe only when what it assigns **is** the namespace: the
 *   namespace expression itself, `namespace || {}`, or an identifier whose specific
 *   binding is the namespace. Merely mentioning the previous namespace is not derivation,
 *   so `window.LongtailForge = { previous: window.LongtailForge }` is a clobber.
 * - A write rooted at the global object or the namespace that cannot be resolved
 *   statically is **recorded**, never dropped. `window.LongtailForge[key] = ...` is
 *   reported as an unsupported rooted write so governance can reject it. String-literal
 *   element access is resolvable and is counted as an ordinary publication.
 *
 * Writes that are not rooted at the global object or the namespace are not publications
 * and are not recorded at all - `element.textContent = ...` is a local DOM write, and an
 * inventory that listed those would be noise rather than governance.
 *
 * @typedef {import("./browser-namespace-resolver.mjs").AstNode} AstNode
 * @typedef {import("./browser-namespace-resolver.mjs").Scope} Scope
 *
 * @typedef {object} PublicationWriter
 * @property {string} file
 * @property {"direct" | "alias"} form
 * @property {string} alias the identifier the write went through
 * @property {number} line
 * @property {string[]} members top-level keys, when the write assigns an object literal
 *   directly or through `Object.freeze`; empty for any other assigned expression
 * @property {boolean} preservesExisting whether that object literal spreads the surface
 *   it is republishing, which is what decides whether a co-writer's members survive
 * @property {boolean} assertedValue whether the published value is a JSDoc cast rather than a
 *   checked expression. A cast tells the compiler what to believe, so the writer is never
 *   checked against the declaration it claims to implement - which is exactly how
 *   `viewResponseRecords` stayed unlinked until `0.33.33.38.2.4.5` looked
 *
 * @typedef {object} PublicationSurface
 * @property {string} surface
 * @property {PublicationWriter[]} writers
 *
 * @typedef {object} NamespaceRootWrite
 * @property {string} file
 * @property {number} line
 * @property {string} text
 * @property {boolean} derivesFromNamespace
 *
 * @typedef {object} LocatedTarget
 * @property {string} file
 * @property {number} line
 * @property {string} target
 *
 * @typedef {object} PublicationInventory
 * @property {Map<string, PublicationSurface>} surfaces
 * @property {NamespaceRootWrite[]} namespaceRootWrites
 * @property {LocatedTarget[]} deepWrites
 * @property {LocatedTarget[]} unsupportedTargets
 */

/**
 * `window.location.href = ...` is navigation through a host object, not publication.
 * This is an exact named platform exclusion rather than a prefix allowance: only the
 * `location` member of the global object is exempt, and only from the deep-write bucket.
 */
const PLATFORM_NAVIGATION_MEMBER = "location";

/** @param {string} directory @param {string[]} out */
function collectBrowserScripts(directory, out) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const full = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collectBrowserScripts(full, out);
    else if (full.endsWith(".js")) out.push(full);
  }
}

/**
 * Build the inventory. Traversal order is fixed, so the result does not depend on the
 * order the filesystem happens to return.
 * @param {{root?: string, configFile?: string, scanDirectory?: string}} [options]
 * @returns {PublicationInventory}
 */
export function collectBrowserPublicationInventory({
  root = process.cwd(),
  configFile = "tsconfig.public.json",
  scanDirectory = "public/js",
} = {}) {
  const { API } = createRequire(`${process.cwd()}/package.json`)("typescript/unstable/sync");
  const {
    classifyExpression,
    isEmptyObjectLiteral,
    kindOf,
    unwindTarget,
    unwrapParentheses,
    walkScoped,
  } = createNamespaceResolver();

  const api = new API({ cwd: root });
  const snapshot = api.updateSnapshot({ openProjects: [path.resolve(root, configFile)] });
  const project = snapshot.getProjects()[0];
  if (!project) throw new Error(`No TypeScript project for ${configFile}`);

  /** @type {string[]} */
  const files = [];
  collectBrowserScripts(path.join(root, scanDirectory).replaceAll("\\", "/"), files);
  files.sort();

  /** @type {Map<string, PublicationSurface>} */
  const surfaces = new Map();
  /** @type {NamespaceRootWrite[]} */
  const namespaceRootWrites = [];
  /** @type {LocatedTarget[]} */
  const deepWrites = [];
  /** @type {LocatedTarget[]} */
  const unsupportedTargets = [];

  for (const file of files) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    const parsed = project.program.getSourceFile(path.resolve(root, file));
    if (!isNode(parsed)) continue;
    const sourceFile = parsed;
    const text = fs.readFileSync(file, "utf8");
    /** @param {number} position @returns {number} */
    const lineOf = (position) => text.slice(0, position).split("\n").length;

    /**
     * The surface an expression *reads*, used to tell `...(root.view || {})` - which
     * preserves the co-writer's members - from a spread of anything else.
     * @param {AstNode} node @param {Scope} scope @returns {string | null}
     */
    const surfaceNameOf = (node, scope) => {
      let target = unwrapParentheses(node);
      if (kindOf(target) === "BinaryExpression") {
        const operator = namedNode(target, "operatorToken");
        const left = namedNode(target, "left");
        const right = namedNode(target, "right");
        const operatorKind = operator ? kindOf(operator) : "";
        if (left && right && (operatorKind === "BarBarToken" || operatorKind === "QuestionQuestionToken")
          && isEmptyObjectLiteral(unwrapParentheses(right))) {
          target = unwrapParentheses(left);
        }
      }
      const { base, members, resolvable } = unwindTarget(target);
      if (!resolvable || members.length === 0) return null;
      const rootKind = classifyExpression(base, scope);
      if (rootKind === "namespace" && members.length === 1) return `window.${NAMESPACE}.${members[0]}`;
      if (rootKind !== "global-object") return null;
      if (members[0] === NAMESPACE && members.length === 2) return `window.${NAMESPACE}.${members[1]}`;
      return members.length === 1 ? `window.${members[0]}` : null;
    };

    /**
     * What a publication assigns, when that is readable: its own top-level members, and
     * whether it preserves what the surface already held.
     * @param {AstNode | undefined} node @param {Scope} scope @param {string} surface
     * @returns {{members: string[], preservesExisting: boolean}}
     */
    const describeAssignedValue = (node, scope, surface) => {
      if (!node) return { members: [], preservesExisting: false };
      let target = unwrapParentheses(node);
      if (kindOf(target) === "CallExpression") {
        const callee = namedNode(target, "expression");
        const [argument] = namedList(target, "arguments");
        if (callee && argument && callee.getText().replaceAll(/\s+/g, "") === "Object.freeze") {
          target = unwrapParentheses(argument);
        }
      }
      if (kindOf(target) !== "ObjectLiteralExpression") return { members: [], preservesExisting: false };
      /** @type {string[]} */
      const members = [];
      let preservesExisting = false;
      for (const property of namedList(target, "properties")) {
        if (kindOf(property) === "SpreadAssignment") {
          const spread = namedNode(property, "expression");
          if (spread && surfaceNameOf(spread, scope) === surface) preservesExisting = true;
          continue;
        }
        const nameNode = namedNode(property, "name");
        if (!nameNode) continue;
        const raw = nameNode.getText().trim();
        members.push(/^["'].*["']$/.test(raw) ? raw.slice(1, -1) : raw);
      }
      return { members: members.sort(), preservesExisting };
    };

    /** @param {AstNode} node @param {Scope} scope */
    const analyzeAssignment = (node, scope) => {
      if (kindOf(node) !== "BinaryExpression") return;
      const operator = namedNode(node, "operatorToken");
      const left = namedNode(node, "left");
      const right = namedNode(node, "right");
      if (!operator || !left) return;
      if (!["EqualsToken", "FirstAssignment"].includes(kindOf(operator))) return;
      const leftKind = kindOf(unwrapParentheses(left));
      if (leftKind !== "PropertyAccessExpression" && leftKind !== "ElementAccessExpression") return;

      const line = lineOf(left.getStart());
      const { base, members, computed, resolvable } = unwindTarget(left);
      const rootKind = classifyExpression(base, scope);
      if (rootKind === "other" || members.length === 0) return;

      const rendered = `${rootKind === "namespace" ? `window.${NAMESPACE}` : "window"}${computed.join("")}`;
      if (!resolvable) {
        // Rooted at the global object or the namespace but not statically readable. This
        // is recorded rather than dropped: a computed publication must be visible to
        // governance even though it cannot be named.
        unsupportedTargets.push({ file: relative, line, target: rendered });
        return;
      }

      /** @type {"direct" | "alias"} */
      const form = rootKind === "namespace" && kindOf(base) === "Identifier" ? "alias" : "direct";
      const head = base.getText().trim();
      /** @type {string | null} */
      let surface = null;

      if (rootKind === "global-object") {
        if (members[0] === NAMESPACE && members.length === 2) surface = `window.${NAMESPACE}.${members[1]}`;
        else if (members[0] === NAMESPACE && members.length === 1) {
          // A namespace-root write is bootstrap, not an application surface - but only
          // while what it assigns *is* the namespace. Mentioning the previous namespace
          // inside a new object is not derivation.
          const assigned = (right ? right.getText() : "").replaceAll(/\s+/g, " ").trim();
          namespaceRootWrites.push({
            file: relative,
            line,
            text: assigned.slice(0, 80),
            derivesFromNamespace: right ? classifyExpression(right, scope) === "namespace" : false,
          });
          return;
        } else if (members.length === 1) surface = `window.${members[0]}`;
        else if (members[0] !== PLATFORM_NAVIGATION_MEMBER) {
          deepWrites.push({ file: relative, line, target: rendered });
        }
      } else if (members.length === 1) surface = `window.${NAMESPACE}.${members[0]}`;
      else deepWrites.push({ file: relative, line, target: rendered });

      if (!surface) return;
      if (!surfaces.has(surface)) surfaces.set(surface, { surface, writers: [] });
      const entry = surfaces.get(surface);
      if (entry && !entry.writers.some((writer) => writer.file === relative)) {
        const { members, preservesExisting } = describeAssignedValue(right, scope, surface);
        // A published value wrapped in parentheses is how a JSDoc cast reaches the AST, so this
        // is the structural signature of "asserted rather than checked".
        const assertedValue = right ? kindOf(right) === "ParenthesizedExpression" : false;
        entry.writers.push({ file: relative, form, alias: head, line, members, preservesExisting, assertedValue });
      }
    };

    walkScoped(sourceFile, analyzeAssignment);
  }

  for (const entry of surfaces.values()) entry.writers.sort((left, right) => left.file.localeCompare(right.file));
  return { surfaces, namespaceRootWrites, deepWrites, unsupportedTargets };
}

/**
 * Surfaces written by more than one file, sorted for determinism.
 * @param {PublicationInventory} inventory
 * @returns {PublicationSurface[]}
 */
export function contestedSurfaces(inventory) {
  return [...inventory.surfaces.values()]
    .filter((entry) => entry.writers.length > 1)
    .sort((left, right) => left.surface.localeCompare(right.surface));
}
