/*
 * @Author: DivinerWJ 2574114945@qq.com
 * @Date: 2025-07-22 09:35:46
 * @LastEditors: DivinerWJ 2574114945@qq.com
 * @LastEditTime: 2025-07-22 09:38:26
 * @Description:
 * @FilePath: /jira-mcp/src/utils/auth-utils.js
 */
/**
 * 认证相关工具函数
 */

/**
 * 解码 Basic Auth 字符串
 * 支持两种格式：
 * 1. 纯 base64 编码的 "username:password"
 * 2. 带有 "Basic " 前缀的 base64 编码字符串
 *
 * @param basicAuthValue - Basic Auth 字符串
 * @returns 包含解码后的用户名和令牌的对象，如果解码失败则返回空字符串
 */
export function decodeBasicAuth(basicAuthValue: string): {
  username: string,
  token: string,
} {
  if (!basicAuthValue) {
    return { username: "", token: "" };
  }

  try {
    // 处理可能带有 Basic 前缀的情况
    const base64Credentials = basicAuthValue.startsWith("Basic ")
      ? basicAuthValue.substring(6) // 去掉 "Basic " 前缀
      : basicAuthValue; // 直接使用提供的值

    const credentials = Buffer.from(base64Credentials, "base64").toString(
      "utf-8",
    );
    const [username, token] = credentials.split(":");

    if (username && token) {
      return { username, token };
    }
  } catch (error) {
    // console.warn("解析 Basic Auth 失败", error);
  }

  return { username: "", token: "" };
}
