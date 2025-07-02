import { readFileSync } from "fs";
import { join } from "path";

export interface VersionInfo {
  name: string;
  version: string;
  description: string;
  license: string;
  mcpServerVersion: string;
}

/**
 * 获取版本信息的统一工具函数
 * @returns 版本信息对象
 */
export function getVersionInfo(): VersionInfo {
  const mcpServerVersion = "0.2.0";

  try {
    const packageContent = readFileSync(
      join(process.cwd(), "package.json"),
      "utf8",
    );
    const packageInfo = JSON.parse(packageContent);

    return {
      name: packageInfo.name,
      version: packageInfo.version,
      description: packageInfo.description,
      license: packageInfo.license,
      mcpServerVersion,
    };
  } catch (error) {
    // 如果读取失败，返回默认值
    return {
      name: "jira-mcp",
      version: "",
      description: "JIRA MCP Server",
      license: "",
      mcpServerVersion,
    };
  }
}

/**
 * 获取简化的版本信息（仅包含版本号和 MCP 服务器版本）
 * @returns 简化的版本信息对象
 */
export function getSimpleVersionInfo(): {
  version: string;
  mcpServerVersion: string;
} {
  const versionInfo = getVersionInfo();
  return {
    version: versionInfo.version,
    mcpServerVersion: versionInfo.mcpServerVersion,
  };
}
