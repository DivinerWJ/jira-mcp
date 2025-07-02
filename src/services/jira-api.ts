import {
  AddCommentResponse,
  AdfDoc,
  CleanComment,
  CleanJiraIssue,
  JiraCommentResponse,
  SearchIssuesResponse,
  EnvJiraCustomFields,
  CreateIssueParams,
  CreateIssueRequest,
  CreateIssueResponse,
  CustomFieldValue,
  CustomFieldArray,
} from "../types/jira.js";
import { logger } from "../utils/logger.js";

export class JiraApiService {
  protected baseUrl: string;
  protected headers: Headers;
  protected server?: any; // MCP Server实例
  protected sseTransport?: any; // SSE Transport实例

  // 日志通知方法（上移，确保所有方法都能访问到）
  protected notifyApiOperation(operation: string, params: any) {
    if (this.server) {
      this.server.sendLoggingMessage({
        level: "debug",
        data: { operation, params },
        logger: "JIRA-API",
      });
    }
    logger.info(`JIRA API 操作: ${operation}`, params);
  }

  protected notifyApiSuccess(operation: string, result: any) {
    if (this.server) {
      this.server.sendLoggingMessage({
        level: "debug",
        data: { operation, result },
        logger: "JIRA-API",
      });
    }
    logger.info(`JIRA API 成功: ${operation}`, result);
  }

  protected notifyApiError(operation: string, error: any) {
    if (this.server) {
      this.server.sendLoggingMessage({
        level: "error",
        data: {
          message: `${operation}操作失败`,
          error: error?.toString?.() || String(error),
        },
        logger: "JIRA-API",
      });
    }
    logger.error(
      `JIRA API 错误: ${operation}`,
      error instanceof Error ? error : undefined,
      error,
    );
  }

  // 定义可配置字段及对应缺省值
  private static readonly CUSTOM_FIELD: EnvJiraCustomFields = {
    DEPARTMENT_FIELD: process.env.DEPARTMENT_FIELD || "customfield_10506",
    TEAM_FIELD: process.env.TEAM_FIELD || "customfield_11863",
    REQUIREMENT_SCOPE_FIELD:
      process.env.REQUIREMENT_SCOPE_FIELD || "customfield_14501",
    ACCEPTANCE_CRITERIA_FIELD:
      process.env.ACCEPTANCE_CRITERIA_FIELD || "customfield_10555",
    TEST_TYPE_FIELD: process.env.TEST_TYPE_FIELD || "customfield_15701",
    STORY_POINTS_FIELD: process.env.STORY_POINTS_FIELD || "customfield_10006",
    FUNCTION_POINTS_FIELD:
      process.env.FUNCTION_POINTS_FIELD || "customfield_11875",
    DEVELOPERS_FIELD: process.env.DEVELOPERS_FIELD || "customfield_11637",
    USER_INTERFACE_FIELD:
      process.env.USER_INTERFACE_FIELD || "customfield_13901",
    PLANNED_COMPLETION_DATE_FIELD:
      process.env.PLANNED_COMPLETION_DATE_FIELD || "customfield_13632",
  };

  // 设置Server实例的方法
  setServer(server: any) {
    this.server = server;
  }

  // 设置SSE Transport的方法
  setSseTransport(transport: any) {
    this.sseTransport = transport;
  }

  constructor(baseUrl: string, username: string, apiToken: string) {
    this.baseUrl = baseUrl;
    const auth = Buffer.from(`${username}:${apiToken}`).toString("base64");
    this.headers = new Headers({
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    });
  }

  protected async handleFetchError(
    response: Response,
    responseBody: any,
    url?: string,
  ): Promise<never> {
    if (!response.ok) {
      let message = response.statusText;
      let errorData = responseBody;
      try {
        if (
          Array.isArray((errorData as any).errorMessages) &&
          (errorData as any).errorMessages.length > 0
        ) {
          message = (errorData as any).errorMessages.join("; ");
        } else if ((errorData as any).message) {
          message = (errorData as any).message;
          // 判断是否是对象
        } else if (typeof (errorData as any).errors === "object") {
          // 将对象按照`key: value; key: value`形式输出字符串
          message = Object.entries((errorData as any).errors)
            .map(([key, value]) => `${key}: ${value}`)
            .join("; ");
        } else if ((errorData as any).errorMessage) {
          message = (errorData as any).errorMessage;
        }
      } catch (e) {
        console.warn("Could not parse JIRA error response body as JSON.");
      }

      const details = JSON.stringify(errorData, null, 2);
      console.error("JIRA API Error Details:", details);

      const errorMessage = message ? `: ${message}` : "";
      throw new Error(
        `JIRA API Error${errorMessage} (Status: ${response.status})`,
      );
    }

    throw new Error("Unknown error occurred during fetch operation.");
  }

  /**
   * Extracts issue mentions from Atlassian document content
   * Looks for nodes that were auto-converted to issue links
   */
  protected extractIssueMentions(
    content: any[],
    source: "description" | "comment",
    commentId?: string,
  ): CleanJiraIssue["relatedIssues"] {
    const mentions: NonNullable<CleanJiraIssue["relatedIssues"]> = [];

    const processNode = (node: any) => {
      if (node.type === "inlineCard" && node.attrs?.url) {
        const match = node.attrs.url.match(/\/browse\/([A-Z]+-\d+)/);
        if (match) {
          mentions.push({
            key: match[1],
            type: "mention",
            source,
            commentId,
          });
        }
      }

      if (node.type === "text" && node.text) {
        const matches = node.text.match(/[A-Z]+-\d+/g) || [];
        matches.forEach((key: string) => {
          mentions.push({
            key,
            type: "mention",
            source,
            commentId,
          });
        });
      }

      if (node.content) {
        node.content.forEach(processNode);
      }
    };

    content.forEach(processNode);
    return [...new Map(mentions.map((m) => [m.key, m])).values()];
  }

  protected cleanComment(comment: {
    id: string;
    body?: {
      content?: any[];
    };
    author?: {
      displayName?: string;
    };
    created: string;
    updated: string;
  }): CleanComment {
    const body = comment.body?.content
      ? this.extractTextContent(comment.body.content)
      : "";
    const mentions = comment.body?.content
      ? this.extractIssueMentions(comment.body.content, "comment", comment.id)
      : [];

    return {
      id: comment.id,
      body,
      author: comment.author?.displayName,
      created: comment.created,
      updated: comment.updated,
      mentions: mentions,
    };
  }

  /**
   * Recursively extracts text content from Atlassian Document Format nodes
   */
  protected extractTextContent(content: any[]): string {
    if (!Array.isArray(content)) return "";

    return content
      .map((node) => {
        if (node.type === "text") {
          return node.text || "";
        }
        if (node.content) {
          return this.extractTextContent(node.content);
        }
        return "";
      })
      .join("");
  }

  protected cleanIssue(issue: any): CleanJiraIssue {
    const description = issue.fields?.description?.content
      ? this.extractTextContent(issue.fields.description.content)
      : issue.fields?.description || "";

    const cleanedIssue: CleanJiraIssue = {
      id: issue.id,
      key: issue.key,
      summary: issue.fields?.summary,
      status: issue.fields?.status?.name,
      created: issue.fields?.created,
      updated: issue.fields?.updated,
      description,
      relatedIssues: [],
    };

    if (issue.fields?.description?.content) {
      const mentions = this.extractIssueMentions(
        issue.fields.description.content,
        "description",
      );
      if (mentions.length > 0) {
        cleanedIssue.relatedIssues = mentions;
      }
    }

    if (issue.fields?.issuelinks?.length > 0) {
      const links = issue.fields.issuelinks.map((link: any) => {
        const linkedIssue = link.inwardIssue || link.outwardIssue;
        const relationship = link.type.inward || link.type.outward;
        return {
          key: linkedIssue.key,
          summary: linkedIssue.fields?.summary,
          type: "link" as const,
          relationship,
          source: "description" as const,
        };
      });

      cleanedIssue.relatedIssues = [
        ...(cleanedIssue.relatedIssues || []),
        ...links,
      ];
    }

    if (issue.fields?.parent) {
      cleanedIssue.parent = {
        id: issue.fields.parent.id,
        key: issue.fields.parent.key,
        summary: issue.fields.parent.fields?.summary,
      };
    }

    if (issue.fields?.customfield_10014) {
      cleanedIssue.epicLink = {
        id: issue.fields.customfield_10014,
        key: issue.fields.customfield_10014,
        summary: undefined,
      };
    }

    if (issue.fields?.subtasks?.length > 0) {
      cleanedIssue.children = issue.fields.subtasks.map((subtask: any) => ({
        id: subtask.id,
        key: subtask.key,
        summary: subtask.fields?.summary,
      }));
    }

    return cleanedIssue;
  }

  protected async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const fullUrl = this.baseUrl + url;
    logger.debug("JIRA API 请求", {
      url: fullUrl,
      method: init?.method || "GET",
      headers: Object.fromEntries(this.headers.entries()),
    });

    try {
      const response = await fetch(fullUrl, {
        ...init,
        headers: this.headers,
      });
      let data = null;
      try {
        data = await response?.json();
      } catch (err) {}

      if (!response.ok) {
        logger.error(
          "JIRA API 请求失败",
          new Error(`HTTP ${response.status}: ${response.statusText}`),
          {
            url: fullUrl,
            status: response.status,
            statusText: response.statusText,
            responseData: data,
          },
        );
        await this.handleFetchError(response, data, url);
      }

      logger.debug("JIRA API 请求成功", {
        url: fullUrl,
        status: response.status,
        dataSize: JSON.stringify(data).length,
      });

      return data;
    } catch (error) {
      logger.error("JIRA API 请求异常", error as Error, {
        url: fullUrl,
        method: init?.method || "GET",
      });
      throw error;
    }
  }

  async searchIssues(searchString: string): Promise<SearchIssuesResponse> {
    try {
      const params = new URLSearchParams({
        jql: searchString,
        maxResults: "50",
        fields: [
          "id",
          "key",
          "summary",
          "description",
          "status",
          "created",
          "updated",
          "parent",
          "subtasks",
          "customfield_10014",
          "issuelinks",
          ...Object.values(JiraApiService.CUSTOM_FIELD),
        ].join(","),
        expand: "names,renderedFields",
      });

      this.notifyApiOperation("搜索问题-start", {
        jql: searchString,
        query: params.toString(),
        queryObject: Object.fromEntries(params),
      });

      const response = await this.fetchJson<{
        total: number;
        issues: any[];
      }>(`/rest/api/3/search?${params}`);

      this.notifyApiSuccess("搜索问题-success", {
        total: response.total,
        issuesCount: response.issues.length,
      });

      logger.logApiCall(
        "searchIssues",
        { searchString },
        {
          total: response.total,
          issuesCount: response.issues.length,
        },
      );

      return {
        total: response.total,
        issues: response.issues.map((issue) => this.cleanIssue(issue)),
      };
    } catch (error) {
      this.notifyApiError("搜索问题-error", error);
      logger.logApiCall(
        "searchIssues",
        { searchString },
        undefined,
        error as Error,
      );
      console.error("Error searching issues:", error);
      throw error;
    }
  }

  async getEpicChildren(epicKey: string): Promise<CleanJiraIssue[]> {
    const params = new URLSearchParams({
      jql: `"Epic Link" = ${epicKey}`,
      maxResults: "100",
      fields: [
        "id",
        "key",
        "summary",
        "description",
        "status",
        "created",
        "updated",
        "parent",
        "subtasks",
        "customfield_10014",
        "issuelinks",
        ...Object.values(JiraApiService.CUSTOM_FIELD),
      ].join(","),
      expand: "names,renderedFields",
    });

    const data = await this.fetchJson<any>(`/rest/api/3/search?${params}`);

    const issuesWithComments = await Promise.all(
      data.issues.map(async (issue: any) => {
        const commentsData = await this.fetchJson<any>(
          `/rest/api/3/issue/${issue.key}/comment`,
        );
        const cleanedIssue = this.cleanIssue(issue);
        const comments = commentsData.comments.map((comment: any) =>
          this.cleanComment(comment),
        );

        const commentMentions = comments.flatMap(
          (comment: CleanComment) => comment.mentions,
        );
        cleanedIssue.relatedIssues = [
          ...cleanedIssue.relatedIssues,
          ...commentMentions,
        ];

        cleanedIssue.comments = comments;
        return cleanedIssue;
      }),
    );

    return issuesWithComments;
  }

  async getIssueWithComments(issueId: string): Promise<CleanJiraIssue> {
    const params = new URLSearchParams({
      fields: [
        "id",
        "key",
        "summary",
        "description",
        "status",
        "created",
        "updated",
        "parent",
        "subtasks",
        "customfield_10014",
        "issuelinks",
        ...Object.values(JiraApiService.CUSTOM_FIELD),
      ].join(","),
      expand: "names,renderedFields",
    });

    let issueData, commentsData;
    try {
      [issueData, commentsData] = await Promise.all([
        this.fetchJson<any>(`/rest/api/3/issue/${issueId}?${params}`),
        this.fetchJson<any>(`/rest/api/3/issue/${issueId}/comment`),
      ]);
    } catch (error: any) {
      if (error instanceof Error && error.message.includes("(Status: 404)")) {
        throw new Error(`Issue not found: ${issueId}`);
      }

      throw error;
    }

    const issue = this.cleanIssue(issueData);
    // 添加自定义字段到返回结果
    issue.acceptanceCriteria =
      issueData.fields?.[JiraApiService.CUSTOM_FIELD.ACCEPTANCE_CRITERIA_FIELD];
    issue.department =
      issueData.fields?.[JiraApiService.CUSTOM_FIELD.DEPARTMENT_FIELD];
    issue.team = issueData.fields?.[JiraApiService.CUSTOM_FIELD.TEAM_FIELD];
    issue.requirementScope =
      issueData.fields?.[JiraApiService.CUSTOM_FIELD.REQUIREMENT_SCOPE_FIELD];
    issue.testType =
      issueData.fields?.[JiraApiService.CUSTOM_FIELD.TEST_TYPE_FIELD];
    issue.storyPoints =
      issueData.fields?.[JiraApiService.CUSTOM_FIELD.STORY_POINTS_FIELD];
    issue.functionPoints =
      issueData.fields?.[JiraApiService.CUSTOM_FIELD.FUNCTION_POINTS_FIELD];
    issue.developers =
      issueData.fields?.[JiraApiService.CUSTOM_FIELD.DEPARTMENT_FIELD];
    issue.userInterface =
      issueData.fields?.[JiraApiService.CUSTOM_FIELD.USER_INTERFACE_FIELD];
    issue.plannedCompletionDate =
      issueData.fields?.[
        JiraApiService.CUSTOM_FIELD.PLANNED_COMPLETION_DATE_FIELD
      ];

    const comments = commentsData.comments.map((comment: any) =>
      this.cleanComment(comment),
    );

    const commentMentions = comments.flatMap(
      (comment: CleanComment) => comment.mentions,
    );
    issue.relatedIssues = [...issue.relatedIssues, ...commentMentions];

    issue.comments = comments;

    if (issue.epicLink) {
      try {
        const epicData = await this.fetchJson<any>(
          `/rest/api/3/issue/${issue.epicLink.key}?fields=summary`,
        );
        issue.epicLink.summary = epicData.fields?.summary;
      } catch (error) {
        console.error("Failed to fetch epic details:", error);
      }
    }

    return issue;
  }

  /**
   * 转换字段到 JIRA API 格式的公共方法
   * @param fields 输入字段
   * @param targetFields 目标字段对象
   */
  private transformFieldsToJiraFormat(
    fields: Record<string, any>,
    targetFields: Record<string, any>,
  ): void {
    // 处理自定义字段转换
    if (fields.department) {
      targetFields[JiraApiService.CUSTOM_FIELD.DEPARTMENT_FIELD] = {
        value: fields.department,
      } as CustomFieldValue;
    }

    if (fields.team) {
      if (Array.isArray(fields.team)) {
        targetFields[JiraApiService.CUSTOM_FIELD.TEAM_FIELD] = fields.team;
      } else {
        targetFields[JiraApiService.CUSTOM_FIELD.TEAM_FIELD] = [fields.team];
      }
    }

    if (fields.requirementScope) {
      targetFields[JiraApiService.CUSTOM_FIELD.REQUIREMENT_SCOPE_FIELD] = {
        value: fields.requirementScope,
      } as CustomFieldValue;
    }

    if (fields.description) {
      targetFields.description = fields.description;
    }

    if (fields.acceptanceCriteria) {
      targetFields[JiraApiService.CUSTOM_FIELD.ACCEPTANCE_CRITERIA_FIELD] =
        fields.acceptanceCriteria;
    }

    if (fields.fixVersions && Array.isArray(fields.fixVersions)) {
      targetFields.fixVersions = fields.fixVersions.map(
        (version: string) =>
          ({
            name: version,
          } as CustomFieldArray),
      );
    }

    if (fields.testType) {
      targetFields[JiraApiService.CUSTOM_FIELD.TEST_TYPE_FIELD] = {
        value: fields.testType,
      } as CustomFieldValue;
    }

    if (typeof fields.storyPoints === "number") {
      targetFields[JiraApiService.CUSTOM_FIELD.STORY_POINTS_FIELD] =
        fields.storyPoints;
    }

    if (typeof fields.functionPoints === "number") {
      targetFields[JiraApiService.CUSTOM_FIELD.FUNCTION_POINTS_FIELD] =
        fields.functionPoints;
    }

    if (fields.duedate) {
      targetFields.duedate = fields.duedate;
    }

    if (fields.priority) {
      targetFields.priority = { name: fields.priority };
    }

    if (fields.assignee) {
      targetFields.assignee = { name: fields.assignee };
    }

    if (fields.developers && Array.isArray(fields.developers)) {
      targetFields[JiraApiService.CUSTOM_FIELD.DEVELOPERS_FIELD] =
        fields.developers.map((developer: string) => ({ name: developer }));
    }

    if (fields.userInterface) {
      targetFields[JiraApiService.CUSTOM_FIELD.USER_INTERFACE_FIELD] = {
        value: fields.userInterface,
      } as CustomFieldValue;
    }

    if (fields.plannedCompletionDate) {
      targetFields[JiraApiService.CUSTOM_FIELD.PLANNED_COMPLETION_DATE_FIELD] =
        fields.plannedCompletionDate;
    }
  }

  async createIssue(params: CreateIssueParams): Promise<CreateIssueResponse> {
    const { fields: extraFields, ...fields } = params;
    const payload: CreateIssueRequest = {
      fields: {
        project: {
          key: fields.projectKey,
        },
        issuetype: {
          name: fields.issueType,
        },
        summary: fields.summary,
        ...extraFields,
      },
    };

    // 使用公共方法转换字段
    this.transformFieldsToJiraFormat(fields, payload.fields);

    // 判断issueType是否是英文名称，不是英文则去接口查对应 id
    if (!/^[a-zA-Z0-9]+$/.test(fields.issueType)) {
      // 从接口获取issueType名称所对应的issueTypeId，避免翻译问题导致问题名称无法匹配
      const projectsMeta = await this.fetchJson<any>(
        `/rest/api/3/issue/createmeta?projectKeys=${fields.projectKey}`,
      );
      if (projectsMeta.projects && projectsMeta.projects[0]) {
        const issueTypeId = projectsMeta.projects[0].issuetypes.find(
          (issueType: any) => issueType.name === fields.issueType,
        )?.id;

        payload.fields.issuetype = {
          id: issueTypeId,
        };
      }
    }

    // 发送操作开始通知
    this.notifyApiOperation("创建问题-start", {
      payload,
    });

    return this.fetchJson<CreateIssueResponse>("/rest/api/3/issue", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateIssue(
    issueKey: string,
    fields: Record<string, any>,
  ): Promise<void> {
    try {
      // 发送操作开始通知
      this.notifyApiOperation("更新问题", { issueKey, fields });

      const payload: any = {
        fields: {},
      };

      // 使用公共方法转换字段
      this.transformFieldsToJiraFormat(fields, payload.fields);

      await this.fetchJson<void>(`/rest/api/3/issue/${issueKey}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      // 发送操作成功通知
      this.notifyApiSuccess("更新问题", { issueKey });
    } catch (error) {
      // 发送操作失败通知
      this.notifyApiError("更新问题", error);
      console.error(`Error updating issue ${issueKey}:`, error);
      throw error;
    }
  }

  async getTransitions(
    issueKey: string,
  ): Promise<Array<{ id: string; name: string; to: { name: string } }>> {
    const data = await this.fetchJson<any>(
      `/rest/api/3/issue/${issueKey}/transitions`,
    );
    return data.transitions;
  }

  async transitionIssue(
    issueKey: string,
    transitionId: string,
    comment?: string,
  ): Promise<void> {
    const payload: any = {
      transition: { id: transitionId },
    };

    if (comment) {
      payload.update = {
        comment: [
          {
            add: {
              body: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: comment,
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      };
    }

    await this.fetchJson(`/rest/api/3/issue/${issueKey}/transitions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async addAttachment(
    issueKey: string,
    file: Buffer,
    filename: string,
  ): Promise<{ id: string; filename: string }> {
    const formData = new FormData();
    formData.append("file", new Blob([file]), filename);

    const headers = new Headers(this.headers);
    headers.delete("Content-Type");
    headers.set("X-Atlassian-Token", "no-check");

    const response = await fetch(
      `${this.baseUrl}/rest/api/3/issue/${issueKey}/attachments`,
      {
        method: "POST",
        headers,
        body: formData,
      },
    );

    const data = await response.json();

    if (!response.ok) {
      await this.handleFetchError(response, data);
    }

    const attachment = data[0];
    return {
      id: attachment.id,
      filename: attachment.filename,
    };
  }

  /**
   * Converts plain text to a basic Atlassian Document Format (ADF) structure.
   */
  private createAdfFromBody(text: string): AdfDoc {
    return {
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: text,
            },
          ],
        },
      ],
    };
  }

  /**
   * Adds a comment to a JIRA issue.
   */
  async addCommentToIssue(
    issueIdOrKey: string,
    body: string,
  ): Promise<AddCommentResponse> {
    const adfBody = this.createAdfFromBody(body);

    const payload = {
      body: adfBody,
    };

    const response = await this.fetchJson<JiraCommentResponse>(
      `/rest/api/3/issue/${issueIdOrKey}/comment`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    return {
      id: response.id,
      author: response.author.displayName,
      created: response.created,
      updated: response.updated,
      body: this.extractTextContent(response.body.content),
    };
  }

  /**
   * 批量对多个问题执行相同的状态转换
   * @param issueKeys 要执行状态转换的问题键数组
   * @param transitionId 要执行的转换ID
   * @param comment 可选的评论（将添加到每个问题）
   * @returns 包含成功和失败信息的结果
   */
  async batchTransitionIssues(
    issueKeys: string[],
    transitionId: string,
    comment?: string,
  ): Promise<void> {
    // 发送操作开始通知
    this.notifyApiOperation("批量状态转换-开始", {
      issueKeys,
      transitionId,
      commentProvided: !!comment,
    });

    for (const issueKey of issueKeys) {
      await this.transitionIssue(issueKey, transitionId, comment);
    }

    // 发送操作成功通知
    this.notifyApiSuccess("批量状态转换-完成", {
      total: issueKeys.length,
    });
  }
}
