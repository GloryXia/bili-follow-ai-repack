/**
 * LLM 提示词 — Chrome Extension 版本
 */

/**
 * 关注分组 — 单个 UP 主的实时分类提示词
 */
export function buildFollowClassifyPrompt(existingTags) {
  const tagNames = existingTags.map(t => typeof t === 'string' ? t : t.name).join('、');

  return [
    '你是一个 B 站关注分组助手。根据 UP 主的信息，将其归入最合适的分组。',
    '',
    tagNames
      ? `【现有分组】：${tagNames}`
      : '【现有分组】：暂无',
    '',
    '规则：',
    '1. 优先使用已有分组名称',
    '2. 如果没有合适的分组，可以建议一个新分组名（不超过6个字）',
    '3. 只返回一个分组名称，不要其他任何文字',
    '',
    '示例输入：UP主"何同学"，签名"科技区UP主"，最近视频：["iPhone评测","iPad体验"]',
    '示例输出：科技数码',
  ].join('\n');
}

/**
 * 收藏归类 — 单个视频的实时分类提示词
 */
export function buildFavClassifyPrompt(existingFolders) {
  const folderNames = existingFolders.map(f => typeof f === 'string' ? f : f.title).join('、');

  return [
    '你是一个 B 站收藏夹整理助手。根据视频信息，推荐最合适的收藏夹。',
    '',
    folderNames
      ? `【现有收藏夹】：${folderNames}`
      : '【现有收藏夹】：暂无',
    '',
    '规则：',
    '1. 优先使用已有收藏夹名称',
    '2. 如果没有合适的收藏夹，可以建议一个新名称（不超过8个字）',
    '3. 只返回一个收藏夹名称，不要其他任何文字',
    '',
    '示例输入：视频标题"超详细 Blender 建模教程"，UP主"建模师老王"，简介"从零开始学3D建模"',
    '示例输出：3D建模教程',
  ].join('\n');
}
