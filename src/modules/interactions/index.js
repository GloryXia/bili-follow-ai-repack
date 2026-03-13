import path from 'path';
import { createBiliClient } from '../../core/bili-client.js';
import { createLogger } from '../../core/logger.js';
import { randomDelay } from '../../core/helpers.js';
import { ensureDirs, readJson, writeJson } from '../../core/store.js';
import { config } from '../../config.js';

/**
 * 投币 / 点赞 互动统计模块
 *
 * 1. 拉取投币记录
 * 2. 统计分区分布、UP 主偏好
 *
 * @param {object} opts - CLI 传入的选项
 */
export async function runInteractions(opts = {}) {
  const rootDir = opts.rootDir || process.cwd();
  const dataDir = path.join(rootDir, 'data', 'interactions');
  const logsDir = path.join(rootDir, 'logs');
  await ensureDirs(dataDir, logsDir);

  const logFile = path.join(logsDir, 'interactions.log');
  const log = createLogger(logFile);
  const bili = createBiliClient(config, log);

  log('启动互动统计模块', { uid: config.biliUid });

  // 1. 拉取投币记录
  log('正在拉取投币记录...');
  const coinItems = [];
  let pn = 1;
  const maxPages = 10;

  while (pn <= maxPages) {
    await randomDelay(config.requestMinDelayMs, config.requestMaxDelayMs);
    try {
      const data = await bili.getCoinVideos(pn, 30);
      const list = data?.list || [];
      if (list.length === 0) break;

      for (const v of list) {
        coinItems.push({
          aid: v.aid,
          bvid: v.bvid,
          title: v.title,
          owner: v.owner?.name || '',
          ownerMid: v.owner?.mid || 0,
          tname: v.tname || '',
          coins: v.coins || 1,
          pic: v.pic || '',
          stat: {
            view: v.stat?.view || 0,
            like: v.stat?.like || 0,
          }
        });
      }

      log('拉取投币页', { page: pn, fetched: list.length, total: coinItems.length });
      pn += 1;
    } catch (err) {
      log('拉取投币记录失败', { page: pn, message: err?.message || String(err) });
      break;
    }
  }

  await writeJson(`${dataDir}/coins.json`, coinItems);
  log('投币记录保存完毕', { count: coinItems.length });

  // 2. 统计分析
  log('正在生成统计报告...');

  const categoryCount = {};
  const authorCount = {};
  let totalCoins = 0;

  for (const item of coinItems) {
    const cat = item.tname || '未知';
    categoryCount[cat] = (categoryCount[cat] || 0) + item.coins;

    if (item.owner) {
      authorCount[item.owner] = (authorCount[item.owner] || 0) + item.coins;
    }

    totalCoins += item.coins;
  }

  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, coins]) => ({ name, coins }));

  const topAuthors = Object.entries(authorCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, coins]) => ({ name, coins }));

  const report = {
    generatedAt: new Date().toISOString(),
    totalVideos: coinItems.length,
    totalCoins,
    topCategories,
    topAuthors,
  };

  await writeJson(`${dataDir}/report.json`, report);

  log('互动统计报告生成完毕', {
    totalVideos: report.totalVideos,
    totalCoins: report.totalCoins,
    topCategory: topCategories[0]?.name || '无',
    topAuthor: topAuthors[0]?.name || '无',
  });
}
