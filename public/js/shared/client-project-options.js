(function attachClientProjectOptions(global) {
  const namespace = global.LongtailForge || {};
  const WORKSPACE_SCOPE_ID = "__workspace_projects__";

  function normalizeClients(data, options = {}) {
    const includeInactive = Boolean(options.includeInactive);
    const clients = Array.isArray(data?.clients)
      ? data.clients
          .filter((client) => includeInactive || !isInactiveRecord(client))
          .map((client) => normalizeClient(client, { includeInactive }))
      : [];
    const workspaceProjects = orderProjectHierarchy(Array.isArray(data?.workspaceProjects)
      ? data.workspaceProjects
          .filter((project) => includeInactive || !isInactiveRecord(project))
          .map((project) => normalizeProject(project, "yes"))
      : []);
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

  function normalizeClient(client, options = {}) {
    const includeInactive = Boolean(options.includeInactive);
    const billable = normalizeBillable(client?.billable);

    return {
      ...client,
      id: String(client?.id || "").trim(),
      name: String(client?.name || "").trim(),
      status: isInactiveRecord(client) ? "Inactive" : "Active",
      parent_client_id: String(client?.parent_client_id || client?.parentClientId || "").trim(),
      billable,
      billingRate: parseOptionalMoney(client?.billing_rate),
      billingPeriod: normalizeOptionalBillingPeriod(client?.billing_period),
      billingRounding: normalizeOptionalBillingRounding(client?.billing_rounding),
      projects: orderProjectHierarchy(Array.isArray(client?.projects)
        ? client.projects
            .filter((project) => includeInactive || !isInactiveRecord(project))
            .map((project) => normalizeProject(project, billable))
        : []),
    };
  }

  function normalizeProject(project, fallbackBillable = "yes") {
    return {
      ...project,
      id: String(project?.id || "").trim(),
      name: String(project?.name || "").trim(),
      client_id: String(project?.client_id || project?.clientId || "").trim(),
      parent_project_id: String(project?.parent_project_id || project?.parentProjectId || "").trim(),
      status: isInactiveRecord(project) ? "Inactive" : "Active",
      billable: normalizeBillable(project?.billable, fallbackBillable),
      billingRate: parseOptionalMoney(project?.billing_rate),
      billingPeriod: normalizeOptionalBillingPeriod(project?.billing_period),
      billingRounding: normalizeOptionalBillingRounding(project?.billing_rounding),
    };
  }

  function orderClientHierarchy(clients) {
    const byId = new Map(clients.filter((client) => client.id).map((client) => [client.id, client]));
    const childrenByParent = new Map();

    clients.forEach((client) => {
      const parentId = byId.has(client.parent_client_id) ? client.parent_client_id : "";
      if (!childrenByParent.has(parentId)) {
        childrenByParent.set(parentId, []);
      }
      childrenByParent.get(parentId).push(client);
    });
    childrenByParent.forEach((children) => children.sort(compareByName));

    const ordered = [];
    const visited = new Set();

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

  function orderProjectHierarchy(projects) {
    const byId = new Map(projects.filter((project) => project.id).map((project) => [project.id, project]));
    const childrenByParent = new Map();

    projects.forEach((project) => {
      const parentId = byId.has(project.parent_project_id) ? project.parent_project_id : "";
      if (!childrenByParent.has(parentId)) {
        childrenByParent.set(parentId, []);
      }
      childrenByParent.get(parentId).push(project);
    });
    childrenByParent.forEach((children) => children.sort(compareByName));

    const ordered = [];
    const visited = new Set();

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

  function compareByName(left, right) {
    return String(left?.name || "").localeCompare(String(right?.name || ""), undefined, {
      sensitivity: "base",
    });
  }

  function workspaceProjectsLabel() {
    return namespace.getWorkspaceProjectsLabel?.() || "Projects";
  }

  function normalizeBillable(value, fallback = "yes") {
    if (value === false || value === "no") {
      return "no";
    }
    if (value === true || value === "yes") {
      return "yes";
    }
    return fallback === "no" ? "no" : "yes";
  }

  function parseOptionalMoney(value) {
    const text = String(value ?? "").trim();
    if (!text) {
      return null;
    }

    const amount = Number(text.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(amount) ? amount : null;
  }

  function normalizeOptionalBillingPeriod(period) {
    if (!period || period.type === "inherit") {
      return null;
    }

    const type = period.type === "custom" ? "custom" : "calendarMonth";
    const startDay = Math.min(28, Math.max(1, Number.parseInt(period.startDay, 10) || 1));

    return {
      type,
      startDay: type === "custom" ? startDay : 1,
    };
  }

  function normalizeOptionalBillingRounding(rounding) {
    if (!rounding || rounding.type === "inherit") {
      return null;
    }

    const increment = ["nearestHour", "nearestHalfHour", "nearestQuarterHour"].includes(rounding.increment)
      ? rounding.increment
      : "nearestQuarterHour";

    return {
      enabled: Boolean(rounding.enabled),
      increment,
    };
  }

  function isInactiveRecord(record) {
    return String(record?.status || "").trim().toLowerCase() === "inactive";
  }

  namespace.clientProjectOptions = {
    normalizeClients,
    optionLabel: (client) => client?.optionLabel || client?.displayName || client?.name || "",
  };
  global.LongtailForge = namespace;
}(window));
