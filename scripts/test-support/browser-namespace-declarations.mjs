// The browser namespace declaration's members, read from the live declaration text.
//
// Moved here unchanged by `0.33.33.48.2`, which retired the browser-diagnostic classifier this
// parser used to live beside. The declaration-coverage inventory and the full-strict governance
// regression read declared members through it; nothing about it depends on a diagnostic.

/**
 * The members the live declaration names. **Read from the tree, never carried**: the defect
 * this replaces was a JSON snapshot holding one member against a declaration holding thirty.
 *
 * **Both declaration syntaxes count.** A member may be written as a property, `icons?: X`, or
 * as a method, `getWorkspaceProjectsLabel?(name): string`. `0.33.33.38.2.2.6.6` found that only
 * the first was recognised, so a method-style member could be published, declared, and still
 * reported as undeclared - a declaration governance could not see. The estate writes every
 * member property-style, which is why it went unnoticed; the parser no longer depends on that
 * convention holding.
 * @param {string} declarationSource
 * @returns {Set<string>}
 */
export function declaredNamespaceMembers(declarationSource) {
  const block = declarationSource.match(/export interface LongtailForgeBrowserNamespace \{([\s\S]*?)\n\}/);
  if (!block) throw new Error("Could not find LongtailForgeBrowserNamespace in the browser declaration");
  return new Set([...block[1].matchAll(/^ {2}(\w+)\??[:(]/gm)].map((match) => match[1]));
}
