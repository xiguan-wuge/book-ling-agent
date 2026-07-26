// 公共配置：apiKey 统一从环境变量读取（由 code/.env.local 通过 --env-file 加载）
export const llmConfig = {
  apiKey: process.env.LLM_API_KEY || '',
  baseURL: process.env.LLM_BASE_URL || 'https://ark.cn-beijing.volces.com/api/plan/v3',
  model: process.env.LLM_MODEL || 'glm-5.2',
};
