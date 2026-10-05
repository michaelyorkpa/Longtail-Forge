(function attachClientProjectOptions(global) {
  const namespace = global.LongtailForge || {};
  const WORKSPACE_SCOPE_ID = "__workspace_projects__";

  /** @typedef {import("../../../src/types/browser-contracts.js").NormalizedClientOption} NormalizedClientOption */
  /** @typedef {import("../../../src/types/browser-contracts.js").NormalizedProjectOption} NormalizedProjectOption */
  /** @typedef {import("../../../src/types/browser-contracts.js").NormalizedBillingPeriod} NormalizedBillingPeriod */
  /** @typedef {import("../../../src/types/browser-contracts.js").NormalizedBillingRounding} NormalizedBillingRounding */

  /**
   * A client before the ordering pass labels it: every field the writer constructs except the
   * three `withHierarchyLabel` adds.
   * @typedef {Omit<NormalizedClientOption, "displayName" | "hierarchyDepth" | "optionLabel">} UnlabelledClient
   */

  /**
   * A project before the ordering pass labels it, as `UnlabelledClient` is for a client.
   * @typedef {Omit<NormalizedProjectOption, "displayName" | "hierarchyDepth" | "optionLabel">} UnlabelledProject
   */

  /**
   * A member of a wire record, read the way the optional chain it replaced read it: `undefined`
   * for a missing record, and otherwise the member access itself, with the record as receiver.
   * Each original read site makes its own call, so every member is still read where and as often
   * as it was.
   * @param {unknown} record
   * @param {string} key
   * @returns {unknown}
   */
  function recordMember(record, key) {
    return record === null || record === undefined ? undefined : Reflect.get(Object(record), key, record);
  }

  /**
   * The source the normalisers spread. Spreading `Object(record)` copies exactly what spreading
   * the record copies - nothing for a missing record, a primitive's own enumerable members through
   * the same kind of wrapper, and an object's own - and gives the compiler an object to spread.
   * The members it copies stay undescribed, as the published contract leaves them.
   * @param {unknown} record
   * @returns {object}
   */
  function recordFields(record) {
    return Object(record);
  }

  /**
   * A wire list, or an empty one. The original read each list twice - once for `Array.isArray`
   * and once to filter it; the body is a parsed response with no accessors, so both reads answered
   * the same array, and this reads it once.
   * @param {unknown} record
   * @param {string} key
   * @returns {readonly unknown[]}
   */
  function recordList(record, key) {
    const list = recordMember(record, key);
    return Array.isArray(list) ? list : [];
  }

  /**
   * @param {unknown} [data]
   * @param {{ includeInactive?: boolean }} [options]
   * @returns {NormalizedClientOption[]}
   */
  function normalizeClients(data, options = {}) {
    const includeInactive = Boolean(options.includeInactive);
    const clients = recordList(data, "clients")
      .filter((client) => includeInactive || !isInactiveRecord(client))
      .map((client) => normalizeClient(client, { includeInactive }));
    const workspaceProjects = orderProjectHierarchy(recordList(data, "workspaceProjects")
      .filter((project) => includeInactive || !isInactiveRecord(project))
      .map((project) => normalizeProject(project, "yes")));
    const orderedClients = orderClientHierarchy(clients);

    if (workspaceProjects.length === 0) {
      return orderedClients;
    }

    return [
      {
        id: WORKSPACE_SCOPE_ID,
        name: workspaceProjectsLabel(),
        optionLabel: workspaceProjectsLabel(),
        displayName: workspaceProjectsLabel(),
        status: "Active",
        billable: "yes",
        billingRate: null,
        billingPeriod: null,
        billingRounding: null,
        isWorkspaceScope: true,
        hierarchyDepth: 0,
        parent_client_id: "",
        projects: workspaceProjects,
      },
      ...orderedClients,
    ];
  }

  /**
   * @param {unknown} client
   * @param {{ includeInactive?: boolean }} [options]
   * @returns {UnlabelledClient}
   */
  function normalizeClient(client, options = {}) {
    const includeInactive = Boolean(options.includeInactive);
    const billable = normalizeBillable(recordMember(client, "billable"));

    return {
      ...recordFields(client),
      id: String(recordMember(client, "id") || "").trim(),
      name: String(recordMember(client, "name") || "").trim(),
      status: isInactiveRecord(client) ? "Inactive" : "Active",
      parent_client_id: String(recordMember(client, "parent_client_id") || recordMember(client, "parentClientId") || "").trim(),
      billable,
      billingRate: parseOptionalMoney(recordMember(client, "billing_rate")),
      billingPeriod: normalizeOptionalBillingPeriod(recordMember(client, "billing_period")),
      billingRounding: normalizeOptionalBillingRounding(recordMember(client, "billing_rounding")),
      projects: orderProjectHierarchy(recordList(client, "projects")
        .filter((project) => includeInactive || !isInactiveRecord(project))
        .map((project) => normalizeProject(project, billable))),
    };
  }

  /**
   * @param {unknown} project
   * @param {"no" | "yes"} [fallbackBillable]
   * @returns {UnlabelledProject}
   */
  function normalizeProject(project, fallbackBillable = "yes") {
    return {
      ...recordFields(project),
      id: String(recordMember(project, "id") || "").trim(),
      name: String(recordMember(project, "name") || "").trim(),
      client_id: String(recordMember(project, "client_id") || recordMember(project, "clientId") || "").trim(),
      parent_project_id: String(recordMember(project, "parent_project_id") || recordMember(project, "parentProjectId") || "").trim(),
      status: isInactiveRecord(project) ? "Inactive" : "Active",
      billable: normalizeBillable(recordMember(project, "billable"), fallbackBillable),
      billingRate: parseOptionalMoney(recordMember(project, "billing_rate")),
      billingPeriod: normalizeOptionalBillingPeriod(recordMember(project, "billing_period")),
      billingRounding: normalizeOptionalBillingRounding(recordMember(project, "billing_rounding")),
    };
  }

  /**
   * @param {UnlabelledClient[]} clients
   * @returns {NormalizedClientOption[]}
   */
  function orderClientHierarchy(clients) {
    const byId = new Map(clients.filter((client) => client.id).map((client) => [client.id, client]));
    /** @type {Map<string, UnlabelledClient[]>} */
    const childrenByParent = new Map();

    clients.forEach((client) => {
      const parentId = byId.has(client.parent_client_id) ? client.parent_client_id : "";
      // The first child of a parent starts its list, as the `has`/`set` pair did before the push.
      const siblings = childrenByParent.get(parentId);
      if (siblings) {
        siblings.push(client);
      } else {
        childrenByParent.set(parentId, [client]);
      }
    });
    childrenByParent.forEach((children) => children.sort(compareByName));

    /** @type {NormalizedClientOption[]} */
    const ordered = [];
    /** @type {Set<string>} */
    const visited = new Set();

    /** @param {UnlabelledClient} client @param {number} depth */
    function appendClient(client, depth) {
      if (!client?.id || visited.has(client.id)) {
        return;
      }

      visited.add(client.id);
      ordered.push(withHierarchyLabel(client, depth));
      (childrenByParent.get(client.id) || []).forEach((child) => appendClient(child, depth + 1));
    }

    (childrenByParent.get("") || []).forEach((client) => appendClient(client, 0));
    clients
      .filter((client) => client.id && !visited.has(client.id))
      .sort(compareByName)
      .forEach((client) => appendClient(client, 0));

    return ordered;
  }

  /**
   * @param {UnlabelledClient} client
   * @param {number} depth
   * @returns {NormalizedClientOption}
   */
  function withHierarchyLabel(client, depth) {
    const prefix = depth > 0 ? `${"  ".repeat(depth)}- ` : "";
    const label = `${prefix}${client.name || "Untitled Client"}`;

    return {
      ...client,
      displayName: label,
      hierarchyDepth: depth,
      optionLabel: label,
    };
  }

  /**
   * @param {UnlabelledProject[]} projects
   * @returns {NormalizedProjectOption[]}
   */
  function orderProjectHierarchy(projects) {
    const byId = new Map(projects.filter((project) => project.id).map((project) => [project.id, project]));
    /** @type {Map<string, UnlabelledProject[]>} */
    const childrenByParent = new Map();

    projects.forEach((project) => {
      const parentId = byId.has(project.parent_project_id) ? project.parent_project_id : "";
      const siblings = childrenByParent.get(parentId);
      if (siblings) {
        siblings.push(project);
      } else {
        childrenByParent.set(parentId, [project]);
      }
    });
    childrenByParent.forEach((children) => children.sort(compareByName));

    /** @type {NormalizedProjectOption[]} */
    const ordered = [];
    /** @type {Set<string>} */
    const visited = new Set();

    /** @param {UnlabelledProject} project @param {number} depth */
    function appendProject(project, depth) {
      if (!project?.id || visited.has(project.id)) {
        return;
      }

      visited.add(project.id);
      ordered.push(withProjectHierarchyLabel(project, depth));
      (childrenByParent.get(project.id) || []).forEach((child) => appendProject(child, depth + 1));
    }

    (childrenByParent.get("") || []).forEach((project) => appendProject(project, 0));
    projects
      .filter((project) => project.id && !visited.has(project.id))
      .sort(compareByName)
      .forEach((project) => appendProject(project, 0));

    return ordered;
  }

  /**
   * @param {UnlabelledProject} project
   * @param {number} depth
   * @returns {NormalizedProjectOption}
   */
  function withProjectHierarchyLabel(project, depth) {
    const prefix = depth > 0 ? `${"  ".repeat(depth)}- ` : "";
    const label = `${prefix}${project.name || "Untitled Project"}`;

    return {
      ...project,
      displayName: label,
      hierarchyDepth: depth,
      optionLabel: label,
    };
  }

  /** @param {{ name: string }} left @param {{ name: string }} right */
  function compareByName(left, right) {
    return String(left?.name || "").localeCompare(String(right?.name || ""), undefined, {
      sensitivity: "base",
    });
  }

  function workspaceProjectsLabel() {
    return namespace.getWorkspaceProjectsLabel?.() || "Projects";
  }

  /**
   * @param {unknown} value
   * @param {string} [fallback]
   * @returns {"no" | "yes"}
   */
  function normalizeBillable(value, fallback = "yes") {
    if (value === false || value === "no") {
      return "no";
    }
    if (value === true || value === "yes") {
      return "yes";
    }
    return fallback === "no" ? "no" : "yes";
  }

  /** @param {unknown} value @returns {number | null} */
  function parseOptionalMoney(value) {
    const text = String(value ?? "").trim();
    if (!text) {
      return null;
    }

    const amount = Number(text.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(amount) ? amount : null;
  }

  /**
   * @param {unknown} period
   * @returns {NormalizedBillingPeriod | null}
   */
  function normalizeOptionalBillingPeriod(period) {
    if (!period || recordMember(period, "type") === "inherit") {
      return null;
    }

    const type = recordMember(period, "type") === "custom" ? "custom" : "calendarMonth";
    // The template performs the ToString `parseInt` performed on its argument.
    const startDay = Math.min(28, Math.max(1, Number.parseInt(`${recordMember(period, "startDay")}`, 10) || 1));

    return {
      type,
      startDay: type === "custom" ? startDay : 1,
    };
  }

  /**
   * @param {unknown} rounding
   * @returns {NormalizedBillingRounding | null}
   */
  function normalizeOptionalBillingRounding(rounding) {
    if (!rounding || recordMember(rounding, "type") === "inherit") {
      return null;
    }

    // `find` with `===` matches exactly what `includes` matched, since only strings are listed;
    // the requested increment is read once where the original read an accepted one twice.
    const requested = recordMember(rounding, "increment");
    /** @type {readonly NormalizedBillingRounding["increment"][]} */
    const increments = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"];
    const increment = increments.find((candidate) => candidate === requested) || "nearestQuarterHour";

    return {
      enabled: Boolean(recordMember(rounding, "enabled")),
      increment,
    };
  }

  /** @param {unknown} record */
  function isInactiveRecord(record) {
    return String(recordMember(record, "status") || "").trim().toLowerCase() === "inactive";
  }

  namespace.clientProjectOptions = {
    normalizeClients,
    optionLabel: (client) => client?.optionLabel || client?.displayName || client?.name || "",
  };
  global.LongtailForge = namespace;
}(window));
