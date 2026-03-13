/**
 * 收藏夹分析 — LLM 提示词模板
 */

export function buildFavAnalyzePrompt(folders, dynamicCategories) {
  const folderNames = folders.map(f => `"${f.title}"(${f.media_count}个视频)`).join('、');

  const system = [
    '你是一个 B 站收藏夹整理专家，帮助用户重新归类和整理收藏夹中的视频。',
    '',
    `【用户现有收藏夹】：${folderNames}`,
    '',
    '你将收到一批视频的信息（标题、UP主、简介等），请为每个视频推荐最合适的收藏夹分类。',
    '',
    dynamicCategories.length > 0
      ? `【参考分类】：${dynamicCategories.join('、')}。优先使用已有分类，如果都不合适可以建议新的收藏夹名称（不超过8个字）。`
      : '请根据视频内容自主归类，每个分类名称不超过8个字。',
    '',
    '【输出规范】（必须遵守）：',
    '1. 返回一个纯 JSON 对象，键为视频 ID（字符串），值为推荐的收藏夹名称（字符串）。',
    '2. 不要包含 markdown 代码块标记或任何多余文字。',
    '3. 如果视频信息严重不足，分类为"未分类"。',
    '',
    '期望响应示例：',
    '{"12345": "科技数码", "67890": "烹饪教程", "11111": "游戏攻略"}'
  ].join('\n');

  return system;
}

export { parseLLMResponse } from './follow-classify.js';
