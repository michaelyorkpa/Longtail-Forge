import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function read(requestUrl) {
  const requestPath = new URL(requestUrl, `http://${config.host}:${config.port}`).pathname;
  const relativePath = requestPath === "/" ? "index.html" : requestPath.slice(1);
  const filePath = path.resolve(config.root, relativePath);

  if (!filePath.startsWith(config.root)) {
    return {
      statusCode: 403,
      contents: "Forbidden",
      contentType: "text/plain; charset=utf-8",
    };
  }

  try {
    const contents = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();

    return {
      statusCode: 200,
      contents,
      contentType: contentTypes[extension] || "application/octet-stream",
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        statusCode: 404,
        contents: "Not found",
        contentType: "text/plain; charset=utf-8",
      };
    }

    throw error;
  }
}

export const staticService = {
  read,
};
