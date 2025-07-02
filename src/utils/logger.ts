import {
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { join, dirname } from "path";
import { getSimpleVersionInfo } from "./version.js";

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  error?: Error;
}

export class Logger {
  private logFilePath: string | null = null;
  private isFileLoggingEnabled: boolean = false;

  constructor() {
    this.initializeFileLogging();
  }

  private getTodayLogFilePath(): string | null {
    const logDir = process.env.JIRA_LOG_DIR;
    if (!logDir) return null;
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
    const logFileName = `jira-mcp-${dateStr}.log`;
    return join(logDir, logFileName);
  }

  private initializeFileLogging() {
    const logDir = process.env.JIRA_LOG_DIR;
    if (logDir) {
      try {
        // 确保日志目录存在
        if (!existsSync(logDir)) {
          mkdirSync(logDir, { recursive: true });
        }

        this.logFilePath = this.getTodayLogFilePath();
        this.isFileLoggingEnabled = true;

        // 写入日志文件头部（如果文件不存在）
        if (this.logFilePath && !existsSync(this.logFilePath)) {
          const now = new Date();
          const versionInfo = getSimpleVersionInfo();
          const header = `=== JIRA MCP Server v${versionInfo.version} Log ===\nStarted at: ${now.toISOString()}\nVersion: ${versionInfo.version}\nMCP Server Version: ${versionInfo.mcpServerVersion}\nLog Level: ${
            process.env.JIRA_LOG_LEVEL || "INFO"
          }\nEnvironment: ${
            process.env.NODE_ENV || "production"
          }\n==========================================\n\n`;
          writeFileSync(this.logFilePath, header);
        }

        process.stderr.write(`📝 文件日志已启用: ${this.logFilePath}\n`);
      } catch (error) {
        process.stderr.write(`❌ 初始化文件日志失败: ${String(error)}\n`);
        this.isFileLoggingEnabled = false;
      }
    }
  }

  // 清理7天前的日志文件
  private cleanupOldLogs() {
    const logDir = process.env.JIRA_LOG_DIR;
    if (!logDir) return;
    try {
      const files = readdirSync(logDir);
      const now = Date.now();
      files.forEach((file: string) => {
        if (file.startsWith("jira-mcp-") && file.endsWith(".log")) {
          const filePath = join(logDir, file);
          const stat = statSync(filePath);
          const age = now - stat.mtimeMs;
          if (age > 7 * 24 * 60 * 60 * 1000) {
            unlinkSync(filePath);
          }
        }
      });
    } catch (e) {
      process.stderr.write(`[LOGGER ERROR] 清理旧日志文件失败: ${String(e)}\n`);
    }
  }

  private formatLogEntry(
    level: LogLevel,
    message: string,
    data?: any,
    error?: Error,
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      error,
    };
  }

  private writeToFile(logEntry: LogEntry) {
    if (!this.isFileLoggingEnabled) {
      return;
    }

    // 每次写日志前清理旧日志
    this.cleanupOldLogs();

    // 每次写日志时都获取当天的日志文件路径，支持跨天写入
    this.logFilePath = this.getTodayLogFilePath();

    if (!this.logFilePath) {
      process.stderr.write(`[LOGGER ERROR] 日志文件路径无效，无法写入日志\n`);
      return;
    }

    try {
      let logLine = `[${logEntry.timestamp}] ${logEntry.level}: ${logEntry.message}`;

      if (logEntry.data) {
        logLine += `\nData: ${JSON.stringify(logEntry.data, null, 2)}`;
      }

      if (logEntry.error) {
        logLine += `\nError: ${logEntry.error.message}`;
        if (logEntry.error.stack) {
          logLine += `\nStack: ${logEntry.error.stack}`;
        }
      }

      logLine += "\n";

      // 如果文件不存在，写入头部
      if (!existsSync(this.logFilePath)) {
        const now = new Date();
        const versionInfo = getSimpleVersionInfo();
        const header = `=== JIRA MCP Server v${versionInfo.version} Log ===\nStarted at: ${now.toISOString()}\nVersion: ${versionInfo.version}\nMCP Server Version: ${versionInfo.mcpServerVersion}\nLog Level: ${
          process.env.JIRA_LOG_LEVEL || "INFO"
        }\nEnvironment: ${
          process.env.NODE_ENV || "production"
        }\n==========================================\n\n`;
        writeFileSync(this.logFilePath, header);
      }

      appendFileSync(this.logFilePath, logLine);
    } catch (error) {
      // 文件写入异常时，输出到 stderr
      process.stderr.write(
        `[LOGGER ERROR] 写入日志文件失败: ${String(error)}\n`,
      );
      process.stderr.write(
        `[LOGGER Fallback] ${logEntry.level}: ${logEntry.message}\n`,
      );
      if (logEntry.data) {
        process.stderr.write(
          `Data: ${JSON.stringify(logEntry.data, null, 2)}\n`,
        );
      }
      if (logEntry.error) {
        process.stderr.write(`Error: ${logEntry.error.message}\n`);
        if (logEntry.error.stack) {
          process.stderr.write(`Stack: ${logEntry.error.stack}\n`);
        }
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const configuredLevel = process.env.JIRA_LOG_LEVEL || "INFO";
    const levels = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
    ];
    const configuredIndex = levels.indexOf(configuredLevel as LogLevel);
    const currentIndex = levels.indexOf(level);

    return currentIndex >= configuredIndex;
  }

  debug(message: string, data?: any) {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    const logEntry = this.formatLogEntry(LogLevel.DEBUG, message, data);
    this.writeToFile(logEntry);
  }

  info(message: string, data?: any) {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const logEntry = this.formatLogEntry(LogLevel.INFO, message, data);
    this.writeToFile(logEntry);
  }

  warn(message: string, data?: any) {
    if (!this.shouldLog(LogLevel.WARN)) return;
    const logEntry = this.formatLogEntry(LogLevel.WARN, message, data);
    this.writeToFile(logEntry);
  }

  error(message: string, error?: Error, data?: any) {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    const logEntry = this.formatLogEntry(LogLevel.ERROR, message, data, error);
    this.writeToFile(logEntry);
  }

  // 专门用于记录 MCP 工具调用的日志
  logToolCall(toolName: string, args: any, result?: any, error?: Error) {
    const message = `Tool Call: ${toolName}`;
    const data = {
      tool: toolName,
      arguments: args,
      result,
      timestamp: new Date().toISOString(),
    };

    if (error) {
      this.error(message, error, data);
    } else {
      this.info(message, data);
    }
  }

  // 专门用于记录 JIRA API 调用的日志
  logApiCall(operation: string, params: any, result?: any, error?: Error) {
    const message = `JIRA API: ${operation}`;
    const data = {
      operation,
      params,
      result,
      timestamp: new Date().toISOString(),
    };

    if (error) {
      this.error(message, error, data);
    } else {
      this.info(message, data);
    }
  }

  // 获取日志文件路径
  getLogFilePath(): string | null {
    return this.logFilePath;
  }

  // 检查是否启用了文件日志
  isFileLogging(): boolean {
    return this.isFileLoggingEnabled;
  }
}

// 创建全局日志实例
export const logger = new Logger();
