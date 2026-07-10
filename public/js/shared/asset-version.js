(() => {
  const namespace = window.LongtailForge = window.LongtailForge || {};
  const value = String(document.querySelector?.("meta[data-asset-version]")?.content || "").trim();
  const externalUrlPrefix = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

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
