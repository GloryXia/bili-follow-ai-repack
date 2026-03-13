import path from 'path';
import { createBiliClient } from '../../core/bili-client.js';
import { createLogger } from '../../core/logger.js';
import { ensureDirs, writeJson } from '../../core/store.js';
import { createLLMBase } from '../../llm/base.js';
import { config } from '../../config.js';

/**
 * 稍后再看模块 — 完整运行流程
 *
 * 1. 拉取稍后再看列表
 * 2. LLM 批量生成内容摘要 + 推荐优先级
 * 3. 标记已失效视频
 *
 * @param {object} opts - CLI 传入的选项
 */
export async function runWatchLater(opts = {}) {
  const rootDir = opts.rootDir || process.cwd();
  const dataDir = path.join(rootDir, 'data', 'watchlater');
  const logsDir = path.join(rootDir, 'logs');
  await ensureDirs(dataDir, logsDir);

  const logFile = path.join(logsDir, 'watchlater.log');
  const log = createLogger(logFile);
  const bili = createBiliClient(config, log);

  log('启动稍后再看模块', { uid: config.biliUid, llmProvider: config.llmProvider });

  // 1. 拉取
  log('正在拉取稍后再看列表...');
  const data = await bili.getWatchLater();
  const list = data?.list || [];
  log('拉取完成', { count: list.length });

  const items = list.map(v => ({
    aid: v.aid,
    bvid: v.bvid,
    title: v.title,
    desc: v.desc || '',
    owner: v.owner?.name || '',
    ownerMid: v.owner?.mid || 0,
    duration: v.duration || 0,
    progress: v.progress || 0,     // 已观看秒数，-1=已看完
    addAt: v.add_at || 0,
    tname: v.tname || '',
    pic: v.pic || '',
    stat: {
      view: v.stat?.view || 0,
      danmaku: v.stat?.danmaku || 0,
      like: v.stat?.like || 0,
    },
    // 视频是否有效
    isValid: v.videos > 0,
  }));

  await writeJson(`${dataDir}/watchlater.json`, items);

  // 统计
  const watched = items.filter(i => i.progress === -1).length;
  const invalid = items.filter(i => !i.isValid).length;
  const unwatched = items.length - watched - invalid;

  log('稍后再看统计', {
    total: items.length,
    unwatched,
    watched,
    invalid,
  });

  // 2. LLM 摘要 (可选)
  if (opts.fetchOnly) {
    log('--fetch-only 模式，跳过 LLM 分析');
    return;
  }

  log('正在使用 LLM 生成内容摘要和观看优先级...');

  let baseUrl, apiKey, model, llmLabel;
  if (config.llmProvider === 'kimi') {
    baseUrl = config.kimiBaseUrl; apiKey = config.kimiApiKey; model = config.kimiModel; llmLabel = 'KIMI';
  } else if (config.llmProvider === 'minimax') {
    baseUrl = config.minimaxBaseUrl; apiKey = config.minimaxApiKey; model = config.minimaxModel; llmLabel = 'MiniMax';
  } else {
    baseUrl = config.zhipuBaseUrl; apiKey = config.zhipuApiKey; model = config.zhipuModel; llmLabel = 'GLM';
  }

  const llm = createLLMBase({ baseUrl, apiKey, label: llmLabel, maxRetries: config.maxRetries, retryBaseDelayMs: config.retryBaseDelayMs });

  const validItems = items.filter(i => i.isValid && i.progress !== -1);
  const batchSize = config.pageSize || 20;
  const summaries = {};

  for (let i = 0; i < validItems.length; i += batchSize) {
    const batch = validItems.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    log('分析批次', { batch: batchNum, count: batch.length });

    const payloads = batch.map(v => ({
      id: String(v.aid),
      title: v.title,
      desc: v.desc,
      owner: v.owner,
      tname: v.tname,
      duration_min: Math.round(v.duration / 60),
      views: v.stat.view,
    }));

    const system = [
      '你是一个视频内容顾问。用户有一批"稍后再看"的视频，需要你帮忙：',
      '1. 为每个视频写一句话摘要（不超过30字）',
      '2. 根据内容质量和热度给出观看优先级：高/中/低',
      '',
      '【输出规范】：',
      '返回一个 JSON 对象，键为视频 ID，值为 { "summary": "...", "priority": "高/中/低" }。',
      '不要包含 markdown 标记或多余文字。',
      '',
      '示例：{"12345": {"summary": "深入讲解 Rust 内存模型", "priority": "高"}}'
    ].join('\n');

    try {
      const raw = await llm.chat({
        model, temperature: 0.3,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payloads, null, 2) }
        ]
      }, 120000);

      let content = raw.trim();
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        Object.assign(summaries, parsed);
      }
    } catch (err) {
      log('LLM 分析批次失败', { batch: batchNum, message: err?.message || String(err) });
    }
  }

  await writeJson(`${dataDir}/summaries.json`, summaries);
  log('稍后再看分析完成', { analyzed: Object.keys(summaries).length });
}
