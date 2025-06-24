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

// CreateIssue 相关的类型定义
export interface CreateIssueParams {
  // 必填字段
  projectKey: string;
  issueType: string;
  summary: string;
  requirementScope: string;
  description: string;
  acceptanceCriteria: string;
  
  // 可选字段
  department?: string;
  team?: string | string[];
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
  
  // 额外字段
  fields?: Record<string, any>;
}

// JIRA API 字段类型定义
export interface JiraIssueFields {
  project: {
    key: string;
  };
  issuetype: {
    name: string;
  };
  summary: string;
  description?: string;
  duedate?: string;
  priority?: {
    name: string;
  };
  assignee?: {
    name: string;
  };
  fixVersions?: Array<{
    name: string;
  }>;
  [key: string]: any; // 允许自定义字段
}

// JIRA API 创建问题的请求体类型
export interface CreateIssueRequest {
  fields: JiraIssueFields;
}

// JIRA API 创建问题的响应类型
export interface CreateIssueResponse {
  id: string;
  key: string;
  self: string;
}

// 自定义字段值类型
export interface CustomFieldValue {
  value: string;
}

export interface CustomFieldArray {
  name: string;
}

// 用于类型安全的字段映射
export type CreateIssueFieldMapping = {
  [K in keyof CreateIssueParams]: K extends 'projectKey' | 'issueType' | 'summary' | 'fields'
    ? never
    : K extends 'team' | 'developers' | 'fixVersions'
    ? string[]
    : K extends 'storyPoints' | 'functionPoints'
    ? number
    : string;
};

// 类型验证工具函数
export function validateCreateIssueParams(params: any): params is CreateIssueParams {
  // 验证必填字段
  const requiredFields: (keyof CreateIssueParams)[] = [
    'projectKey', 'issueType', 'summary', 'requirementScope', 
    'description', 'acceptanceCriteria'
  ];
  
  for (const field of requiredFields) {
    if (!params[field] || typeof params[field] !== 'string') {
      return false;
    }
  }
  
  // 验证可选字段类型
  if (params.department !== undefined && typeof params.department !== 'string') {
    return false;
  }
  
  if (params.team !== undefined && !Array.isArray(params.team) && typeof params.team !== 'string') {
    return false;
  }
  
  if (params.fixVersions !== undefined && !Array.isArray(params.fixVersions)) {
    return false;
  }
  
  if (params.testType !== undefined && typeof params.testType !== 'string') {
    return false;
  }
  
  if (params.storyPoints !== undefined && typeof params.storyPoints !== 'number') {
    return false;
  }
  
  if (params.functionPoints !== undefined && typeof params.functionPoints !== 'number') {
    return false;
  }
  
  if (params.duedate !== undefined && typeof params.duedate !== 'string') {
    return false;
  }
  
  if (params.priority !== undefined && typeof params.priority !== 'string') {
    return false;
  }
  
  if (params.assignee !== undefined && typeof params.assignee !== 'string') {
    return false;
  }
  
  if (params.developers !== undefined && !Array.isArray(params.developers)) {
    return false;
  }
  
  if (params.userInterface !== undefined && typeof params.userInterface !== 'string') {
    return false;
  }
  
  if (params.plannedCompletionDate !== undefined && typeof params.plannedCompletionDate !== 'string') {
    return false;
  }
  
  if (params.fields !== undefined && typeof params.fields !== 'object') {
    return false;
  }
  
  return true;
}

// 类型转换工具函数
export function transformToCreateIssueParams(args: any): CreateIssueParams {
  if (!validateCreateIssueParams(args)) {
    throw new Error('Invalid parameters for createIssue');
  }
  
  return {
    projectKey: args.projectKey,
    issueType: args.issueType,
    summary: args.summary,
    requirementScope: args.requirementScope,
    description: args.description,
    acceptanceCriteria: args.acceptanceCriteria,
    department: args.department,
    team: args.team,
    fixVersions: args.fixVersions,
    testType: args.testType,
    storyPoints: args.storyPoints,
    functionPoints: args.functionPoints,
    duedate: args.duedate,
    priority: args.priority,
    assignee: args.assignee,
    developers: args.developers,
    userInterface: args.userInterface,
    plannedCompletionDate: args.plannedCompletionDate,
    fields: args.fields,
  };
}
