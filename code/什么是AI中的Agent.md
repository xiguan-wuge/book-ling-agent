# 什么是 AI 中的 Agent

> 基于 `book-ling-agent` 项目的代码和书籍内容，系统分析 AI Agent 的定义、核心组成、架构演进及多 Agent 协作机制。

## 一、定义

在本项目中，Agent 的核心公式是：

> **Agent = LLM + Tools + Loop**

这个定义来自 `book/01-first-agent/README.md`，三个组成部分各自职责明确：

| 组成 | 职责 | 比喻 |
|------|------|------|
| **LLM** | 看到用户请求，决定用什么工具、传什么参数；看到工具结果，决定继续还是收工 | 大脑 |
| **Tools** | 让 LLM 能与真实世界交互--读文件、跑命令、调 API | 手脚 |
| **Loop** | 把 LLM 和 Tools 串成循环，支持多步规划、执行、判断 | 心跳 |

书中强调："市面上所有的 Agent 框架--LangChain、CrewAI、AutoGen--不管包装了多少概念，核心都是这三样。区别仅在于工具多不多、Loop 复不复杂、上下文管理得好不好。"

## 二、最小 Agent 长什么样

`ch01/ling.ts` 用不到 50 行核心代码实现了完整 Agent：

```typescript
async function agent(userMessage: string) {
  const messages: Message[] = [
    { role: "system", content: "You are Ling..." },
    { role: "user", content: userMessage },
  ];

  while (true) {                                          // Loop
    const res = await client.chat.completions.create({     // LLM
      model: MODEL, messages, tools,
    });
    const choice = res.choices[0];
    messages.push(choice.message);

    if (choice.finish_reason !== "tool_calls") {
      console.log(choice.message.content);                 // 完成，输出
      return;
    }

    for (const tc of choice.message.tool_calls) {          // Tools
      const args = JSON.parse(tc.function.arguments);
      const result = executeTool(tc.function.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }
}
```

三个要素一目了然：

- **LLM**：`client.chat.completions.create()`
- **Tools**：`executeTool()` 执行 `read_file` / `run_command`
- **Loop**：`while (true)` 直到 `finish_reason !== "tool_calls"`

## 三、Agent 的完整组成（16 个模块的演进）

从 ch01 到 ch10，Agent 从 50 行玩具逐步长成生产级工具：

| 组成部分 | 章节 | 作用 | 代码位置 |
|---------|------|------|---------|
| LLM | ch01 | 决策大脑 | `ch01/ling.ts` |
| Tools | ch01 起 | 与真实世界交互 | `ch01/ling.ts` |
| Agent Loop | ch01 | `while(true)` 循环 | `ch01/ling.ts` |
| Messages | ch01 | 对话历史 = 记忆 | `ch01/ling.ts` |
| System Prompt | ch01 | 定义角色边界 | `ch01/ling.ts` |
| Provider 适配层 | ch02 | 屏蔽不同 LLM 差异 | `ch02/src/providers/factory.ts` |
| Tool Registry | ch03 | 工具统一注册管理 | `ch03/src/tools/index.ts` |
| 上下文工程 | ch04 | 项目感知 + 压缩 | `ch04/src/context/` |
| 权限守卫 | ch05 | allow/ask/deny 拦截 | `ch05/src/permissions/guard.ts` |
| 流式渲染 | ch06 | 逐 Token 输出 | `ch06/src/streaming/` |
| 会话持久化 | ch07 | 跨会话恢复 | `ch07/src/session/` |
| Hook 系统 | ch08 | 生命周期扩展 | `ch08/src/hooks/` |
| MCP 协议 | ch08 | 工具插件化 | `ch08/src/mcp/` |
| 子 Agent | ch09 | 并行协作 | `ch09/src/agents/` |
| CLI/非交互 | ch10 | CI/CD 可调用 | `ch10/src/cli/` |

## 四、Agent 架构演进路线

### ch01 - 最小 Agent（50 行）

- 直连 OpenAI SDK，2 个工具，`while(true)` 主循环
- messages 数组是 Agent 的"记忆"
- 工具失败不崩溃，错误信息回传 LLM

### ch02 - 多模型适配

- 引入 `LLMProvider` 接口，三个实现（Volcano/Claude/OpenAI）
- 上层逻辑稳定，下层实现可替换

### ch03 - 工具系统

- 8 个工具 + Registry，工具定义与执行分离

### ch04 - 上下文工程

- 项目检测、`.ling.md` 注入、上下文压缩

### ch05 - 权限安全

- allow/ask/deny 三层拦截，glob 模式匹配

### ch06 - 流式交互

- 逐 Token 渲染

### ch07 - 会话记忆

- 持久化、`--continue` / `--resume` 恢复

### ch08 - Hook + MCP

- 生命周期钩子、MCP 工具插件协议

### ch09 - 多 Agent 协作

- 子 Agent 派生、并行调度、三大隔离（上下文/工具/文件）

### ch10 - 生产模式

- CLI 参数、stdin 管道、结构化输出、CI/CD 集成

## 五、多 Agent 协作机制（ch09）

ch09 是架构上最大的跃迁：从"单 Agent 串行"变成"父 Agent 可动态派生子 Agent"。

### 三种预设角色（`ch09/src/agents/roles.ts`）

| 角色 | 工具权限 | maxTurns | 职责 |
|------|---------|----------|------|
| Plan Agent | 只读（read_file, grep, glob） | 10 | 分析代码库，输出计划 |
| Code Agent | 全量（含 edit_file, bash） | 20 | 执行代码修改 |
| Review Agent | 只读 | 10 | 审查改动一致性 |

### 三大隔离（`ch09/src/agents/spawner.ts`）

**1. 上下文隔离** - 每次 `spawn()` 创建独立 messages 数组：

```typescript
// 独立的消息历史 -- 这是上下文隔离的关键
const messages: Message[] = [
  { role: "system", content: config.role },
  { role: "user", content: task },
];
```

子 Agent A 的对话不会泄露给子 Agent B。

**2. 工具隔离** - 根据 `config.tools` 白名单过滤：

```typescript
// 从全局工具表中过滤出子 Agent 允许用的工具
for (const toolName of config.tools) {
  const entry = this.toolRegistry.get(toolName);
  if (entry) {
    allowedTools.push(entry.definition);
    executors.set(toolName, entry.execute);
  }
}
```

Plan/Review Agent 即使想调用 `bash` 也找不到。

**3. 文件隔离** - Git worktree（可选），每个子 Agent 在独立分支工作，搞砸了直接删 branch。

### 调度策略（`ch09/src/agents/scheduler.ts`）

- `runParallel`：`Promise.all` + 超时保护（默认 5 分钟），超时返回 `success: false` 而非 reject
- `runSequential`：串行执行，fail-fast--前一步失败就停
- `summarizeResults`：把各子 Agent 的名字、状态、输出拼成摘要

### 核心忠告

> "一个 Agent 能搞定的事，不要用两个。每多一个 Agent，就多一份 API 成本、多一个可能失败的环节。子 Agent 的使用场景是明确的--上下文装不下、需要并行加速、需要权限隔离。不是为了'用更多 Agent'而用。"

## 六、与主流框架的对比

| 维度 | 本项目 (Ling) | LangChain | CrewAI | AutoGen |
|------|--------------|-----------|--------|---------|
| 核心公式 | LLM + Tools + Loop | Chain + Agent + Tool | Agent + Task + Crew | Agent + Conversation |
| Agent Loop | `while(true)` 手写 | 内置 AgentExecutor | 内置 Crew 流程 | 内置对话循环 |
| 工具系统 | JSON Schema + Registry | @tool 装饰器 | @tool 装饰器 | 函数注册 |
| 多 Agent | 子 Agent spawn + 三大隔离 | LangGraph | Crew 角色编排 | GroupChat |
| 权限控制 | allow/ask/deny 三层 | 无内置 | 无内置 | 无内置 |
| 上下文管理 | 压缩器 + .ling.md | Memory 模块 | 无内置 | 无内置 |
| 代码量 | ~2000 行 TS | 大型框架 | 中型框架 | 中型框架 |

核心差异：Ling 从零实现所有模块，不引入框架依赖，每个设计决策都可审计。框架的优势是开箱即用，劣势是黑盒--你不知道 AgentExecutor 内部到底做了什么。

## 七、总结

AI Agent 的本质不神秘：**一个能调用工具的 LLM，放在循环里，自己决定何时用工具、何时收工**。所有复杂的架构设计--Provider 适配、权限守卫、上下文压缩、子 Agent 协作--都是围绕这三个核心要素做的工程化增强。
