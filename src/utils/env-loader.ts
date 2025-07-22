import dotenv from "dotenv";

import { JiraBaseConfig } from "../types/jira.js";
import { decodeBasicAuth } from "./auth-utils.ts";

/**
 * 重新加载环境变量
 * 清除缓存并重新从.env文件加载
 * @param envPath - .env文件路径（可选）
 * @param varsToReset - 要重置的环境变量列表（默认为Jira相关变量）
 * @returns 加载的环境变量对象
 */
export function reloadEnv(
  envPath?: string,
  varsToReset: string[] = [
    "JIRA_BASE_URL",
    "JIRA_USERNAME",
    "JIRA_API_TOKEN",
    "JIRA_BASIC_AUTH",
  ],
): NodeJS.ProcessEnv {
  // 清除指定的环境变量
  varsToReset.forEach((varName) => {
    delete process.env[varName];
  });

  // 加载配置
  const result = dotenv.config({ path: envPath });

  if (result.error) {
    console.warn(`环境变量加载警告: ${result.error.message}`);
  }

  // 验证关键环境变量是否存在
  // 注意：不再检查所有变量，而是在getJiraConfig中进行更灵活的验证
  const missingBaseUrl = !process.env.JIRA_BASE_URL;
  if (missingBaseUrl) {
    console.warn("警告: JIRA_BASE_URL 环境变量未设置");
  }

  return process.env;
}

/**
 * 获取Jira API配置
 * @returns Jira API配置对象
 */
export function getJiraConfig(): JiraBaseConfig {
  const {
    JIRA_BASE_URL,
    JIRA_USERNAME,
    JIRA_API_TOKEN,
    JIRA_TYPE,
    JIRA_BASIC_AUTH,
  } = reloadEnv();

  if (!JIRA_BASE_URL) {
    throw new Error(
      "缺少必要的JIRA_BASE_URL配置。请检查环境变量是否设置正确。",
    );
  }

  // 检查认证配置：要求JIRA_BASIC_AUTH或者(JIRA_USERNAME和JIRA_API_TOKEN)至少有一组配置存在
  const hasBasicAuth = !!JIRA_BASIC_AUTH;
  const hasCredentials = !!JIRA_USERNAME && !!JIRA_API_TOKEN;

  if (!hasBasicAuth && !hasCredentials) {
    throw new Error(
      "缺少必要的Jira认证配置。请提供JIRA_BASIC_AUTH或者同时提供JIRA_USERNAME和JIRA_API_TOKEN。",
    );
  }

  // 如果提供了JIRA_BASIC_AUTH，则优先使用它
  if (hasBasicAuth) {
    // 解码 basic auth 并赋值给 username 和 token
    const { username: decodedUsername, token: decodedToken } =
      decodeBasicAuth(JIRA_BASIC_AUTH as string);

    return {
      JIRA_BASE_URL,
      JIRA_USERNAME: decodedUsername || JIRA_USERNAME || "",
      JIRA_API_TOKEN: decodedToken || JIRA_API_TOKEN || "",
      JIRA_TYPE: JIRA_TYPE || "server",
    };
  }

  // 否则使用传统的用户名和API令牌
  return {
    JIRA_BASE_URL,
    JIRA_USERNAME,
    JIRA_API_TOKEN,
    JIRA_TYPE: JIRA_TYPE || "server",
  };
}

// 将 JSON 字符串中指定 key 的小数字段转为字符串，保留原始格式
export function fixJsonKeysDecimalToString(
  jsonStr: string,
  keys: string[],
): string {
  if (!Array.isArray(keys) || keys.length === 0) return jsonStr;
  // 构造 key 的正则模式
  const keyPattern = keys.map((k) => `"${k}"`).join("|");
  // 匹配指定 key 后面的小数（包括负数和科学计数法）
  const regex = new RegExp(
    `(${keyPattern})\\s*:\\s*(-?\\d+\\.\\d+(?:[eE][+-]?\\d+)?)`,
    "g",
  );
  // 替换为字符串
  return jsonStr.replace(regex, '$1:"$2"');
}
