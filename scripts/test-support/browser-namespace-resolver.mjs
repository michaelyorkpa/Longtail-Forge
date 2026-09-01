import { createRequire } from "node:module";

/**
 * The one place that answers what a `LongtailForge` root, alias, or member reference *is*.
 *
 * Every durable measurement of this estate has to answer the same three questions - is this
 * expression the namespace root, which top-level member does this reference resolve to, and
 * which lexical declaration does this identifier belong to - and until `0.33.33.38.2.4.1`
 * each one answered them again. **The same spelling-versus-binding mistake was found five
 * times in five independent implementations**: `0.33.33.38.2.1`'s member attribution,
 * `0.33.33.38.2.2.4`'s canonical classifier, `0.33.33.38.2.2.6.1`'s subject resolution,
 * `0.33.33.38.2.2.6.7`'s alias-then-mutate search, and `0.33.33.38.2.2.6.4.1`'s receiver
 * audit. The rule was written down after the second and the next three still happened,
 * because **a rule cannot be shared - only an implementation can.**
 *
 * The logic here is not new. It is `browser-publication-inventory.mjs`'s resolution half,
 * lifted out unchanged so that inventory keeps its behaviour exactly and other tooling can
 * reach the same answers instead of re-deriving them. What the inventory keeps is publication
 * *policy* - what counts as a surface, what a deep write is, which writers contest one. What
 * moved here is only identity.
 *
 * **Scope resolution, deliberately not data-flow analysis.** A binding is classified from its
 * own initialiser, and nothing is tracked through reassignment, calls, properties, or
 * containers. An unbound name is `other`: nothing outside a proven binding is ever treated as
 * the global object or the namespace.
 *
 * **Precondition: the AST must be the source being analysed.** Bindings are resolved from
 * syntax, so answers are only true of the tree they were parsed from. A caller holding
 * diagnostics or positions from a different tree will get confident, wrong answers - the
 * defect `0.33.33.38.2.2.6.4.2` hit from the other direction, where a classifier read the
 * working tree while the diagnostics came from another. `0.33.33.38.2.4.2` owns making that
 * pairing structural for the durable command.
 *
 * The TypeScript 7 API ships incomplete types for the node accessors used here, so the AST is
 * treated as the runtime boundary it is: it enters as `unknown` and is narrowed through the
 * guards below rather than asserted with a cast.
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
 * @typedef {object} UnwoundTarget
 * @property {AstNode} base the expression the chain is rooted at
 * @property {string[]} members the readable chain, outermost last
 * @property {string[]} computed rendered segments, so a computed step reads as `[key]`
 * @property {boolean} resolvable false when any step is a computed access
 */

const require = createRequire(`${process.cwd()}/package.json`);

export const NAMESPACE = "LongtailForge";
export const GLOBAL_OBJECTS = ["window", "globalThis"];

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
export function isNode(value) {
  return Boolean(value) && typeof value === "object" && typeof (/** @type {{forEachChild?: unknown}} */ (value)).forEachChild === "function";
}

/** @param {AstNode} node @param {string} name @returns {AstNode | undefined} */
export function namedNode(node, name) {
  const child = node.getNamedChild(name);
  return isNode(child) ? child : undefined;
}

/** @param {AstNode} node @param {string} name @returns {AstNode[]} */
export function namedList(node, name) {
  const child = node.getNamedChild(name);
  return Array.isArray(child) ? child.filter(isNode) : [];
}

/**
 * A resolver bound to one parsed program's `SyntaxKind`. Cheap to create and holds no state
 * of its own: every answer is a pure function of the node and scope it is given.
 */
export function createNamespaceResolver() {
  const { SyntaxKind } = require("typescript/unstable/ast");

  /** @param {AstNode} node @returns {string} */
  const kindOf = (node) => String(SyntaxKind[node.kind]);

  /** @param {Scope | undefined} parent @returns {Scope} */
  const createScope = (parent) => ({ parent, bindings: new Map() });

  /** A file scope with the global object already bound under every name it goes by. */
  const createFileScope = () => {
    const scope = createScope(undefined);
    for (const globalObject of GLOBAL_OBJECTS) scope.bindings.set(globalObject, "global-object");
    return scope;
  };

  /**
   * Resolve a name to the innermost binding that declares it. An unbound name is `other`,
   * which is the same answer a local would give.
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
      // `window.LongtailForge ||= {}` is the same bootstrap written with logical assignment,
      // and it evaluates to the *left* operand rather than the right. Recognising only the
      // long form hid two published surfaces - `settingsHost` and `settingsPageController` -
      // from every count this resolver feeds, which `0.33.33.38.2.1` found by reconciling
      // eleven diagnostics that reached members no surface list contained. The empty-object
      // right-hand side is required for the same reason it is required above: `ns ||= other`
      // is not the namespace.
      if (operatorKind === "BarBarEqualsToken" || operatorKind === "QuestionQuestionEqualsToken") {
        return isEmptyObjectLiteral(unwrapParentheses(right)) ? classifyExpression(left, scope) : "other";
      }
    }
    return "other";
  };

  /**
   * Bind every identifier a parameter pattern introduces. A destructured parameter is bound
   * as `other` rather than left unbound, so it still shadows an outer alias.
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
   * A parameter is the global object only when the argument at its own index is. Pairing by
   * index rather than by "any argument was window" is what separates
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
   * `const global = window; const namespace = global.LongtailForge` resolves. Nested scopes
   * are not entered: their declarations belong to them, not here.
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

  /**
   * The chain an expression names, unwound from the outside in, together with the expression
   * it is rooted at. `resolvable` is false when any step is a computed access that cannot be
   * read statically; a string-literal key is as static as a dotted member.
   * @param {AstNode} node @returns {UnwoundTarget}
   */
  const unwindTarget = (node) => {
    /** @type {string[]} */
    const members = [];
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
   * The top-level `LongtailForge` member a reference resolves to, or `null`.
   *
   * **This is the question the inventory never had to ask.** It resolves assignment targets,
   * so it answers about writes; every defect in the analysis tooling was about a *read* -
   * `namespace.timezones` reached through an IIFE alias, which a spelling-based routine
   * called an unrelated local and mis-classified as a genuine trust boundary rather than
   * namespace work. Root identity is required, so `customer.timezones` resolves to `null`
   * however much its property name matches a surface.
   *
   * Deeper reads answer with their **top-level** member: `namespace.timezones.formatDate`
   * is `timezones`, because that is the member the declaration owns.
   * @param {AstNode} node @param {Scope} scope @returns {string | null}
   */
  const namespaceMemberOf = (node, scope) => {
    const { base, members, resolvable } = unwindTarget(node);
    if (!resolvable || members.length === 0) return null;
    const rootKind = classifyExpression(base, scope);
    if (rootKind === "namespace") return members[0] ?? null;
    if (rootKind === "global-object" && members[0] === NAMESPACE && members.length >= 2) return members[1] ?? null;
    return null;
  };

  /**
   * Walk a tree while maintaining the scope chain, calling `onNode` with the scope each node
   * sees. The scope a node is visited with is the one its own body opens, so an assignment
   * inside a function is resolved against that function's bindings.
   * @param {AstNode} rootNode @param {(node: AstNode, scope: Scope) => void} onNode
   */
  const walkScoped = (rootNode, onNode) => {
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
      onNode(node, inner);

      const callee = kind === "CallExpression" ? namedNode(node, "expression") : undefined;
      const callArguments = callee ? namedList(node, "arguments") : undefined;
      // A parenthesised callee still forwards its call's arguments to the function inside.
      const forwarded = kind === "ParenthesizedExpression" ? invocationArguments : undefined;
      node.forEachChild((child) => {
        visit(child, inner, callee && child === callee ? callArguments : forwarded);
      });
    };

    const fileScope = createFileScope();
    collectDirectBindings(rootNode, fileScope);
    visit(rootNode, fileScope, undefined);
  };

  return {
    bindParameters,
    bindPatternNames,
    classifyExpression,
    collectDirectBindings,
    createFileScope,
    createScope,
    isEmptyObjectLiteral,
    kindOf,
    namespaceMemberOf,
    resolveBinding,
    unwindTarget,
    unwrapParentheses,
    walkScoped,
  };
}
