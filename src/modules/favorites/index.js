import path from 'path';
import { createBiliClient } from '../../core/bili-client.js';
import { createLogger } from '../../core/logger.js';
import { ensureDirs } from '../../core/store.js';
import { config } from '../../config.js';
import { createLLMBase } from '../../llm/base.js';
import { fetchFavorites } from './fetch.js';
import { analyzeFavorites } from './analyze.js';
import { organizeFavorites } from './organize.js';

/**
 * 获取当前 LLM provider 对应的 chatRaw 函数
 * chatRaw(system, user) → 返回原始模型输出文本
 */
function createChatRaw(cfg) {
  let baseUrl, apiKey, model, label;

  if (cfg.llmProvider === 'kimi') {
    baseUrl = cfg.kimiBaseUrl;
    apiKey = cfg.kimiApiKey;
    model = cfg.kimiModel;
    label = 'KIMI';
  } else if (cfg.llmProvider === 'minimax') {
    baseUrl = cfg.minimaxBaseUrl;
    apiKey = cfg.minimaxApiKey;
    model = cfg.minimaxModel;
    label = 'MiniMax';
  } else {
    baseUrl = cfg.zhipuBaseUrl;
    apiKey = cfg.zhipuApiKey;
    model = cfg.zhipuModel;
    label = 'GLM';
  }

  const llm = createLLMBase({
    baseUrl, apiKey, label,
    maxRetries: cfg.maxRetries,
    retryBaseDelayMs: cfg.retryBaseDelayMs
  });

  return {
    async chatRaw(system, userContent) {
      return llm.chat({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent }
        ]
      }, 120000);
    }
  };
}

/**
 * 收藏夹模块 — 完整运行流程
 *
 * 1. 拉取所有收藏夹及内容
 * 2. LLM 分析并生成重新归类建议
 * 3. 根据建议创建新收藏夹 + 移动视频
 *
 * @param {object} opts - CLI 传入的选项
 */
export async function runFavorites(opts = {}) {
  const rootDir = opts.rootDir || process.cwd();
  const dataDir = path.join(rootDir, 'data', 'favorites');
  const logsDir = path.join(rootDir, 'logs');
  await ensureDirs(dataDir, logsDir);

  const logFile = path.join(logsDir, 'favorites.log');
  const log = createLogger(logFile);

  const bili = createBiliClient(config, log);
  const llmClassifier = createChatRaw(config);

  log('启动收藏夹模块', {
    uid: config.biliUid,
    dryRun: config.dryRun,
    llmProvider: config.llmProvider
  });

  // Step 1: 拉取
  const { folders, contents } = await fetchFavorites(bili, config, log, dataDir);

  if (folders.length === 0) {
    log('未发现任何收藏夹，退出');
    return;
  }

  // Step 2: 分析
  if (opts.fetchOnly) {
    log('--fetch-only 模式，跳过分析和整理');
    return;
  }

  const { suggestions, stats } = await analyzeFavorites({
    folders, contents, llmClassifier, config, log, dataDir
  });

  log('分析统计', stats);

  // Step 3: 整理
  if (opts.analyzeOnly) {
    log('--analyze-only 模式，跳过整理');
    return;
  }

  await organizeFavorites({
    bili, config, folders, contents, suggestions, log, dataDir
  });

  log('收藏夹模块完成');
}
