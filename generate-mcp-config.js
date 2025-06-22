#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// 获取当前文件的目录
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 获取打包后的文件路径
const buildPath = path.join(__dirname, 'build/index.js');
const absoluteBuildPath = path.resolve(__dirname, buildPath).replace(/\\/g, '/');

// 从类型文件中提取环境变量及其描述
function extractEnvVarsAndDescriptions() {
  try {
    const typesFilePath = path.join(__dirname, 'src/types/jira.ts');
    console.log(`从文件读取类型定义: ${typesFilePath}`);
    const typesContent = fs.readFileSync(typesFilePath, 'utf8');

    const envVars = [];
    const descriptions = {};

    // 匹配JSDoc注释和字段定义
    // 匹配模式: /** 注释内容 */ 后面跟着的变量名
    const commentAndFieldPattern = /\/\*\*\s*(.*?)\s*\*\/\s*([A-Z_]+)[\?]?\s*:/gs;
    let match;

    while ((match = commentAndFieldPattern.exec(typesContent)) !== null) {
      const description = match[1].trim();
      const varName = match[2].trim();

      envVars.push(varName);
      descriptions[varName] = description;

      // console.log(`提取环境变量: ${varName} => "${description}"`);
    }

    console.log(`从类型定义文件中总共提取了 ${envVars.length} 个环境变量`);
    return { envVars, descriptions };
  } catch (error) {
    console.warn('无法从类型定义文件中提取环境变量:', error.message);
    return { envVars: [], descriptions: {} };
  }
}
// 从类型定义中提取所有可能的环境变量及其描述
const { envVars, descriptions } = extractEnvVarsAndDescriptions();

// 从.env.local文件读取环境变量
function readEnvLocalFile() {
  const envLocalPath = path.join(__dirname, '.env.local');

  try {
    if (fs.existsSync(envLocalPath)) {
      console.log(`发现.env.local文件，正在读取配置...`);
      const envLocalConfig = dotenv.parse(fs.readFileSync(envLocalPath));
      return envLocalConfig;
    }
  } catch (error) {
    console.warn(`读取.env.local文件时出错: ${error.message}`);
  }

  return {};
}

// 动态生成环境变量配置
function generateEnvConfig() {

  // 从.env.local文件读取配置值（如果存在）
  const envLocalValues = readEnvLocalFile();

  // 创建配置对象
  const envConfig = {};

  // 确保所有从类型定义中提取的环境变量都有值
  envVars.forEach(varName => {
    // 优先级：进程环境变量 > .env.local文件 > 空字符串
    envConfig[varName] = process.env[varName] || envLocalValues[varName] || '';
  });

  // 创建配置对象
  const config = {
    "mcpServers": {
      "jira": {
        "command": "node",
        "args": [
          absoluteBuildPath
        ],
        "env": envConfig
      }
    }
  };

  try {
    const mcpConfigPath = path.join(__dirname, 'mcp.json');
    fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2));
    console.log(`MCP配置文件已生成: ${mcpConfigPath}`);
  } catch (error) {
    console.error('生成MCP配置文件时出错:', error);
  }
}

// 生成环境变量示例文件
function generateEnvExample() {

  // 生成示例文件内容
  let exampleContent = '# Jira MCP Server 环境变量示例文件\n\n';

  // 添加所有变量
  envVars.forEach(varName => {
    const description = descriptions[varName] || `${varName} 的值`;
    exampleContent += `# ${description}\n${varName}=\n\n`;
  });
  try {

    // 写入示例文件
    const examplePath = path.join(__dirname, '.env.example');
    fs.writeFileSync(examplePath, exampleContent, 'utf8');
    console.log(`环境变量示例文件已生成: ${examplePath}`);
  } catch (error) {
    console.error('生成环境变量示例文件时出错:', error);
  }

  // 停止进程
  process.exit(0);
}

// 写入配置文件
generateEnvConfig()

// 生成环境变量示例文件
generateEnvExample(); 