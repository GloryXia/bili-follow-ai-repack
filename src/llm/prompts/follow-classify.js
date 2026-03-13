/**
 * 关注分组分类 —— LLM 提示词模板
 * (从原 src/prompts.js 迁移而来)
 */

export function buildBatchPrompt(config, dynamicCategories) {
  let system;
  if (config.allowCustomCategories) {
    system = [
      '你是 B 站 UP 主分类专家，你需要对一批 UP 主进行精准的主题分组分类。',
      '请根据提供的 UP 主资料（签名、官方认证、近期投稿视频标题等），给出每个 UP 主的最恰当分类。',
      '',
      `【首选参考分类】：${dynamicCategories.join('、')}。如果 UP 主主要内容在此范围内，请直接使用该官方分类名称。`,
      '【自定义细分领域】：如果参考分类都不合适，且该 UP 主的内容属于某个高度垂直关联的专业领域（譬如"客制化键盘"、"虚拟主播"等），你可以自己概括一个新的细粒度短标签（严格限制在 8 个字以内）。',
      '',
      '【输出规范】（必须遵守）：',
      '1. 你的返回结果必须是一个纯粹合法的 JSON 键值对对象 (Map)，绝不能包含开头或结尾的多余文字。',
      '2. 键(Key) 为传入的每一个 UP 主的 id（字符串）。',
      '3. 值(Value) 为由你决定的精准的主分组短名称（字符串）。',
      '4. 当该 UP 主信息严重不足无法判定时，请统一分类为"其他"。',
      '5. 请直接输出 JSON 对象，不要带上 markdown 的 ```json 前后缀，不要使用任何思考过程标签文本。',
      '',
      '期望响应示例：',
      '{"123": "科技数码", "456": "游戏", "789": "日常Vlog"}'
    ].join('\n');
  } else {
    system = [
      '你是 B 站 UP 主分类专家，你需要对一批 UP 主进行严格的官方分组分类。',
      '请根据提供的 UP 主资料（签名、认证、近期投稿视频标题等），给出每个 UP 主的全局唯一主分组。',
      '',
      `【强制规定】：你只能从以下 B 站官方分类中选择最贴切的一个作为结果：${dynamicCategories.join('、')}。若不在此列表中，视为严重错误！`,
      '',
      '【输出规范】（必须遵守）：',
      '1. 你的返回结果必须是一个纯粹合法的 JSON 键值对对象 (Map)，绝不能包含开头或结尾的多余文字。',
      '2. 键(Key) 为传入的每一个 UP 主的 id（字符串）。',
      '3. 值(Value) 为你从列表中挑选出的分类名称（字符串）。',
      '4. 在信息极度匮乏且前置所有门类都不沾边时，统一输出"其他"以备兜底。',
      '5. 请直接输出 JSON 对象，不要带上 markdown 的 ```json 前后缀，更不要任何开场白或思考过程。',
      '',
      '期望响应示例：',
      '{"123": "科技数码", "456": "游戏"}'
    ].join('\n');
  }

  return system;
}

export function parseLLMResponse(rawResult) {
  let content = rawResult.trim();

  // 1. 去除 <think> 推理标签
  content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. 去除 markdown json 块标签
  if (content.startsWith('```json')) {
    content = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  } else if (content.startsWith('```')) {
    content = content.replace(/^```\s*/, '').replace(/\s*```$/i, '').trim();
  }

  // 3. 提取 JSON Object
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    content = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(content);
    if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) {
      throw new Error('解析成功但不是 JSON Object 字典');
    }
    return parsed;
  } catch (e) {
    throw new Error(`LLM JSON 解析失败: ${e.message}\n提取的文本片段: ${content.substring(0, 150)}...`);
  }
}
