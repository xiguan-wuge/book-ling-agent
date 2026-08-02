// src/agents/roles.ts — 三种预设角色

import type { SubAgentConfig } from "./types.js";

const SUB_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

/** Plan Agent：只读不写，分析项目结构和变更范围 */
export function planAgent(task: string): SubAgentConfig {
  return {
    name: "plan-agent",
    role: `你是一个规划 Agent，你的任务是分析代码库并制定迁移计划。

规则：
- 你只能读取文件和搜索代码，不能写入或执行任何操作。
- 输出结构化的计划：哪些文件需要修改、具体改什么、按什么顺序。
- 要具体。不要说"更新路由"，要说"在 src/routes/users.ts 第 10-25 行，将 app.get() 改为 Hono 语法的 app.get()"。

Task: ${task}`,
    tools: ["read_file", "grep", "glob", "list_files"],
    model: SUB_MODEL,
    maxTurns: 10,
  };
}

/** Code Agent：有全部工具权限，执行具体的代码修改 */
export function codeAgent(
  name: string,
  task: string,
  tools: string[] = ["read_file", "edit_file", "bash", "grep", "glob", "list_files"]
): SubAgentConfig {
  return {
    name,
    role: `你是一个代码 Agent，你的任务是执行具体的代码修改。

规则：
- 严格按照计划执行，不要自行发挥。
- 修改后要读回文件验证改动是否正确。
- 如果有问题就修复，不要留下无法运行的代码。

Task: ${task}`,
    tools,
    maxTurns: 20,
  };
}

/** Review Agent：只读权限，输出审查意见 */
export function reviewAgent(focus: string): SubAgentConfig {
  return {
    name: "review-agent",
    role: `你是一个代码审查 Agent，你的任务是审查近期的改动是否正确且一致。

规则：
- 你只能读取文件和搜索代码，不能修改任何内容。
- 检查项：import 一致性、API 兼容性、缺失的错误处理、类型错误。
- 输出审查报告，标注 通过 / 不通过，并列出具体问题。

Focus: ${focus}`,
    tools: ["read_file", "grep", "glob"],
    model: SUB_MODEL,
    maxTurns: 10,
  };
}
