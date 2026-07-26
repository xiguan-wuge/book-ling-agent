import { LLM_API_KEY } from './api.local.ts';
// 请将下方占位符替换为你的实际 API Key
export const llmConfig = {
  apiKey: LLM_API_KEY,
  baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
  model: 'glm-5.2',
};
