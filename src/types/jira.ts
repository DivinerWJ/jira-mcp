export interface CleanComment {
  id: string;
  body: string;
  author: string | undefined;
  created: string;
  updated: string;
  mentions: NonNullable<CleanJiraIssue["relatedIssues"]>;
}

export interface CleanJiraIssue {
  id: string;
  key: string;
  summary: string | undefined;
  status: string | undefined;
  created: string | undefined;
  updated: string | undefined;
  description: string;
  acceptanceCriteria?: string;
  storyPoints?: number;
  functionPoints?: number;
  developers?: string[];
  comments?: CleanComment[];
  parent?: {
    id: string;
    key: string;
    summary?: string;
  };
  children?: {
    id: string;
    key: string;
    summary?: string;
  }[];
  epicLink?: {
    id: string;
    key: string;
    summary?: string;
  };
  relatedIssues: {
    key: string;
    summary?: string;
    type: "mention" | "link";
    // For formal issue links e.g. "blocks", "relates to"
    relationship?: string;
    source: "description" | "comment";
    commentId?: string;
  }[];
}

export interface SearchIssuesResponse {
  total: number;
  issues: CleanJiraIssue[];
}

// Basic Atlassian Document Format (ADF) structure for a simple paragraph
export interface AdfDoc {
  version: 1;
  type: "doc";
  content: AdfNode[];
}

export type AdfNodeType = "paragraph" | "text"; // Add other types as needed

export interface AdfNode {
  type: AdfNodeType;
  content?: AdfNode[];
  text?: string;
}

// Response structure from JIRA API after adding a comment
export interface JiraCommentResponse {
  id: string;
  self: string; // URL to the comment
  author: {
    displayName: string;
    // ... other author details
  };
  body: AdfDoc; // JIRA returns the comment body in ADF
  created: string;
  updated: string;
  // ... other fields
}

// Cleaned response for the MCP tool
export interface AddCommentResponse {
  id: string;
  author: string;
  created: string;
  updated: string;
  body: string; // Return plain text for simplicity
}

export interface JiraBaseConfig {
  JIRA_API_TOKEN: string;
  JIRA_BASE_URL: string;
  JIRA_USERNAME: string;
  JIRA_TYPE: "cloud" | "server";
}

export interface EnvJiraCustomFields {
  //  验收标准
  ACCEPTANCE_CRITERIA_FIELD?: string;
  //  故事点
  STORY_POINTS_FIELD?: string;
  //  功能点
  FUNCTION_POINTS_FIELD?: string;
  //  开发者
  DEVELOPERS_FIELD?: string;
}

// 组合类型
export type EnvJiraConfig = JiraBaseConfig & EnvJiraCustomFields;

export interface CustomFieldConfig {
  // 验收标准
  acceptanceCriteria: string;
  // 故事点
  storyPoints: string;
  // 功能点
  functionPoints: string;
  // 开发人员
  developers: string;
};