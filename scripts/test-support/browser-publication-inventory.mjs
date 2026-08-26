import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

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
 * Names are resolved through a bounded lexical scope chain, so a nested
 * `const root = document.createElement("div")` shadows an outer `root` that is the
 * namespace, and a parameter named `global` that never received the global object is not
 * the global object. This is scope resolution, deliberately not data-flow analysis: a
 * binding is classified from its own initialiser, and nothing is tracked through
 * reassignment, calls, properties, or containers.
 *
 * Three rules follow from that, and each one exists because its absence produced a real
 * defect during `0.33.33.33.8`:
 *
 * - A function parameter is the global object only when the argument **at that same
 *   index** of its own immediately-invoked call is the global object. Asking whether any
 *   argument was `window` made the first parameter of
 *   `(function (localObject, global) {...})({}, window)` look global.
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
 * The TypeScript 7 API ships incomplete types for the node accessors this inventory uses,
 * so the AST is treated as the runtime boundary it is: it enters as `unknown` and is
 * narrowed through the guards below rather than asserted with a cast.
 *
 * @typedef {object} AstNode
 * @property {number} kind
 * @property {(visit: (child: AstNode) => void) => void} forEachChild
 * @property {(name: string) => unknown} getNamedChild
 * @property {() => string} getText
 * @property {() => number} getStart
 *
 * @typedef {"global-object" | "namespace" | "other"} BindingKind
 *
 * @typedef {object} Scope
 * @property {Scope | undefined} parent
 * @property {Map<string, BindingKind>} bindings
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

const require = createRequire(`${process.cwd()}/package.json`);

const NAMESPACE = "LongtailForge";
const GLOBAL_OBJECTS = ["window", "globalThis"];

/**
 * `window.location.href = ...` is navigation through a host object, not publication.
 * This is an exact named platform exclusion rather than a prefix allowance: only the
 * `location` member of the global object is exempt, and only from the deep-write bucket.
 */
const PLATFORM_NAVIGATION_MEMBER = "location";

/** Nodes that open a lexical scope. */
const SCOPE_KINDS = new Set([
  "ArrowFunction",
  "Block",
  "CaseBlock",
  "CatchClause",
  "ClassDeclaration",
  "ClassExpression",
  "Constructor",
  "ForInStatement",
  "ForOfStatement",
  "ForStatement",
  "FunctionDeclaration",
  "FunctionExpression",
  "GetAccessor",
  "MethodDeclaration",
  "ModuleBlock",
  "SetAccessor",
]);

/** Scope-opening nodes that also bind parameters. */
const FUNCTION_KINDS = new Set([
  "ArrowFunction",
  "Constructor",
  "FunctionDeclaration",
  "FunctionExpression",
  "GetAccessor",
  "MethodDeclaration",
  "SetAccessor",
]);

/** @param {unknown} value @returns {value is AstNode} */
function isNode(value) {
  return Boolean(value) && typeof value === "object" && typeof (/** @type {{forEachChild?: unknown}} */ (value)).forEachChild === "function";
}

/** @param {AstNode} node @param {string} name @returns {AstNode | undefined} */
function namedNode(node, name) {
  const child = node.getNamedChild(name);
  return isNode(child) ? child : undefined;
}

/** @param {AstNode} node @param {string} name @returns {AstNode[]} */
function namedList(node, name) {
  const child = node.getNamedChild(name);
  return Array.isArray(child) ? child.filter(isNode) : [];
}

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
  const { API } = require("typescript/unstable/sync");
  const { SyntaxKind } = require("typescript/unstable/ast");
  /** @param {AstNode} node @returns {string} */
  const kindOf = (node) => String(SyntaxKind[node.kind]);

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

  /** @param {Scope | undefined} parent @returns {Scope} */
  const createScope = (parent) => ({ parent, bindings: new Map() });

  /**
   * Resolve a name to the innermost binding that declares it. An unbound name is `other`,
   * which is the same answer a local would give: nothing outside a proven binding is ever
   * treated as the global object or the namespace.
   * @param {Scope} scope @param {string} name @returns {BindingKind}
   */
  const resolveBinding = (scope, name) => {
    /** @type {Scope | undefined} */
    let current = scope;
    while (current) {
      const found = current.bindings.get(name);
      if (found) return found;
      current = current.parent;
    }
    return "other";
  };

  /** @param {AstNode} node @returns {AstNode} */
  const unwrapParentheses = (node) => {
    let current = node;
    while (kindOf(current) === "ParenthesizedExpression") {
      const inner = namedNode(current, "expression");
      if (!inner) return current;
      current = inner;
    }
    return current;
  };

  /** @param {AstNode} node @returns {boolean} */
  const isEmptyObjectLiteral = (node) => kindOf(node) === "ObjectLiteralExpression"
    && namedList(node, "properties").length === 0;

  /**
   * What an expression *is*, by structure, in the scope where it appears. Only the forms
   * below can yield the global object or the namespace; everything else is `other`.
   * @param {AstNode} node @param {Scope} scope @returns {BindingKind}
   */
  const classifyExpression = (node, scope) => {
    const target = unwrapParentheses(node);
    const kind = kindOf(target);
    if (kind === "Identifier") return resolveBinding(scope, target.getText().trim());
    if (kind === "PropertyAccessExpression") {
      const base = namedNode(target, "expression");
      const member = namedNode(target, "name");
      if (!base || !member) return "other";
      return classifyExpression(base, scope) === "global-object" && member.getText().trim() === NAMESPACE
        ? "namespace"
        : "other";
    }
    if (kind === "BinaryExpression") {
      const operator = namedNode(target, "operatorToken");
      const left = namedNode(target, "left");
      const right = namedNode(target, "right");
      if (!operator || !left || !right) return "other";
      const operatorKind = kindOf(operator);
      // `namespace || {}` is the namespace; `namespace || somethingElse` is not.
      if (operatorKind === "BarBarToken" || operatorKind === "QuestionQuestionToken") {
        return isEmptyObjectLiteral(unwrapParentheses(right)) ? classifyExpression(left, scope) : "other";
      }
      // `const ns = window.LongtailForge = window.LongtailForge || {}` is the bootstrap
      // form: an assignment expression evaluates to what it assigned.
      if (operatorKind === "EqualsToken" || operatorKind === "FirstAssignment") {
        return classifyExpression(right, scope);
      }
    }
    return "other";
  };

  /**
   * Bind every identifier a parameter pattern introduces. A destructured parameter is
   * bound as `other` rather than left unbound, so it still shadows an outer alias.
   * @param {AstNode} pattern @param {Scope} scope @param {BindingKind} kind
   */
  const bindPatternNames = (pattern, scope, kind) => {
    if (kindOf(pattern) === "Identifier") {
      scope.bindings.set(pattern.getText().trim(), kind);
      return;
    }
    pattern.forEachChild((child) => bindPatternNames(child, scope, "other"));
  };

  /**
   * A parameter is the global object only when the argument at its own index is. Pairing
   * by index rather than by "any argument was window" is what separates
   * `(function (localObject, global) {...})({}, window)`.
   * @param {AstNode} functionNode @param {Scope} functionScope @param {Scope} callerScope
   * @param {AstNode[] | undefined} invocationArguments
   */
  const bindParameters = (functionNode, functionScope, callerScope, invocationArguments) => {
    namedList(functionNode, "parameters").forEach((parameter, index) => {
      const nameNode = namedNode(parameter, "name");
      if (!nameNode) return;
      const argument = invocationArguments ? invocationArguments[index] : undefined;
      const kind = argument ? classifyExpression(argument, callerScope) : "other";
      bindPatternNames(nameNode, functionScope, kind);
    });
  };

  /**
   * Bindings declared directly in one scope, in source order so that
   * `const global = window; const namespace = global.LongtailForge` resolves. Nested
   * scopes are not entered: their declarations belong to them, not here.
   * @param {AstNode} scopeNode @param {Scope} scope
   */
  const collectDirectBindings = (scopeNode, scope) => {
    /** @param {AstNode} node */
    const inspect = (node) => {
      const kind = kindOf(node);
      if (kind === "VariableDeclaration") {
        const nameNode = namedNode(node, "name");
        const initializer = namedNode(node, "initializer");
        if (nameNode) {
          bindPatternNames(
            nameNode,
            scope,
            initializer && kindOf(nameNode) === "Identifier" ? classifyExpression(initializer, scope) : "other",
          );
        }
        return;
      }
      if (SCOPE_KINDS.has(kind)) {
        // A declaration's own name belongs to the enclosing scope; its body does not.
        const nameNode = namedNode(node, "name");
        if (nameNode && kindOf(nameNode) === "Identifier"
          && (kind === "FunctionDeclaration" || kind === "ClassDeclaration")) {
          scope.bindings.set(nameNode.getText().trim(), "other");
        }
        return;
      }
      node.forEachChild(inspect);
    };
    scopeNode.forEachChild(inspect);
  };

  for (const file of files) {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    const parsed = project.program.getSourceFile(path.resolve(root, file));
    if (!isNode(parsed)) continue;
    const sourceFile = parsed;
    const text = fs.readFileSync(file, "utf8");
    /** @param {number} position @returns {number} */
    const lineOf = (position) => text.slice(0, position).split("\n").length;

    /**
     * The chain a write targets, unwound from the assignment target inward, together with
     * the expression it is rooted at. `resolvable` is false when any step is a computed
     * access that cannot be read statically.
     * @param {AstNode} node
     * @returns {{base: AstNode, members: string[], computed: string[], resolvable: boolean}}
     */
    const unwindTarget = (node) => {
      /** @type {string[]} */
      const members = [];
      /** Rendered segments, so a computed step reads as `[key]` rather than as a member. */
      /** @type {string[]} */
      const computed = [];
      let resolvable = true;
      let current = unwrapParentheses(node);
      for (;;) {
        const kind = kindOf(current);
        if (kind === "PropertyAccessExpression") {
          const member = namedNode(current, "name");
          const base = namedNode(current, "expression");
          if (!member || !base) break;
          members.unshift(member.getText().trim());
          computed.unshift(`.${member.getText().trim()}`);
          current = unwrapParentheses(base);
          continue;
        }
        if (kind === "ElementAccessExpression") {
          const argument = namedNode(current, "argumentExpression");
          const base = namedNode(current, "expression");
          if (!base) break;
          const argumentKind = argument ? kindOf(argument) : "";
          if (argument && (argumentKind === "StringLiteral" || argumentKind === "NoSubstitutionTemplateLiteral")) {
            // A string-literal key is as static as a dotted member, so it is a normal
            // publication rather than an unsupported shape.
            members.unshift(argument.getText().trim().slice(1, -1));
            computed.unshift(`.${argument.getText().trim().slice(1, -1)}`);
          } else {
            resolvable = false;
            const key = argument ? argument.getText().replaceAll(/\s+/g, "") : "";
            members.unshift(key);
            computed.unshift(`[${key}]`);
          }
          current = unwrapParentheses(base);
          continue;
        }
        break;
      }
      return { base: current, members, computed, resolvable };
    };

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
        entry.writers.push({ file: relative, form, alias: head, line, members, preservesExisting });
      }
    };

    /**
     * @param {AstNode} node @param {Scope} scope
     * @param {AstNode[] | undefined} invocationArguments arguments of the call that
     *   immediately invokes this node, when it is an IIFE callee
     */
    const visit = (node, scope, invocationArguments) => {
      const kind = kindOf(node);
      let inner = scope;
      if (SCOPE_KINDS.has(kind)) {
        inner = createScope(scope);
        if (FUNCTION_KINDS.has(kind)) bindParameters(node, inner, scope, invocationArguments);
        collectDirectBindings(node, inner);
      }
      analyzeAssignment(node, inner);

      const callee = kind === "CallExpression" ? namedNode(node, "expression") : undefined;
      const callArguments = callee ? namedList(node, "arguments") : undefined;
      // A parenthesised callee still forwards its call's arguments to the function inside.
      const forwarded = kind === "ParenthesizedExpression" ? invocationArguments : undefined;
      node.forEachChild((child) => {
        visit(child, inner, callee && child === callee ? callArguments : forwarded);
      });
    };

    const fileScope = createScope(undefined);
    for (const globalObject of GLOBAL_OBJECTS) fileScope.bindings.set(globalObject, "global-object");
    collectDirectBindings(sourceFile, fileScope);
    visit(sourceFile, fileScope, undefined);
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
