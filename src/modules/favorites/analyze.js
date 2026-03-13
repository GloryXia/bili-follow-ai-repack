import { readJson, writeJson } from '../../core/store.js';
import { buildFavAnalyzePrompt, parseLLMResponse } from '../../llm/prompts/fav-organize.js';

/**
 * 使用 LLM 分析收藏夹内容并生成重新归类建议
 *
 * @param {object} options
 * @param {Array} options.folders - 收藏夹列表
 * @param {object} options.contents - { mediaId: [items...] }
 * @param {object} options.llmClassifier - LLM 分类器
 * @param {object} options.config - 全局配置
 * @param {Function} options.log - 日志函数
 * @param {string} options.dataDir - 数据目录
 * @returns {Promise<object>} 分析结果 { suggestions: { videoId: suggestedFolder }, stats: {...} }
 */
export async function analyzeFavorites({ folders, contents, llmClassifier, config, log, dataDir }) {
  const suggestionsFile = `${dataDir}/suggestions.json`;
  const existingSuggestions = await readJson(suggestionsFile, {});

  // 收集所有视频并构建 payload
  const folderNames = folders.map(f => f.title);
  const allVideos = [];
  const videoFolderMap = {}; // videoId → 当前所在收藏夹名

  for (const folder of folders) {
    const items = contents[folder.id] || [];
    for (const item of items) {
      // 跳过已失效的视频 (attr 标记)
      if (item.attr === 9) {
        log('跳过已失效视频', { id: item.id, title: item.title });
        continue;
      }
      // 跳过已分析过的
      if (existingSuggestions[item.id] && !config.forceReclassify) {
        continue;
      }
      allVideos.push(item);
      videoFolderMap[item.id] = folder.title;
    }
  }

  if (allVideos.length === 0) {
    log('所有收藏视频均已分析，无需重复操作');
    return { suggestions: existingSuggestions, stats: buildStats(existingSuggestions, videoFolderMap) };
  }

  log('待分析视频数', { count: allVideos.length, total: Object.values(contents).flat().length });

  // 分批发送给 LLM
  const batchSize = config.pageSize || 20;
  const suggestions = { ...existingSuggestions };

  for (let i = 0; i < allVideos.length; i += batchSize) {
    const batch = allVideos.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    log('分析批次', { batch: batchNum, count: batch.length });

    const payloads = batch.map(v => ({
      id: String(v.id),
      title: v.title,
      upper: v.upper,
      intro: v.intro || '',
      currentFolder: videoFolderMap[v.id] || '默认收藏夹',
    }));

    try {
      const system = buildFavAnalyzePrompt(folders, folderNames);
      const raw = await llmClassifier.chatRaw(system, JSON.stringify(payloads, null, 2));
      const parsed = parseLLMResponse(raw);

      for (const [id, suggestedFolder] of Object.entries(parsed)) {
        suggestions[id] = {
          suggestedFolder,
          currentFolder: videoFolderMap[id] || '未知',
          needsMove: suggestedFolder !== videoFolderMap[id],
          analyzedAt: new Date().toISOString()
        };
      }

      await writeJson(suggestionsFile, suggestions);
    } catch (err) {
      log('LLM 分析批次失败', { batch: batchNum, message: err?.message || String(err) });
    }
  }

  const stats = buildStats(suggestions, videoFolderMap);
  log('分析完成', stats);

  return { suggestions, stats };
}

function buildStats(suggestions, videoFolderMap) {
  const needsMove = Object.values(suggestions).filter(s => s.needsMove).length;
  const total = Object.keys(suggestions).length;
  const suggestedFolders = [...new Set(Object.values(suggestions).map(s => s.suggestedFolder))];

  return {
    totalAnalyzed: total,
    needsMove,
    stayInPlace: total - needsMove,
    suggestedFolders: suggestedFolders.length,
    suggestedFolderNames: suggestedFolders
  };
}
