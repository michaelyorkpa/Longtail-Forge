import type { RequestSession } from "./http-contracts.js";

export type HelpOwnerType = "framework" | "module";

export interface HelpContributionRequirements {
  requiredPermissions?: string[];
  requiredWorkspaceCapabilities?: string[];
  requiredModules?: string[];
  terminology?: Record<string, Record<string, string>>;
}

export interface HelpSection extends HelpContributionRequirements {
  id: string;
  title: string;
  description?: string;
  sortOrder?: number;
  audience?: string;
  tags?: string[];
  ownerType?: HelpOwnerType;
  moduleId?: string;
  sourceLabel?: string;
}

export interface HelpArticle extends HelpContributionRequirements {
  id: string;
  title: string;
  slug?: string;
  sectionId?: string;
  summary?: string;
  description?: string;
  body?: string;
  contentPath?: string;
  sortOrder?: number;
  audience?: string;
  tags?: string[];
  relatedArticleIds?: string[];
  ownerType?: HelpOwnerType;
  moduleId?: string;
  sourceLabel?: string;
}

export type HydratedHelpArticle = HelpArticle & { body: string };

export interface HelpContribution {
  sections: HelpSection[];
  articles: HelpArticle[];
}

export interface HydratedHelpContribution {
  sections: HelpSection[];
  articles: HydratedHelpArticle[];
}

export interface HelpNavigationItem {
  articlePath?: string;
  audience?: string;
  children: HelpNavigationItem[];
  id?: string;
  moduleId?: string;
  ownerType?: HelpOwnerType;
  slug?: string;
  sourceLabel?: string;
  title: string;
  type: "article" | "group";
}

export interface HelpNavigation {
  defaultArticle: HelpArticle | HelpNavigationItem | null;
  items: HelpNavigationItem[];
}

export interface HelpSectionPayload {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  audience: string;
  tags: string[];
  ownerType: HelpOwnerType;
  moduleId: string;
  sourceLabel: string;
}

export interface HelpArticleListPayload {
  id: string;
  slug: string;
  sectionId: string;
  title: string;
  summary: string;
  description: string;
  sortOrder: number;
  audience: string;
  tags: string[];
  relatedArticleIds: string[];
  ownerType: HelpOwnerType;
  moduleId: string;
  sourceLabel: string;
}

export interface HelpArticleDetailPayload extends HelpArticleListPayload {
  body: string;
  bodyFormat: "markdown";
  bodyMarkdown: string;
  bodyHtml: string;
  bodyHtmlFormat: "html";
  section: HelpSectionPayload | null;
}

export interface HelpListResponse {
  sections: HelpSectionPayload[];
  articles: HelpArticleListPayload[];
  defaultArticleId: string;
  defaultArticleSlug: string;
  navigation: HelpNavigationItem[];
}

export interface HelpReadResponse {
  article: HelpArticleDetailPayload;
}

export interface HelpSearchIndexOptions {
  moduleId?: unknown;
  module_id?: unknown;
  recordId?: unknown;
  record_id?: unknown;
}

export interface HelpSearchDocument {
  workspace_id: string;
  module_id: string;
  record_type: string;
  id: string;
  title: string;
  summary: string;
  body: string;
  sectionTitle: string;
  ownerLabel: string;
  tagsText: string;
  tags_text: string;
  search_status: "active";
  source: string;
  record_created_at: string;
  record_updated_at: string;
}

export type HelpRequestSession = RequestSession & { workspace_id: string };

export interface FrameworkProtectedView {
  id: string;
  file: string;
  requiredPermission?: string;
  supportViewOperatorOnly?: boolean;
}

export interface ProtectedModuleView {
  file: string;
}

export type ProtectedModuleViewResolution =
  | null
  | {
      status: "ok";
      statusCode: 200;
      view: ProtectedModuleView;
    }
  | {
      status: "not_found" | "module_disabled" | "unavailable" | "unauthorized";
      statusCode: number;
      message: string;
      view: ProtectedModuleView;
    };

export interface StaticResolutionOptions {
  legalDocumentId?: string | null | undefined;
  protectedHtml?: boolean;
}

export interface StaticResolvedPath {
  filePath: string | null;
  headers: Record<string, string>;
  legalDocumentId: string;
  protectedHtml: boolean;
  statusCode?: number;
  message?: string;
}

export interface StaticDeniedPath {
  filePath?: null;
  headers?: Record<string, string>;
  legalDocumentId?: string;
  protectedHtml?: boolean;
  statusCode: number;
  message: string;
}

export type StaticPathResolution = StaticResolvedPath | StaticDeniedPath;

export interface StaticReadResponse {
  statusCode: number;
  contents: string | Buffer;
  contentType: string;
  headers?: Record<string, string>;
}

export interface InitialTheme {
  theme: "dark" | "light";
  themeAutoSource: string;
  themeMode: string;
}

export type StaticRequestSession = RequestSession | null;

export type StaticThemeSession =
  | (RequestSession & { session_mode: "account_export_recovery" })
  | (RequestSession & { workspace_id: string });
