import { createLLMBase } from './base.js';
import { normalizeCategory } from '../core/helpers.js';
import { buildBatchPrompt, parseLLMResponse } from './prompts/follow-classify.js';

export function createKimiClassifier(config, defaultCategories) {
  if (!config.kimiApiKey) {
    throw new Error('缺少环境变量 KIMI_API_KEY');
  }

  const llm = createLLMBase({
    baseUrl: config.kimiBaseUrl,
    apiKey: config.kimiApiKey,
    label: 'KIMI',
    maxRetries: config.maxRetries,
    retryBaseDelayMs: config.retryBaseDelayMs
  });

  return {
    async classify(payload, dynamicCategories = defaultCategories) {
      let system;
      if (config.allowCustomCategories) {
        system = [
          '你是 B 站 UP 主分类助手。',
          '请根据提供的信息给出唯一主分组。',
          `这有一些已存在的参考分类：${dynamicCategories.join('、')}。如果UP主主要内容在此范围内，请直接使用该分类。`,
          '如果参考分类都不合适，且该UP主的内容属于某个垂直细分领域，你可以自己简短概括一个更细粒度的新分类名称（不超过6个字）。',
          '只输出分类名称，不要解释。信息完全不足时请输出"其他"。'
        ].join('\n');
      } else {
        system = [
          '你是 B 站 UP 主分类助手。',
          '请根据提供的信息给出唯一主分组。',
          `你只能从以下分类中选择一个：${dynamicCategories.join('、')}。`,
          '只输出分类名称，不要解释。',
          '信息不足时输出"其他"。'
        ].join('\n');
      }

      const body = {
        model: config.kimiModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payload, null, 2) }
        ]
      };

      const raw = await llm.chat(body, 120000);
      return normalizeCategory(raw || '其他', dynamicCategories, config.allowCustomCategories);
    },

    async classifyBatch(payloads, dynamicCategories = defaultCategories) {
      if (!payloads || payloads.length === 0) return {};

      const system = buildBatchPrompt(config, dynamicCategories);

      const body = {
        model: config.kimiModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payloads, null, 2) }
        ]
      };

      let raw = await llm.chat(body, 120000) || '{}';

      let parsed = {};
      try {
        parsed = parseLLMResponse(raw);
      } catch (e) {
        console.warn('[KIMI]', e.message);
        return {};
      }

      const result = {};
      for (const [id, value] of Object.entries(parsed)) {
        result[id] = normalizeCategory(value, dynamicCategories, config.allowCustomCategories);
      }
      return result;
    }
  };
}
