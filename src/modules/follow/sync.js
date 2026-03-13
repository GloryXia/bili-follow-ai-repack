import { sleep } from '../../core/helpers.js';
import { readJson, writeJson } from '../../core/store.js';

/**
 * 将分类结果同步到 B 站分组
 *
 * @param {object} options
 * @param {object} options.bili - B 站 API 客户端
 * @param {object} options.config - 全局配置
 * @param {object} options.cache - mid → 分类结果的缓存
 * @param {object} options.tagMap - 分组名 → B 站分组 ID 映射
 * @param {Function} options.log - 日志函数
 * @param {string} options.tagsFile - 标签文件路径
 */
export async function syncFollowTags({ bili, config, cache, tagMap, log, tagsFile }) {
  if (config.dryRun) {
    log('DRY_RUN 模式，跳过同步');
    return;
  }

  log('所有数据分类完毕，开始执行统一批量分组同步...');
  const groups = {};
  for (const mid of Object.keys(cache)) {
    const category = cache[mid].category || '其他';
    if (!groups[category]) groups[category] = [];
    groups[category].push(mid);
  }

  for (const category of Object.keys(groups)) {
    if (category.startsWith('dry-run')) continue;

    const mids = groups[category];
    log(`准备同步分组 [${category}], 包含 ${mids.length} 个UP主`);

    const tagId = await ensureTag(category, tagMap, bili, config, log, tagsFile);

    const chunkSize = 50;
    for (let i = 0; i < mids.length; i += chunkSize) {
      const chunk = mids.slice(i, i + chunkSize);
      const fids = chunk.join(',');
      log(`正在移入 [${category}] (进度: ${Math.min(i + chunkSize, mids.length)}/${mids.length})`);
      await sleep(config.tagWriteDelayMs);
      try {
        await bili.assignTag(fids, tagId);
      } catch (e) {
        log(`批量移入失败: ${e.message}`);
      }
    }
  }
  log('批量同步完成！');
}

/**
 * 确保 B 站分组存在，不存在则创建
 */
export async function ensureTag(category, tagMap, bili, config, log, tagsFile) {
  if (tagMap[category]) return tagMap[category];
  if (config.dryRun) {
    tagMap[category] = `dry-run-${category}`;
    return tagMap[category];
  }
  await sleep(config.tagWriteDelayMs);
  const tagId = await bili.createTag(category);
  tagMap[category] = tagId;
  await writeJson(tagsFile, tagMap);
  log('创建分组', { category, tagId });
  return tagId;
}
