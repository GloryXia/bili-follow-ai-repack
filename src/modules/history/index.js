import path from 'path';
import { createBiliClient } from '../../core/bili-client.js';
import { createLogger } from '../../core/logger.js';
import { randomDelay } from '../../core/helpers.js';
import { ensureDirs, readJson, writeJson } from '../../core/store.js';
import { createLLMBase } from '../../llm/base.js';
import { config } from '../../config.js';

/**
 * 历史记录模块 — 完整运行流程
 *
 * 1. 全量/增量拉取观看历史
 * 2. LLM 分析观看习惯，生成画像报告
 *
 * @param {object} opts - CLI 传入的选项
 */
export async function runHistory(opts = {}) {
  const rootDir = opts.rootDir || process.cwd();
  const dataDir = path.join(rootDir, 'data', 'history');
  const logsDir = path.join(rootDir, 'logs');
  await ensureDirs(dataDir, logsDir);

  const logFile = path.join(logsDir, 'history.log');
  const log = createLogger(logFile);
  const bili = createBiliClient(config, log);

  const historyFile = `${dataDir}/history.json`;
  const reportFile = `${dataDir}/report.json`;

  log('启动历史记录模块', { uid: config.biliUid });

  // 1. 拉取历史 — 游标分页
  const maxPages = opts.maxPages || 50; // 最多拉取页数，防止过量
  log('开始拉取观看历史...', { maxPages });

  const existing = await readJson(historyFile, []);
  const existingIds = new Set(existing.map(h => h.kid));
  const newItems = [];
  let cursor = { max: 0, viewAt: 0 };
  let page = 0;
  let duplicateStreak = 0;

  while (page < maxPages) {
    page += 1;
    await randomDelay(config.requestMinDelayMs, config.requestMaxDelayMs);

    try {
      const data = await bili.getHistory(cursor.max, cursor.viewAt);
      const list = data?.list || [];
      const cursorNext = data?.cursor;

      if (list.length === 0) {
        log('历史记录拉取完毕（无更多数据）');
        break;
      }

      let newInPage = 0;
      for (const item of list) {
        const kid = item.kid || `${item.history?.oid}_${item.history?.business}`;
        if (existingIds.has(kid)) {
          duplicateStreak += 1;
          continue;
        }

        duplicateStreak = 0;
        existingIds.add(kid);
        newItems.push({
          kid,
          title: item.title || '',
          cover: item.cover || '',
          uri: item.uri || '',
          business: item.history?.business || '',
          bvid: item.history?.bvid || '',
          duration: item.duration || 0,
          progress: item.progress || 0,
          viewAt: item.view_at || 0,
          author: item.author_name || '',
          authorMid: item.author_mid || 0,
          tagName: item.tag_name || '',
          isFinish: item.is_finish || 0,
        });
        newInPage += 1;
      }

      log('拉取历史页', { page, fetched: list.length, new: newInPage, totalNew: newItems.length });

      // 如果连续遇到重复项过多，说明已经到达增量边界
      if (duplicateStreak > 60) {
        log('检测到大量重复记录，增量拉取结束');
        break;
      }

      if (!cursorNext || cursorNext.max === 0) break;
      cursor = { max: cursorNext.max, viewAt: cursorNext.view_at };
    } catch (err) {
      log('拉取历史失败', { page, message: err?.message || String(err) });
      break;
    }
  }

  // 合并并保存
  const allHistory = [...newItems, ...existing];
  await writeJson(historyFile, allHistory);
  log('历史记录保存完毕', { total: allHistory.length, newItems: newItems.length });

  // 2. 分析
  if (opts.fetchOnly) {
    log('--fetch-only 模式，跳过分析');
    return;
  }

  log('正在分析观看习惯...');

  // 按分区统计
  const categoryCount = {};
  const authorCount = {};
  const hourCount = new Array(24).fill(0);
  let totalDuration = 0;

  for (const item of allHistory) {
    // 分区统计
    const cat = item.tagName || item.business || '未知';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;

    // UP 主统计
    if (item.author) {
      authorCount[item.author] = (authorCount[item.author] || 0) + 1;
    }

    // 时段统计
    if (item.viewAt > 0) {
      const hour = new Date(item.viewAt * 1000).getHours();
      hourCount[hour] += 1;
    }

    // 总时长
    totalDuration += Math.min(item.progress || 0, item.duration || 0);
  }

  // 排序
  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const topAuthors = Object.entries(authorCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));

  const peakHour = hourCount.indexOf(Math.max(...hourCount));

  const report = {
    generatedAt: new Date().toISOString(),
    totalRecords: allHistory.length,
    totalWatchMinutes: Math.round(totalDuration / 60),
    peakHour,
    hourDistribution: hourCount,
    topCategories,
    topAuthors,
  };

  await writeJson(reportFile, report);
  log('历史分析报告生成完毕', {
    records: report.totalRecords,
    watchHours: Math.round(report.totalWatchMinutes / 60),
    peakHour: `${peakHour}:00`,
    topCategory: topCategories[0]?.name || '无',
  });

  // 3. 可选：LLM 生成画像总结
  if (!opts.skipLlm) {
    log('正在使用 LLM 生成个人画像...');

    let baseUrl, apiKey, model, llmLabel;
    if (config.llmProvider === 'kimi') {
      baseUrl = config.kimiBaseUrl; apiKey = config.kimiApiKey; model = config.kimiModel; llmLabel = 'KIMI';
    } else if (config.llmProvider === 'minimax') {
      baseUrl = config.minimaxBaseUrl; apiKey = config.minimaxApiKey; model = config.minimaxModel; llmLabel = 'MiniMax';
    } else {
      baseUrl = config.zhipuBaseUrl; apiKey = config.zhipuApiKey; model = config.zhipuModel; llmLabel = 'GLM';
    }

    const llm = createLLMBase({ baseUrl, apiKey, label: llmLabel, maxRetries: config.maxRetries, retryBaseDelayMs: config.retryBaseDelayMs });

    const system = [
      '你是一个 B 站用户画像分析师。根据以下用户观看数据统计，生成一段 200 字以内的个人画像描述。',
      '内容应包括：主要兴趣领域、最爱的 UP 主、观看时段偏好、总体风格描述。',
      '用轻松有趣的语气撰写，像是对朋友介绍这个用户的观看口味。',
    ].join('\n');

    try {
      const raw = await llm.chat({
        model, temperature: 0.7,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(report, null, 2) }
        ]
      }, 120000);

      report.profileSummary = raw.trim();
      await writeJson(reportFile, report);
      log('LLM 画像生成完毕');
      log('画像', report.profileSummary);
    } catch (err) {
      log('LLM 画像生成失败', { message: err?.message || String(err) });
    }
  }

  log('历史记录模块完成');
}
