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
  sprint?: string;
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
  /** 日志目录路径 (例如: /path/to/logs) */
  JIRA_LOG_DIR?: string;
  /** 日志级别: DEBUG, INFO, WARN, ERROR (例如: INFO) */
  JIRA_LOG_LEVEL?: "DEBUG" | "INFO" | "WARN" | "ERROR";
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
  /** Sprint自定义字段ID (例如: customfield_10001) */
  SPRINT_FIELD: string;
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
  originalEstimate?: string; // 原预估时间，格式如：Xw, Xd, Xh, Xm

  // 额外字段
  fields?: Record<string, any>;
}

// JIRA API 字段类型定义
export interface JiraIssueFields {
  project: {
    key: string;
  };
  issuetype: {
    name?: string;
    id?: string;
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
  [K in keyof CreateIssueParams]: K extends
    | "projectKey"
    | "issueType"
    | "summary"
    | "fields"
    ? never
    : K extends "team" | "developers" | "fixVersions"
    ? string[]
    : K extends "storyPoints" | "functionPoints"
    ? number
    : string;
};

// 类型验证工具函数
export function validateCreateIssueParams(params: any): {
  isValid: boolean;
  errors?: { field: keyof CreateIssueParams; reason: string }[];
} {
  const errors: { field: keyof CreateIssueParams; reason: string }[] = [];

  // 检查是否是子任务
  const isSubtask = params.issueType && (
    params.issueType.toLowerCase().includes("subtask") ||
    params.issueType.toLowerCase().includes("子任务")
  );

  // 验证必填字段
  // 对于子任务，只有projectKey、issueType和summary是必填的
  const requiredFields: (keyof CreateIssueParams)[] = [
    "projectKey",
    "issueType",
    "summary",
  ];
  
  // 非子任务需要额外的必填字段
  if (!isSubtask) {
    requiredFields.push(
      "requirementScope",
      "description",
      "acceptanceCriteria"
    );
  }

  for (const field of requiredFields) {
    if (!params[field] || typeof params[field] !== "string") {
      errors.push({
        field,
        reason: `必填字段 ${String(field)} 缺失或类型不是字符串`,
      });
    }
  }

  // 验证可选字段类型
  if (
    params.department !== undefined &&
    typeof params.department !== "string"
  ) {
    errors.push({
      field: "department",
      reason: "字段 department 类型必须是字符串",
    });
  }

  if (
    params.team !== undefined &&
    !Array.isArray(params.team) &&
    typeof params.team !== "string"
  ) {
    errors.push({ field: "team", reason: "字段 team 类型必须是数组或字符串" });
  }

  if (params.fixVersions !== undefined && !Array.isArray(params.fixVersions)) {
    errors.push({
      field: "fixVersions",
      reason: "字段 fixVersions 类型必须是数组",
    });
  }

  if (params.testType !== undefined && typeof params.testType !== "string") {
    errors.push({
      field: "testType",
      reason: "字段 testType 类型必须是字符串",
    });
  }

  if (
    params.storyPoints !== undefined &&
    typeof params.storyPoints !== "number"
  ) {
    errors.push({
      field: "storyPoints",
      reason: "字段 storyPoints 类型必须是数字",
    });
  }

  if (
    params.functionPoints !== undefined &&
    typeof params.functionPoints !== "number"
  ) {
    errors.push({
      field: "functionPoints",
      reason: "字段 functionPoints 类型必须是数字",
    });
  }

  if (params.duedate !== undefined && typeof params.duedate !== "string") {
    errors.push({ field: "duedate", reason: "字段 duedate 类型必须是字符串" });
  }

  if (params.priority !== undefined && typeof params.priority !== "string") {
    errors.push({
      field: "priority",
      reason: "字段 priority 类型必须是字符串",
    });
  }

  if (params.assignee !== undefined && typeof params.assignee !== "string") {
    errors.push({
      field: "assignee",
      reason: "字段 assignee 类型必须是字符串",
    });
  }

  if (params.developers !== undefined && !Array.isArray(params.developers)) {
    errors.push({
      field: "developers",
      reason: "字段 developers 类型必须是数组",
    });
  }

  if (
    params.userInterface !== undefined &&
    typeof params.userInterface !== "string"
  ) {
    errors.push({
      field: "userInterface",
      reason: "字段 userInterface 类型必须是字符串",
    });
  }

  if (
    params.plannedCompletionDate !== undefined &&
    typeof params.plannedCompletionDate !== "string"
  ) {
    errors.push({
      field: "plannedCompletionDate",
      reason: "字段 plannedCompletionDate 类型必须是字符串",
    });
  }

  if (
    params.originalEstimate !== undefined &&
    typeof params.originalEstimate !== "string"
  ) {
    errors.push({
      field: "originalEstimate",
      reason: "字段 originalEstimate 类型必须是字符串",
    });
  }

  if (params.fields !== undefined && typeof params.fields !== "object") {
    errors.push({ field: "fields", reason: "字段 fields 类型必须是对象" });
  }

  return {
    isValid: errors.length === 0,
    ...(errors.length > 0 && { errors }),
  };
}

// 类型转换工具函数
export function transformToCreateIssueParams(args: any): CreateIssueParams {
  const validationResult = validateCreateIssueParams(args);
  if (!validationResult.isValid) {
    const errorMessages = validationResult.errors
      ?.map((error) => `${error.field}: ${error.reason}`)
      .join("; ");
    throw new Error(`Invalid parameters for createIssue: ${errorMessages}`);
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
    originalEstimate: args.originalEstimate,
    fields: args.fields,
  };
}
