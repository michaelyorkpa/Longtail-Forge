import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export function readRuntimeSourceEntries({ root = process.cwd(), sourceDir = "src" } = {}) {
  return listRuntimeSourceFiles({ root, sourceDir }).map((absolutePath) => {
    const file = normalizeProjectPath(root, absolutePath);
    return {
      absolutePath,
      file,
      filePath: file,
      source: readFileSync(absolutePath, "utf8"),
    };
  });
}

export function listRuntimeSourceFiles({ root = process.cwd(), sourceDir = "src" } = {}) {
  const files = [];
  walk(path.join(root, sourceDir), files);
  return files;
}

export function normalizeProjectPath(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

export function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

export function extractCallExpression(source, startIndex) {
  const openIndex = source.indexOf("(", startIndex);
  let depth = 0;
  let escapeNext = false;
  let quote = "";
  let templateDepth = 0;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (quote === "`" && char === "$" && source[index + 1] === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }

      if (quote === "`" && char === "}" && templateDepth > 0) {
        templateDepth -= 1;
        continue;
      }

      if (char === quote && (quote !== "`" || templateDepth === 0)) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return source.slice(startIndex);
}

export function splitTopLevelArguments(source) {
  const args = [];
  let depth = 0;
  let escapeNext = false;
  let quote = "";
  let start = 0;
  let templateDepth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (quote === "`" && char === "$" && source[index + 1] === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }

      if (quote === "`" && char === "}" && templateDepth > 0) {
        templateDepth -= 1;
        continue;
      }

      if (char === quote && (quote !== "`" || templateDepth === 0)) {
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(" || char === "{" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }

  const lastArg = source.slice(start).trim();
  if (lastArg) {
    args.push(lastArg);
  }
  return args;
}

function walk(currentPath, results) {
  const stat = statSync(currentPath);

  if (stat.isDirectory()) {
    for (const entry of readdirSync(currentPath)) {
      walk(path.join(currentPath, entry), results);
    }
    return;
  }

  if (/\.(?:js|mjs)$/.test(currentPath)) {
    results.push(currentPath);
  }
}
