import OpenAI from "openai";
import { readFileSync } from "fs";
import { execSync } from "child_process";
import { llmConfig } from './config.local.ts';

type Tool = OpenAI.Chat.ChatCompletionTool;
type Message = OpenAI.Chat.ChatCompletionMessageParam;
type ToolCall = OpenAI.Chat.ChatCompletionMessageToolCall;
const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY || llmConfig.apiKey,
  baseURL: process.env.LLM_BASE_URL || llmConfig.baseURL,
});
const MODEL = process.env.LLM_MODEL || llmConfig.model;

const tools: Tool[] = [
  { 
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the given path",
      parameters: {
        type: "object",
        properties: { file_path: { type: "string", description: "Absolute or relative file path" } },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a shell command and return its output",
      parameters: {
        type: "object",
        properties: { command: { type: "string", description: "Shell command to execute" } },
        required: ["command"],
      },
    },
  },
];

// Windows 中文系统下 cmd.exe 默认输出 GBK 编码，chcp 65001 对管道输出不可靠，
// 改为获取 Buffer 后智能解码：先尝试 UTF-8，若含替换字符则回退到 GBK
function decodeBuffer(buffer: Buffer): string {
  if (process.platform === "win32") {
    const text = new TextDecoder("utf-8").decode(buffer);
    if (text.includes("\uFFFD")) {
      try {
        return new TextDecoder("gbk").decode(buffer);
      } catch {
        return text;
      }
    }
    return text;
  }
  return buffer.toString("utf-8");
}

function executeTool(name: string, args: Record<string, string>): string {
  try {
    if (name === "read_file") return readFileSync(args.file_path, "utf-8");
    if (name === "run_command") {
      const buffer = execSync(args.command, { timeout: 30000 });
      return decodeBuffer(buffer);
    }
    return `Unknown tool: ${name}`;
  } catch (e: any) {
    let msg = `Error: ${e.message}`;
    if (e.stderr) msg += `\n${decodeBuffer(e.stderr)}`;
    if (e.stdout) msg += `\n${decodeBuffer(e.stdout)}`;
    return msg;
  }
}

async function agent(userMessage: string) {
  const messages: Message[] = [
    { role: "system", content: "You are Ling, a helpful coding assistant. Use tools to answer questions." },
    { role: "user", content: userMessage },
  ];

  while (true) {
    const res = await client.chat.completions.create({ model: MODEL, messages, tools });
    const choice = res.choices[0];
    messages.push(choice.message);

    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls) {
      console.log(choice.message.content);
      return;
    }

    for (const tc of choice.message.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      const result = executeTool(tc.function.name, args);
      console.log(`[tool] ${tc.function.name}(${JSON.stringify(args)}) → ${result.slice(0, 100)}...`);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }
}

agent(process.argv[2] || "Read package.json and summarize this project.");
