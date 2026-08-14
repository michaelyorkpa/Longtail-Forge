import type { AuthorizationSession } from "./http-contracts.js";

export type LinkTargetSession = AuthorizationSession & { workspace_id: string };

export type LinkTargetType = "workspace" | "client" | "project" | "task" | "note" | "list" | "user";
export type LinkTargetAccessState = "readable" | "unavailable" | "forbidden";

export interface LinkTargetClientContext {
  clientId: string;
  mode: "all" | "client" | "workspace";
}

export interface LinkTargetDirectoryContext {
  clientsById: Map<string, { id: string; label: string }>;
  isBusinessWorkspace: boolean;
  projectsById: Map<string, { id: string; label: string; clientId: string; clientName: string }>;
  workspaceId: string;
  workspaceName: string;
}

export interface LinkTargetCandidate {
  moduleId?: string;
  targetType: LinkTargetType;
  targetId: string;
  label?: string;
  subtitle?: string;
  displayLabel?: string;
  secondaryLabel?: string;
  sortKey?: string;
  sourceUrl?: string;
  title?: string;
  fullLabel?: string;
  ariaLabel?: string;
  clientId?: string;
  clientName?: string;
  listId?: string;
  noteId?: string;
  projectId?: string;
  projectName?: string;
  workspaceId?: string;
  workspaceName?: string;
  taskId?: string;
  userId?: string;
  isAvailable?: boolean;
  status?: string;
  suggestedLibraryBucket?: string;
  unavailable?: boolean;
}

export interface LinkTarget extends Required<Omit<LinkTargetCandidate, "unavailable">> {
  unavailable?: boolean;
}

export interface LinkTargetProviderOptions {
  clientContext?: LinkTargetClientContext;
  context: LinkTargetDirectoryContext;
}

export interface LinkTargetProvider {
  readonly targetTypes: readonly LinkTargetType[];
  list(
    session: LinkTargetSession,
    targetType: LinkTargetType,
    options: LinkTargetProviderOptions,
  ): Promise<LinkTargetCandidate[]>;
  read(
    session: LinkTargetSession,
    targetType: LinkTargetType,
    targetId: string,
    options: LinkTargetProviderOptions,
  ): Promise<LinkTargetCandidate | null>;
  readAccess(
    session: LinkTargetSession,
    targetType: LinkTargetType,
    targetIds: readonly string[],
  ): Promise<Map<string, LinkTargetAccessState>>;
}

export interface LinkTargetAccessCache {
  byType: Map<LinkTargetType, Map<string, LinkTargetAccessState>>;
}

