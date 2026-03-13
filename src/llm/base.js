import axios from 'axios';
import { sleep } from '../core/helpers.js';

/**
 * LLM 基础请求封装
 * 统一的 OpenAI-Compatible chat/completions 请求 + 指数退避重试
 *
 * @param {object} options
 * @param {string} options.baseUrl - API base URL
 * @param {string} options.apiKey - API key
 * @param {string} options.label - 日志标签 (GLM / KIMI / MiniMax)
 * @param {number} options.maxRetries - 最大重试次数
 * @param {number} options.retryBaseDelayMs - 重试基础延迟
 * @returns {{ chat: Function }}
 */
export function createLLMBase({ baseUrl, apiKey, label, maxRetries = 3, retryBaseDelayMs = 3000 }) {
  async function chat(body, timeoutMs = 120000) {
    let attempt = 0;

    while (true) {
      attempt++;
      try {
        const url = new URL('chat/completions', baseUrl).toString();
        const { data } = await axios.post(url, body, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: timeoutMs
        });
        return data?.choices?.[0]?.message?.content || '';
      } catch (error) {
        const isRateLimit = error.response?.status === 429;
        const isServerError = error.response?.status >= 500;
        const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';

        if (attempt > maxRetries || !(isRateLimit || isServerError || isTimeout)) {
          if (error.response?.status === 400) {
            console.error(`[${label}] 400 Bad Request:`, JSON.stringify(error.response.data, null, 2));
          }
          throw error;
        }

        const delayMs = retryBaseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.warn(`[${label}] 请求失败，${Math.round(delayMs)}ms 后重试 (${attempt}/${maxRetries})`);
        await sleep(delayMs);
      }
    }
  }

  return { chat };
}
