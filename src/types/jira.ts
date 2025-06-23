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
  status: string | undefined;
  created: string | undefined;
  updated: string | undefined;
  summary: string | undefined;
  department?: string;
  team?: string;
  requirementScope?: string;
  description: string;
  acceptanceCriteria?: string;
  fixVersions?: string[];
  testType?: string;
  storyPoints?: number;
  functionPoints?: number;
  duedate?: string;
  priority?: string;
  assignee?: string;
  developers?: string[];
  userInterface?: string;
  plannedCompletionDate?: string;
  // issuelinks?: string[];
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
  /** Jira API令牌或密码 (例如: TOKEN) */
  JIRA_API_TOKEN: string;
  /** Jira实例URL (例如: https://your-domain.atlassian.net) */
  JIRA_BASE_URL: string;
  /** Jira用户名或邮箱 (例如: admin) */
  JIRA_USERNAME: string;
  /** Jira类型: server (默认) 或 cloud (例如: server) */
  JIRA_TYPE: "server" | "cloud";
}

export interface EnvJiraCustomFields {
  /** 部门自定义字段ID (例如: customfield_10506) */
  DEPARTMENT_FIELD: string;
  /** 团队自定义字段ID (例如: customfield_11863) */
  TEAM_FIELD: string;
  /** 需求范围自定义字段ID (例如: customfield_14501) */
  REQUIREMENT_SCOPE_FIELD: string;
  /** 验收标准自定义字段ID (例如: customfield_10555) */
  ACCEPTANCE_CRITERIA_FIELD: string;
  /** 测试类型自定义字段ID (例如: customfield_15701) */
  TEST_TYPE_FIELD: string;
  /** 故事点数自定义字段ID (例如: customfield_10006) */
  STORY_POINTS_FIELD: string;
  /** 功能点数自定义字段ID (例如: customfield_11875) */
  FUNCTION_POINTS_FIELD: string;
  /** 开发人员自定义字段ID (例如: customfield_11637) */
  DEVELOPERS_FIELD: string;
  /** 是否包含用户可操作页面自定义字段ID (例如: customfield_13901) */
  USER_INTERFACE_FIELD: string;
  /** 计划开发完成日期自定义字段ID (例如: customfield_13632) */
  PLANNED_COMPLETION_DATE_FIELD: string;
}

// 组合类型
export type EnvJiraConfig = JiraBaseConfig & EnvJiraCustomFields;
