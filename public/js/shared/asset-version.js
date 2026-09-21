(() => {
  const namespace = window.LongtailForge = window.LongtailForge || {};
  // The versioned meta is queried as an `Element`, and `content` belongs to
  // `HTMLMetaElement` rather than to every element, so it is read the way the optional
  // access read it: a page without that meta, and a stand-in that is not an element,
  // both still answer the empty string.
  const versionMeta = document.querySelector?.("meta[data-asset-version]");
  const value = String(Reflect.get(Object(versionMeta), "content", versionMeta) || "").trim();
  const externalUrlPrefix = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

  /** @param {string} assetUrl @returns {string} */
  function url(assetUrl) {
    const source = String(assetUrl || "").trim();
    if (!source || !value || externalUrlPrefix.test(source)) {
      return source;
    }

    const hashIndex = source.indexOf("#");
    const hash = hashIndex >= 0 ? source.slice(hashIndex) : "";
    const withoutHash = hashIndex >= 0 ? source.slice(0, hashIndex) : source;
    const queryIndex = withoutHash.indexOf("?");
    const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
    const search = new URLSearchParams(queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : "");

    search.set("v", value);
    return `${pathname}?${search.toString()}${hash}`;
  }

  namespace.assetVersion = Object.freeze({ url, value });
})();
