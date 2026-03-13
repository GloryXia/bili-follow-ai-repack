import { randomDelay } from '../../core/helpers.js';
import { readJson, writeJson } from '../../core/store.js';

/**
 * 拉取全量关注列表
 *
 * @param {object} bili - B 站 API 客户端
 * @param {object} config - 全局配置
 * @param {Function} log - 日志函数
 * @param {string} followingsFile - 关注列表缓存文件路径
 * @returns {Promise<Array>} 全量关注列表
 */
export async function fetchFollowings(bili, config, log, followingsFile) {
  let allFollowings = await readJson(followingsFile, null);

  if (!allFollowings || config.forceReclassify) {
    log('开始获取并缓存完整关注列表');
    allFollowings = [];
    let page = 1;
    while (true) {
      await randomDelay(config.requestMinDelayMs, config.requestMaxDelayMs);
      const followings = await bili.getFollowings(page);
      if (!followings || followings.length === 0) break;
      allFollowings.push(...followings);
      log('获取关注列表页', { page, count: followings.length, total: allFollowings.length });
      page += 1;
    }
    await writeJson(followingsFile, allFollowings);
    log('关注列表缓存完毕', { file: followingsFile, count: allFollowings.length });
  } else {
    log('读取到本地关注列表缓存', { count: allFollowings.length, file: followingsFile });
  }

  return allFollowings;
}
