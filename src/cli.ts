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

import { JiraBaseConfig, EnvJiraConfig } from "./types/jira.ts";


declare module "bun" {
  interface Env extends EnvJiraConfig { }
}

export class JiraServer {
  private server: Server;
  private jiraApi: JiraApiService;

  private jiraConfig: JiraBaseConfig;

  constructor() {
    // 使用环境变量重载工具获取最新配置
    this.jiraConfig = {
      JIRA_BASE_URL: process.env.JIRA_BASE_URL,
      JIRA_USERNAME: process.env.JIRA_USERNAME,
      JIRA_API_TOKEN: process.env.JIRA_API_TOKEN,
      JIRA_TYPE: process.env.JIRA_TYPE || 'server',
    };
    // console.log(`Jira API 初始化: ${this.jiraConfig.JIRA_BASE_URL} (${this.jiraConfig.JIRA_USERNAME})`);

    this.server = new Server(
      {
        name: "jira-mcp",
        version: "0.2.0",
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
    
    // 将server实例传递给jiraApi
    this.jiraApi.setServer(this.server);

    this.setupToolHandlers();

    this.server.onerror = (error) => { };
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  protected setJiraConfig(config: JiraBaseConfig): JiraBaseConfig {
    this.jiraConfig = config;
    return this.jiraConfig;
  }

  protected getJiraConfig(): JiraBaseConfig {
    return this.jiraConfig;
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
                description: "JQL 搜索字符串",
              }
            },
            required: ["searchString"],
            additionalProperties: false,
          },
        },
        {
          name: "get_epic_children",
          description:
            "通过史诗问题的键获取所有子问题（包括评论）",
          inputSchema: {
            type: "object",
            properties: {
              epicKey: {
                type: "string",
                description: "史诗问题的键",
              }
            },
            required: ["epicKey"],
            additionalProperties: false,
          },
        },
        {
          name: "get_issue",
          description:
            "通过问题的键或ID获取详细信息（包括评论）",
          inputSchema: {
            type: "object",
            properties: {
              issueId: {
                type: "string",
                description: "JIRA 问题的 ID 或键",
              }
            },
            required: ["issueId"],
            additionalProperties: false,
          },
          outputSchema: {
            type: "object"
          }
        },
        {
          name: "create_issue",
          description: "通过项目键、问题类型和摘要创建新问题",
          inputSchema: {
            type: "object",
            properties: {
              projectKey: {
                type: "string",
                description: "问题将被创建的项目键",
              },
              issueType: {
                type: "string",
                // description: "要创建的问题类型的id（例如：'缺陷的id：10010'、'故事的id：10001'、'子任务的id：10002'）",
                description: "要创建的问题类型（例如：'缺陷'、'故事'、'任务'）",
              },
              summary: {
                type: "string",
                description: "问题摘要/标题",
              },
              description: {
                type: "string",
                description: "问题描述",
              },
              fixVersions: {
                type: "array",
                description: "问题所属版本",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string",
                      description: "问题所属版本名称",
                    },
                  },
                  required: ["name"],
                  additionalProperties: false,
                },
              },
              duedate: {
                type: "string",
                description: "问题到期日",
              },
              priority: {
                type: "string",
                description: "问题优先级",
              },
              assignee: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "经办人的名称",
                  }
                },
                required: ["name"],
                additionalProperties: false,
              },
              // issuelinks: {
              //   type: "array",
              //   description: "链接的问题",
              //   items: {
              //     type: "object",
              //     properties: {
              //       id: {
              //         type: "string",
              //         description: "链接的问题的ID",
              //       },
              //     },
              //     required: ["id"],
              //     additionalProperties: false,
              //   },
              // },
              fields: {
                type: "object",
                description: "要在问题上设置的额外字段",
                additionalProperties: true,
                properties: {
                  acceptanceCriteria: {
                    type: "string",
                    description: "问题的验收标准",
                  },
                  department: {
                    type: "string",
                    description: "问题的部门",
                  },
                  team: {
                    type: "array",
                    description: "问题的团队",
                    items: {
                      type: "string",
                      description: "问题的团队",
                    },
                  },
                  requirementScope: {
                    type: "object",
                    description: "问题的需求范围",
                    properties: {
                      name: {
                        type: "string",
                        description: "问题的需求范围名称",
                      },
                    },
                    required: ["name"],
                    additionalProperties: false,
                  },
                  testType: {
                    type: "object",
                    description: "问题的测试类型",
                    properties: {
                      name: {
                        type: "string",
                        description: "问题的测试类型名称",
                      },
                    },
                    required: ["name"],
                    additionalProperties: false,
                  },
                  storyPoints: {
                    type: "number",
                    description: "问题的故事点数",
                  },
                  functionPoints: {
                    type: "number",
                    description: "问题的功能点数",
                  },
                  developers: {
                    type: "array",
                    description: "问题的开发人员",
                    items: {
                      type: "object",
                      properties: {
                        name: {
                          type: "string",
                          description: "开发人员的名称",
                        }
                      },
                      required: ["name"],
                      additionalProperties: false,
                    }
                  },

                  userInterface: {
                    type: "object",
                    description: "问题是否包含用户可操作页面",
                    properties: {
                      value: {
                        type: "string",
                        description: "问题是否包含用户可操作页面",
                      },
                    },
                    required: ["value"],
                    additionalProperties: false,
                  },
                  plannedCompletionDate: {
                    type: "string",
                    description: "问题的计划开发完成日期",
                  },
                },
              }
            },
            required: ["projectKey", "issueType", "summary"],
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
                    type: "object",
                    description: "要更新的需求范围",
                    properties: {
                      name: {
                        type: "string",
                        description: "要更新的需求范围名称",
                      },
                    },
                    required: ["name"],
                    additionalProperties: false,
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
                  },
                  testType: {
                    type: "object",
                    description: "要更新的测试类型",
                    properties: {
                      name: {
                        type: "string",
                        description: "要更新的测试类型名称",
                      },
                    },
                    required: ["name"],
                    additionalProperties: false,
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
                    description: "要更新的问题优先级",
                  },
                  assignee: {
                    type: "object",
                    description: "要更新的问题经办人",
                    properties: {
                      name: {
                        type: "string",
                        description: "要更新的经办人的名称",
                      },
                    },
                    required: ["name"],
                    additionalProperties: false,
                  },
                  developers: {
                    type: "array",
                    description: "要更新的开发人员",
                    items: {
                      type: "object",
                      properties: {
                        name: {
                          type: "string",
                          description: "要更新的开发人员的名称",
                        }
                      },
                      required: ["name"],
                      additionalProperties: false,
                    }
                  },
                  userInterface: {
                    type: "object",
                    description: "要更新的用户界面",
                    properties: {
                      value: {
                        type: "string",
                        description: "要更新的用户界面",
                      },
                    },
                    required: ["value"],
                    additionalProperties: false,
                  },
                  plannedCompletionDate: {
                    type: "string",
                    description: "要更新的计划开发完成日期",
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
              }
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
              }
            },
            required: ["issueKey"],
            additionalProperties: false,
          },
        },
        {
          name: "transition_issue",
          description:
            "通过问题的键执行状态转换（包括评论）",
          inputSchema: {
            type: "object",
            properties: {
              issueKey: {
                type: "string",
                description: "要进行状态转换的问题的键",
              },
              transitionId: {
                type: "string",
                description: "要执行的状态转换的 ID",
              },
              comment: {
                type: "string",
                description: "状态转换时可选添加的评论",
              }
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
              }
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
              }
            },
            required: ["issueIdOrKey", "body"],
            additionalProperties: false,
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const args = request.params.arguments as Record<string, any>;

        switch (request.params.name) {
          case "search_issues": {
            if (!args.searchString || typeof args.searchString !== "string") {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Search string is required",
              );
            }
            const response = await this.jiraApi.searchIssues(args.searchString);
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
            const response = await this.jiraApi.getEpicChildren(args.epicKey);
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
            const response = await this.jiraApi.getIssueWithComments(
              args.issueId,
            );
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "create_issue": {
            // Basic validation
            if (
              !args.projectKey ||
              typeof args.projectKey !== "string" ||
              !args.issueType ||
              typeof args.issueType !== "string" ||
              !args.summary ||
              typeof args.summary !== "string"
            ) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "projectKey, issueType, and summary are required",
              );
            }
            const response = await this.jiraApi.createIssue(
              args.projectKey,
              args.issueType,
              args.summary,
              args.description as string | undefined,
              args.fixVersions as Record<string, any>[] | undefined,
              args.duedate as string | undefined,
              args.priority as string | undefined,
              args.assignee as Record<string, any> | undefined,
              // args.issuelinks as Record<string, any>[] | undefined,
              args.fields as Record<string, any> | undefined,
            );
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
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
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { message: `Issue ${args.issueKey} updated successfully` },
                    null,
                    2,
                  ),
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
            const response = await this.jiraApi.getTransitions(args.issueKey);
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          case "transition_issue": {
            if (
              !args.issueKey ||
              typeof args.issueKey !== "string" ||
              !args.transitionId ||
              typeof args.transitionId !== "string"
            ) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "issueKey and transitionId are required",
              );
            }
            await this.jiraApi.transitionIssue(
              args.issueKey,
              args.transitionId,
              args.comment as string | undefined,
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      message: `Issue ${args.issueKey} transitioned successfully${args.comment ? " with comment" : ""}`,
                    },
                    null,
                    2,
                  ),
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
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      message: `File ${args.filename} attached successfully to issue ${args.issueKey}`,
                      attachmentId: result.id,
                      filename: result.filename,
                    },
                    null,
                    2,
                  ),
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
            const response = await this.jiraApi.addCommentToIssue(
              args.issueIdOrKey,
              args.body,
            );
            return {
              content: [
                { type: "text", text: JSON.stringify(response, null, 2) },
              ],
            };
          }
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`,
            );
        }
      } catch (error) {
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
    // console.log('🔌 Using stdio transport');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    // JIRA MCP server running on stdio
  }
}