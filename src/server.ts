#!/usr/bin/env bun
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { Request, Response } from "express";
import { IncomingMessage, ServerResponse } from "http";
import { JiraServer } from "./cli.ts";
import { reloadEnv, getJiraConfig } from "./utils/env-loader.ts";

const HTTP_PORT = process.env.HTTP_PORT ? parseInt(process.env.HTTP_PORT, 10) : 3000;

class JiraHttpServer extends JiraServer {
  constructor() {
    super();
  }
  async run() {
    // if (process.env.NODE_ENV === 'development') {
    console.log(`🌐 Starting HTTP server on port ${HTTP_PORT}`);
    await this.startHttpServer(HTTP_PORT);
    // }
  }

  // 重新加载配置方法
  protected reloadConfig(): void {
    const jiraConfig = getJiraConfig();
    const config = this.setJiraConfig(jiraConfig);
    console.log(`Jira API 配置已重新加载: ${config.JIRA_BASE_URL} (${config.JIRA_USERNAME})`);
  }

  async startHttpServer(port: number): Promise<void> {
    const app = express();

    app.get("/health", (req: Request, res: Response) => {
      res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
    });

    app.post("/reload-config", (req: Request, res: Response) => {
      try {
        reloadEnv();
        this.reloadConfig();
        res.status(200).json({
          status: "ok",
          message: "配置已重新加载",
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error("重新加载配置失败:", error);
        res.status(500).json({
          status: "error",
          message: `重新加载配置失败: ${error}`,
          timestamp: new Date().toISOString()
        });
      }
    });

    app.get("/sse", async (req: Request, res: Response) => {
      console.log("New SSE connection established");
      const sseTransport = new SSEServerTransport(
        "/messages",
        res as unknown as ServerResponse<IncomingMessage>,
      );
      this.setSseTransport(sseTransport);
      await this.getServer().connect(sseTransport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      const sseTransport = this.getSseTransport();
      if (!sseTransport) {
        res.sendStatus(400);
        return;
      }
      await sseTransport.handlePostMessage(
        req as unknown as IncomingMessage,
        res as unknown as ServerResponse<IncomingMessage>,
      );
    });

    app.listen(port, () => {
      console.log(`HTTP server listening on port ${port}`);
      console.log(`SSE endpoint available at http://localhost:${port}/sse`);
      console.log(`Message endpoint available at http://localhost:${port}/messages`);
      console.log(`Health check endpoint available at http://localhost:${port}/health`);
      console.log(`Config reload endpoint available at http://localhost:${port}/reload-config`);
    });
  }
}

const server = new JiraHttpServer();
server.run().catch(() => { });
