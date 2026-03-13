import { sleep } from '../../core/helpers.js';
import { readJson, writeJson } from '../../core/store.js';

/**
 * 根据 LLM 建议批量整理收藏夹（创建新文件夹 + 移动视频）
 *
 * @param {object} options
 * @param {object} options.bili - B 站 API 客户端
 * @param {object} options.config - 全局配置
 * @param {Array} options.folders - 现有收藏夹列表
 * @param {object} options.contents - 收藏夹内容 { mediaId: [items...] }
 * @param {object} options.suggestions - 分析建议 { videoId: { suggestedFolder, currentFolder, needsMove } }
 * @param {Function} options.log - 日志函数
 * @param {string} options.dataDir - 数据目录
 */
export async function organizeFavorites({ bili, config, folders, contents, suggestions, log, dataDir }) {
  if (config.dryRun) {
    log('DRY_RUN 模式 — 仅打印整理计划，不执行写操作');
    printOrganizePlan(suggestions, log);
    return;
  }

  const folderMapFile = `${dataDir}/folder-map.json`;

  // 1. 构建 收藏夹名称 → mediaId 映射
  const folderMap = {};
  for (const f of folders) {
    folderMap[f.title] = f.id;
  }

  // 构建 videoId → 当前所在 mediaId 映射
  const videoToMediaId = {};
  for (const folder of folders) {
    const items = contents[folder.id] || [];
    for (const item of items) {
      videoToMediaId[item.id] = folder.id;
    }
  }

  // 2. 找出需要创建的新收藏夹
  const neededFolders = new Set();
  for (const s of Object.values(suggestions)) {
    if (s.needsMove && !folderMap[s.suggestedFolder]) {
      neededFolders.add(s.suggestedFolder);
    }
  }

  // 3. 创建新收藏夹
  for (const folderName of neededFolders) {
    log(`创建新收藏夹: ${folderName}`);
    await sleep(config.tagWriteDelayMs);
    try {
      const result = await bili.createFavFolder(folderName);
      folderMap[folderName] = result.id;
      log('创建成功', { name: folderName, id: result.id });
    } catch (err) {
      log('创建收藏夹失败', { name: folderName, message: err?.message || String(err) });
    }
  }

  await writeJson(folderMapFile, folderMap);

  // 4. 按目标收藏夹分组移动
  const moveGroups = {}; // { srcMediaId_tarMediaId: [resourceStrings] }
  for (const [videoId, s] of Object.entries(suggestions)) {
    if (!s.needsMove) continue;

    const srcMediaId = videoToMediaId[videoId];
    const tarMediaId = folderMap[s.suggestedFolder];
    if (!srcMediaId || !tarMediaId) {
      log('跳过移动（缺少ID映射）', { videoId, src: srcMediaId, tar: tarMediaId });
      continue;
    }

    const key = `${srcMediaId}_${tarMediaId}`;
    if (!moveGroups[key]) {
      moveGroups[key] = { srcMediaId, tarMediaId, resources: [] };
    }
    // 视频类型为 2
    moveGroups[key].resources.push(`${videoId}:2`);
  }

  // 5. 批量执行移动
  let movedCount = 0;
  for (const group of Object.values(moveGroups)) {
    const chunkSize = 20; // B 站移动 API 每次最多约 20 个
    for (let i = 0; i < group.resources.length; i += chunkSize) {
      const chunk = group.resources.slice(i, i + chunkSize);
      const resourceStr = chunk.join(',');

      log(`移动 ${chunk.length} 个视频`, {
        from: group.srcMediaId,
        to: group.tarMediaId,
        progress: `${Math.min(i + chunkSize, group.resources.length)}/${group.resources.length}`
      });

      await sleep(config.tagWriteDelayMs);
      try {
        await bili.moveFavResources(group.srcMediaId, group.tarMediaId, resourceStr);
        movedCount += chunk.length;
      } catch (err) {
        log('移动失败', { message: err?.message || String(err) });
      }
    }
  }

  log('收藏夹整理完成', { movedCount });
}

function printOrganizePlan(suggestions, log) {
  const moves = Object.entries(suggestions).filter(([_, s]) => s.needsMove);
  if (moves.length === 0) {
    log('所有视频已在正确的收藏夹中，无需移动');
    return;
  }

  // 按目标收藏夹分组统计
  const targetGroups = {};
  for (const [videoId, s] of moves) {
    if (!targetGroups[s.suggestedFolder]) {
      targetGroups[s.suggestedFolder] = [];
    }
    targetGroups[s.suggestedFolder].push({ videoId, from: s.currentFolder });
  }

  log('=== 收藏夹整理计划 (DRY RUN) ===');
  for (const [folder, items] of Object.entries(targetGroups)) {
    log(`📁 → ${folder} (${items.length} 个视频)`);
    for (const item of items.slice(0, 5)) {
      log(`   • ${item.videoId} (从 "${item.from}" 移入)`);
    }
    if (items.length > 5) {
      log(`   ... 以及 ${items.length - 5} 个更多`);
    }
  }
  log(`总计需移动: ${moves.length} 个视频`);
}
