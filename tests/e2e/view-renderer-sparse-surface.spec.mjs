import { expect, test } from "./support/isolated-workspace.mjs";

/**
 * A sparse surface in a real document.
 *
 * `renderLayout` pushes the pieces a descriptor omits - filters, the index panel, the table - as
 * `null`, and filters them out before anything is appended. `0.33.33.39.28` replaced that
 * `filter(Boolean)` with `filter(isRendered)`, which keeps exactly the same values and names the
 * narrowing for the compiler. The DOM double ignores `appendChild(null)`, so only a real document,
 * which throws on it, shows that nothing but nodes still reaches the body.
 */
test("a surface that omits its optional pieces renders only the pieces it has", async ({ isolatedWorkspace }) => {
  const { page } = isolatedWorkspace;
  await page.goto("/tasks.html");
  await expect.poll(() => page.evaluate(() => typeof globalThis.window.LongtailForge?.view?.renderSurface)).toBe("function");

  const observed = await page.evaluate(() => {
    const view = globalThis.window.LongtailForge?.view;
    if (!view?.renderSurface) throw new Error("renderSurface unavailable");
    const doc = globalThis.document;
    const host = doc.createElement("div");
    doc.body.append(host);
    try {
      const surface = view.renderSurface({ id: "sparse-e2e", pageHeader: { title: "Sparse" } }, host);
      const body = surface.querySelector(".view-renderer-body");
      return {
        failure: null,
        bodyChildren: body ? Array.from(body.childNodes, (node) => node.nodeName) : [],
      };
    } catch (error) {
      return { failure: error instanceof Error ? `${error.name}: ${error.message}` : String(error), bodyChildren: [] };
    } finally {
      host.remove();
    }
  });

  expect(observed.failure).toBeNull();
  expect(observed.bodyChildren).toHaveLength(1);
});
