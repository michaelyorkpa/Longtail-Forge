(function initSharedTags(global) {
  const namespace = global.LongtailForge = global.LongtailForge || {};

  async function loadTags(options = {}) {
    const params = new URLSearchParams({
      status: "active",
      search: options.search || "",
    });
    const response = await fetch(`/api/tags?${params}`, { cache: "no-store" });

    if (!response.ok) {
      return [];
    }

    const body = await response.json();
    return Array.isArray(body.tags) ? body.tags : [];
  }

  function renderTagList(container, tags = []) {
    if (!container) {
      return;
    }

    container.replaceChildren(...(tags.length > 0
      ? tags.map(createTagChip)
      : []));
  }

  function createTagChip(tag) {
    const chip = document.createElement("span");
    const swatch = document.createElement("span");
    const label = document.createElement("span");

    chip.className = "tag-chip";
    swatch.className = "tag-chip-swatch";
    swatch.style.backgroundColor = tag.color || "#64748b";
    swatch.setAttribute("aria-hidden", "true");
    label.textContent = tag.name || tag.slug || "Tag";
    chip.append(swatch, label);
    return chip;
  }

  async function mountPicker(container, options = {}) {
    if (!container) {
      return null;
    }

    const tags = Array.isArray(options.tags) ? options.tags : await loadTags();
    const selected = new Set(normalizeTagIds(options.selectedTags || options.selectedTagIds || []));
    const fieldset = document.createElement("fieldset");
    const legend = document.createElement("legend");
    const list = document.createElement("div");

    fieldset.className = "tag-picker";
    legend.textContent = options.label || "Tags";
    list.className = "tag-picker-options";

    tags.forEach((tag) => {
      const label = document.createElement("label");
      const input = document.createElement("input");

      input.type = "checkbox";
      input.value = tag.tag_id;
      input.checked = selected.has(tag.tag_id);
      input.dataset.tagPickerOption = "";
      label.append(input, createTagChip(tag));
      list.append(label);
    });

    fieldset.append(legend, list);
    container.replaceChildren(fieldset);

    return {
      readTagIds: () => readTagIds(container),
      setSelected: (tagIds = []) => {
        const nextIds = new Set(normalizeTagIds(tagIds));
        container.querySelectorAll("[data-tag-picker-option]").forEach((input) => {
          input.checked = nextIds.has(input.value);
        });
      },
    };
  }

  function readTagIds(container) {
    return [...(container?.querySelectorAll("[data-tag-picker-option]:checked") || [])]
      .map((input) => input.value)
      .filter(Boolean);
  }

  function normalizeTagIds(tags = []) {
    return tags.map((tag) => typeof tag === "string" ? tag : tag?.tag_id).filter(Boolean);
  }

  namespace.tags = {
    loadTags,
    mountPicker,
    readTagIds,
    renderTagList,
  };
})(window);
