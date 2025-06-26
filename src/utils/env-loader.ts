import dotenv from "dotenv";

import { JiraBaseConfig } from "../types/jira.ts";

/**
 * 重新加载环境变量
 * 清除缓存并重新从.env文件加载
 * @param envPath - .env文件路径（可选）
 * @param varsToReset - 要重置的环境变量列表（默认为Jira相关变量）
 * @returns 加载的环境变量对象
 */
export function reloadEnv(
  envPath?: string,
  varsToReset: string[] = ["JIRA_BASE_URL", "JIRA_USERNAME", "JIRA_API_TOKEN"],
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
  const missingVars: string[] = [];
  varsToReset.forEach((varName) => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  if (missingVars.length > 0) {
    console.warn(`警告: 以下环境变量未设置: ${missingVars.join(", ")}`);
  }

  return process.env;
}

/**
 * 获取Jira API配置
 * @returns Jira API配置对象
 */
export function getJiraConfig(): JiraBaseConfig {
  const { JIRA_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN, JIRA_TYPE } =
    reloadEnv();

  if (!JIRA_BASE_URL || !JIRA_USERNAME || !JIRA_API_TOKEN) {
    throw new Error("缺少必要的Jira API配置。请检查环境变量是否设置正确。");
  }

  return {
    JIRA_BASE_URL,
    JIRA_USERNAME,
    JIRA_API_TOKEN,
    JIRA_TYPE,
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
