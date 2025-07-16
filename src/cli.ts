#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { JiraApiService } from "./services/jira-api.js";
import { JiraServerApiService } from "./services/jira-server-api.js";
import { logger } from "./utils/logger.js";
import { getVersionInfo } from "./utils/version.js";

import {
  JiraBaseConfig,
  EnvJiraConfig,
  transformToCreateIssueParams,
} from "./types/jira.ts";

declare module "bun" {
  interface Env extends EnvJiraConfig {}
}

export class JiraServer {
  private server: Server;
  private jiraApi: JiraApiService;

  private jiraConfig: JiraBaseConfig;
  protected sseTransport: any = null;
  private versionInfo: ReturnType<typeof getVersionInfo>;

  constructor() {
    // 读取版本信息
    this.versionInfo = getVersionInfo();

    // 使用环境变量重载工具获取最新配置
    this.jiraConfig = {
      JIRA_BASE_URL: process.env.JIRA_BASE_URL,
      JIRA_USERNAME: process.env.JIRA_USERNAME,
      JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
      JIRA_TYPE: process.env.JIRA_TYPE || "server",
      JIRA_LOG_DIR: process.env.JIRA_LOG_DIR,
      JIRA_LOG_LEVEL:
        (process.env.JIRA_LOG_LEVEL as "DEBUG" | "INFO" | "WARN" | "ERROR") ||
        "INFO",
    };

    logger.info(`JIRA MCP Server v${this.versionInfo.version} 初始化开始`, {
      version: this.versionInfo.version,
      mcpServerVersion: this.versionInfo.mcpServerVersion,
      baseUrl: this.jiraConfig.JIRA_BASE_URL,
      username: this.jiraConfig.JIRA_USERNAME,
      type: this.jiraConfig.JIRA_TYPE,
      logDir: this.jiraConfig.JIRA_LOG_DIR,
      logLevel: this.jiraConfig.JIRA_LOG_LEVEL,
    });

    this.server = new Server(
      {
        name: "jira-mcp",
        version: this.versionInfo.mcpServerVersion,
      },
      {
        capabilities: {
          tools: {},
          logging: {},
        },
      },
    );

    if (this.jiraConfig.JIRA_TYPE === "server") {
      this.jiraApi = new JiraServerApiService(
        this.jiraConfig.JIRA_BASE_URL,
        this.jiraConfig.JIRA_USERNAME,
        this.jiraConfig.JIRA_API_TOKEN,
      );
    } else {
      this.jiraApi = new JiraApiService(
        this.jiraConfig.JIRA_BASE_URL,
        this.jiraConfig.JIRA_USERNAME,
        this.jiraConfig.JIRA_API_TOKEN,
      );
    }
    logger.info(
      `使用 JIRA API 服务类型: ${
        this.jiraConfig.JIRA_TYPE === "server" ? "Server" : "Cloud"
      }`,
    );

    // 将server实例传递给jiraApi
    this.jiraApi.setServer(this.server);

    this.setupToolHandlers();

    this.server.onerror = (error) => {
      logger.error("MCP Server 错误", error);
    };

    process.on("SIGINT", async () => {
      logger.info("收到 SIGINT 信号，正在关闭服务器...");
      await this.server.close();
      logger.info("服务器已关闭");
      process.exit(0);
    });

    logger.info(`JIRA MCP Server v${this.versionInfo.version} 初始化完成`);
  }

  protected setJiraConfig(config: JiraBaseConfig): JiraBaseConfig {
    this.jiraConfig = config;
    return this.jiraConfig;
  }

  protected getJiraConfig(): JiraBaseConfig {
    return this.jiraConfig;
  }

  protected setSseTransport(transport: any) {
    this.sseTransport = transport;
    if (this.jiraApi) {
      this.jiraApi.setSseTransport(transport);
    }
  }

  protected getSseTransport() {
    return this.sseTransport;
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search_issues",
          description: "通过搜索条件搜索Jira中的issue",
          inputSchema: {
            type: "object",
            properties: {
              searchString: {
                type: "string",
                description:
                  "JQL 搜索字符串。注意：在JQL中使用问题类型时，必须使用英文名称（如：Story、Task、Bug等），不支持中文问题类型名称。",
              },
            },
            required: ["searchString"],
            additionalProperties: false,
          },
        },
        {
          name: "get_epic_children",
          description: "通过史诗问题的键获取所有子问题（包括评论）",
          inputSchema: {
            type: "object",
            properties: {
              epicKey: {
                type: "string",
                description: "史诗问题的键",
              },
            },
            required: ["epicKey"],
            additionalProperties: false,
          },
        },
        {
          name: "get_issue",
          description: "通过问题的键或ID获取详细信息（包括评论）",
          inputSchema: {
            type: "object",
            properties: {
              issueId: {
                type: "string",
                description: "JIRA 问题的 ID 或键",
              },
            },
            required: ["issueId"],
            additionalProperties: false,
          },
          outputSchema: {
            type: "object",
          },
        },
        {
          name: "create_issues",
          description: "批量创建多个Jira问题（支持单个或多个）",
          inputSchema: {
            type: "object",
            properties: {
              issues: {
                type: "array",
                description: "每个元素为单个issue的参数对象",
                items: {
                  type: "object",
                  properties: {
                    projectKey: {
                      type: "string",
                      description:
                        "问题将被创建的项目键，当创建子任务类型时，该字段值是问题编号短横线分割后的第一部分，如：PROJECT-123，PROJECT",
                    },
                    issueType: {
                      type: "string",
                      description:
                        "要创建的问题类型名称（非subtask必须使用英文名称，如：Story、Task、Bug等，不支持中文问题类型名称；如果是subtask则使用用户要求的名称，如：开发子任务、子任务、测试子任务等）",
                    },
                    summary: { type: "string", description: "问题摘要/标题" },
                    department: {
                      type: "string",
                      description: "问题的部门名称",
                    },
                    team: {
                      type: "array",
                      description: "问题的团队",
                      items: { type: "string", description: "问题的团队" },
                    },
                    requirementScope: {
                      type: "string",
                      description: "问题的需求范围名称",
                    },
                    description: { type: "string", description: "问题描述" },
                    acceptanceCriteria: {
                      type: "string",
                      description: "问题的验收标准",
                    },
                    fixVersions: {
                      type: "array",
                      description: "问题所属版本",
                      items: {
                        type: "string",
                        description: "问题所属版本名称",
                      },
                    },
                    testType: {
                      type: "string",
                      description: "问题的测试类型名称",
                    },
                    storyPoints: {
                      type: "number",
                      description: "问题的故事点数",
                    },
                    functionPoints: {
                      type: "number",
                      description: "问题的功能点数",
                    },
                    duedate: {
                      type: "string",
                      description: "问题到期日，如果为空则与计划完成日期相同",
                    },
                    priority: {
                      type: "string",
                      description:
                        "问题优先级（必须使用中文优先级名称，如：低、中、高）",
                    },
                    assignee: {
                      type: "string",
                      description: "经办人的名称，同开发人员相同",
                    },
                    developers: {
                      type: "array",
                      description: "问题的开发人员",
                      items: {
                        type: "string",
                        description: "问题的开发人员的名称，创建时默认是经办人",
                      },
                    },
                    userInterface: {
                      type: "string",
                      description:
                        "问题是否包含用户可操作页面（必须使用中文名称，如：是、否、无）",
                    },
                    plannedCompletionDate: {
                      type: "string",
                      description:
                        "问题的计划开发完成日期，如果为空则与到期日相同",
                    },
                    sprint: {
                      type: "string",
                      description:
                        "问题所属的Sprint名称（必须使用 Sprint 的名称）",
                    },
                    originalEstimate: {
                      type: "string",
                      description:
                        "问题的原预估时间，格式如：Xw, Xd, Xh, Xm，分别表示周(w), 天(d), 小时(h)和分钟(m)，如果没有指定时间单位，默认为分钟",
                    },
                    parent: {
                      type: "string",
                      description: "子任务的父任务键，仅在创建子任务时使用",
                    },
                    fields: {
                      type: "object",
                      description: "要在问题上设置的额外字段",
                      additionalProperties: true,
                    },
                  },
                  required: [
                    "projectKey",
                    "issueType",
                    "summary",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["issues"],
            additionalProperties: false,
          },
        },
        {
          name: "update_issue",
          description: "通过问题的键更新问题（包括评论）",
          inputSchema: {
            type: "object",
            properties: {
              issueKey: {
                type: "string",
                description: "要更新的问题的键",
              },

              fields: {
                type: "object",
                description: "要在问题上更新的字段",
                additionalProperties: true,
                properties: {
                  summary: {
                    type: "string",
                    description: "要更新的问题摘要/标题",
                  },
                  department: {
                    type: "string",
                    description: "要更新的部门",
                  },
                  team: {
                    type: "array",
                    description: "要更新的团队",
                    items: {
                      type: "string",
                      description: "要更新的团队",
                    },
                  },
                  requirementScope: {
                    type: "string",
                    description: "要更新的需求范围名称",
                  },
                  description: {
                    type: "string",
                    description: "要更新的问题描述",
                  },
                  acceptanceCriteria: {
                    type: "string",
                    description: "要更新的验收标准",
                  },

                  fixVersions: {
                    type: "array",
                    description: "要更新的问题所属版本",
                    items: {
                      type: "string",
                      description: "要更新的问题所属版本名称",
                    },
                  },
                  testType: {
                    type: "string",
                    description: "要更新的测试类型名称",
                  },
                  storyPoints: {
                    type: "number",
                    description: "要更新的故事点数",
                  },
                  functionPoints: {
                    type: "number",
                    description: "要更新的功能点数",
                  },
                  duedate: {
                    type: "string",
                    description: "要更新的问题到期日",
                  },
                  priority: {
                    type: "string",
                    description:
                      "要更新的问题优先级（必须使用中文优先级名称，如：低、中、高）",
                  },
                  assignee: {
                    type: "string",
                    description: "要更新的经办人的名称",
                  },
                  developers: {
                    type: "array",
                    description: "要更新的开发人员",
                    items: {
                      type: "string",
                      description: "要更新的开发人员的名称",
                    },
                  },
                  userInterface: {
                    type: "string",
                    description:
                      "要更新的是否包含用户可操作页面（必须使用中文名称，如：是、否、无）",
                  },
                  plannedCompletionDate: {
                    type: "string",
                    description: "要更新的计划开发完成日期",
                  },
                  sprint: {
                    type: "string",
                    description:
                      "问题所属的Sprint名称（必须使用 Sprint 的名称）",
                  },
                  originalEstimate: {
                    type: "string",
                    description:
                      "问题的原预估时间，格式如：Xw, Xd, Xh, Xm，分别表示周(w), 天(d), 小时(h)和分钟(m)，如果没有指定时间单位，默认为分钟",
                  },
                  // // TODO: 目前无法批量add Server有限制，没法像Cloud一样批量add
                  // issuelinks: {
                  //   type: "array",
                  //   description: "要更新的链接的问题",
                  //   items: {
                  //     type: "object",
                  //     properties: {
                  //       id: {
                  //         type: "string",
                  //         description: "要更新的链接的问题的ID",
                  //       },
                  //     },
                  //     required: ["id"],
                  //     additionalProperties: false,
                  //   },
                  // },
                },
              },
            },
            required: ["issueKey", "fields"],
            additionalProperties: false,
          },
        },
        {
          name: "get_transitions",
          description: "通过问题的键获取所有可执行的状态转换",
          inputSchema: {
            type: "object",
            properties: {
              issueKey: {
                type: "string",
                description: "要获取转换的问题的键",
              },
            },
            required: ["issueKey"],
            additionalProperties: false,
          },
        },
        {
          name: "transition_issue",
          description: "对一个或多个问题执行状态转换（包括评论）",
          inputSchema: {
            type: "object",
            properties: {
              issueKeys: {
                type: "array",
                items: { type: "string" },
                description: "要进行状态转换的问题键数组",
              },
              transitionId: {
                type: "string",
                description: "要执行的状态转换的 ID",
              },
              comment: {
                type: "string",
                description: "状态转换时可选添加的评论（将添加到每个问题）",
              },
            },
            required: ["issueKey", "transitionId"],
            additionalProperties: false,
          },
        },
        {
          name: "add_attachment",
          description: "通过问题的键添加文件附件",
          inputSchema: {
            type: "object",
            properties: {
              issueKey: {
                type: "string",
                description: "要添加附件的问题的键",
              },
              fileContent: {
                type: "string",
                description: "文件的 Base64 编码内容",
              },
              filename: {
                type: "string",
                description: "要附加的文件的名称",
              },
            },
            required: ["issueKey", "fileContent", "filename"],
            additionalProperties: false,
          },
        },
        {
          name: "add_comment",
          description: "通过问题的键添加评论",
          inputSchema: {
            type: "object",
            properties: {
              issueIdOrKey: {
                type: "string",
                description: "要添加评论的问题的 ID 或键",
              },
              body: {
                type: "string",
                description: "评论的内容（纯文本）",
              },
            },
            required: ["issueIdOrKey", "body"],
            additionalProperties: false,
          },
        },
        {
          name: "get_version",
          description: "获取当前 MCP 工具的版本信息",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments as Record<string, any>;

      logger.info(`开始处理工具调用: ${toolName}`, { arguments: args });

      try {
        let response;

        switch (toolName) {
          case "search_issues": {
            if (!args.searchString || typeof args.searchString !== "string") {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Search string is required",
              );
            }
            response = await this.jiraApi.searchIssues(args.searchString);
            logger.logToolCall(toolName, args, response);
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "get_epic_children": {
            if (!args.epicKey || typeof args.epicKey !== "string") {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Epic key is required",
              );
            }
            response = await this.jiraApi.getEpicChildren(args.epicKey);
            logger.logToolCall(toolName, args, response);
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "get_issue": {
            if (!args.issueId || typeof args.issueId !== "string") {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Issue ID is required",
              );
            }
            response = await this.jiraApi.getIssueWithComments(args.issueId);
            logger.logToolCall(toolName, args, response);
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "create_issues": {
            if (!Array.isArray(args.issues)) {
              throw new McpError(ErrorCode.InvalidParams, "issues 必须为数组");
            }
            const results = [];
            for (const issueArgs of args.issues) {
              try {
                const params = transformToCreateIssueParams(issueArgs);
                // 如果是子任务类型且提供了parent字段，直接在fields中设置parent字段
                const isSubtask =
                  params.issueType.toLowerCase().includes("subtask") ||
                  params.issueType.toLowerCase().includes("子任务");
                
                if (isSubtask && issueArgs.parent) {
                  params.fields = params.fields || {};
                  params.fields.parent = { key: issueArgs.parent };
                }
                const res = await this.jiraApi.createIssue(params);
                results.push({ success: true, result: res });
              } catch (e) {
                results.push({
                  success: false,
                  error: e instanceof Error ? e.message : String(e),
                });
              }
            }
            response = { count: results.length, results };
            logger.logToolCall(toolName, args, response);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }
          case "update_issue": {
            if (
              !args.issueKey ||
              typeof args.issueKey !== "string" ||
              !args.fields ||
              typeof args.fields !== "object"
            ) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "issueKey and fields object are required",
              );
            }
            await this.jiraApi.updateIssue(args.issueKey, args.fields);
            response = {
              message: `Issue ${args.issueKey} updated successfully`,
            };
            logger.logToolCall(toolName, args, response);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }
          case "get_transitions": {
            if (!args.issueKey || typeof args.issueKey !== "string") {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Issue key is required",
              );
            }
            response = await this.jiraApi.getTransitions(args.issueKey);
            logger.logToolCall(toolName, args, response);
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "transition_issue": {
            if (
              !args.issueKeys ||
              !Array.isArray(args.issueKeys) ||
              !args.transitionId ||
              typeof args.transitionId !== "string"
            ) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "issueKey array and transitionId are required",
              );
            }

            // 统一使用批量处理方法
            await this.jiraApi.batchTransitionIssues(
              args.issueKeys,
              args.transitionId,
              args.comment as string | undefined,
            );

            logger.logToolCall(toolName, args);
            return {
              content: [
                {
                  type: "text",
                  text: `Issues ${args.issueKeys.join(
                    ", ",
                  )} transitioned successfully`,
                },
              ],
            };
          }
          case "add_attachment": {
            if (
              !args.issueKey ||
              typeof args.issueKey !== "string" ||
              !args.fileContent ||
              typeof args.fileContent !== "string" ||
              !args.filename ||
              typeof args.filename !== "string"
            ) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "issueKey, fileContent, and filename are required",
              );
            }
            const fileBuffer = Buffer.from(args.fileContent, "base64");
            const result = await this.jiraApi.addAttachment(
              args.issueKey,
              fileBuffer,
              args.filename,
            );
            response = {
              message: `File ${args.filename} attached successfully to issue ${args.issueKey}`,
              attachmentId: result.id,
              filename: result.filename,
            };
            logger.logToolCall(toolName, args, response);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }
          case "add_comment": {
            if (
              !args.issueIdOrKey ||
              typeof args.issueIdOrKey !== "string" ||
              !args.body ||
              typeof args.body !== "string"
            ) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "issueIdOrKey and body are required",
              );
            }
            response = await this.jiraApi.addCommentToIssue(
              args.issueIdOrKey,
              args.body,
            );
            logger.logToolCall(toolName, args, response);
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "get_version": {
            // 使用统一的版本获取函数
            try {
              response = getVersionInfo();
              logger.logToolCall(toolName, args, response);
              return {
                content: [
                  { type: "text", text: JSON.stringify(response, null, 2) },
                ],
              };
            } catch (error) {
              // 如果读取失败，抛出错误
              throw new McpError(
                ErrorCode.InternalError,
                `无法读取版本信息: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              );
            }
          }
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${toolName}`,
            );
        }
      } catch (error) {
        logger.logToolCall(toolName, args, undefined, error as Error);

        // Keep generic error handling
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : "Unknown error occurred",
        );
      }
    });
  }

  // 添加受保护的getter方法以访问server属性
  protected getServer(): Server {
    return this.server;
  }

  async run() {
    logger.info(`启动 JIRA MCP Server v${this.versionInfo.version}...`);
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info(
      `JIRA MCP Server v${this.versionInfo.version} 已启动，使用 stdio 传输`,
    );
  }
}
