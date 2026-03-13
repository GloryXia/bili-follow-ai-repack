import { randomDelay } from '../../core/helpers.js';
import { readJson, writeJson } from '../../core/store.js';

/**
 * 拉取所有收藏夹及其内容
 *
 * @param {object} bili - B 站 API 客户端
 * @param {object} config - 全局配置
 * @param {Function} log - 日志函数
 * @param {string} dataDir - 数据目录路径
 * @returns {Promise<object>} { folders: [], contents: { mediaId: [...] } }
 */
export async function fetchFavorites(bili, config, log, dataDir) {
  const foldersFile = `${dataDir}/folders.json`;
  const contentsFile = `${dataDir}/contents.json`;

  // 1. 拉取收藏夹列表
  log('正在获取收藏夹列表...');
  const foldersData = await bili.getFavFolders(config.biliUid);
  const folders = foldersData?.list || [];
  log('获取到收藏夹', { count: folders.length });

  await writeJson(foldersFile, folders);

  // 2. 逐个收藏夹拉取内容
  const allContents = await readJson(contentsFile, {});
  let totalItems = 0;

  for (const folder of folders) {
    const mediaId = folder.id;
    const folderTitle = folder.title;
    const mediaCount = folder.media_count || 0;

    // 如果已经缓存过且数量没变，跳过
    if (allContents[mediaId]?.length === mediaCount && !config.forceReclassify) {
      log('跳过收藏夹（已缓存）', { title: folderTitle, mediaId, count: mediaCount });
      totalItems += mediaCount;
      continue;
    }

    log('拉取收藏夹内容', { title: folderTitle, mediaId, mediaCount });
    const items = [];
    let pn = 1;

    while (true) {
      await randomDelay(config.requestMinDelayMs, config.requestMaxDelayMs);
      try {
        const result = await bili.getFavContent(mediaId, pn, 20);
        const medias = result?.medias || [];
        if (medias.length === 0) break;

        for (const media of medias) {
          items.push({
            id: media.id,
            type: media.type,
            title: media.title,
            cover: media.cover,
            upper: media.upper?.name || '',
            upperMid: media.upper?.mid || 0,
            intro: media.intro || '',
            duration: media.duration || 0,
            pubtime: media.pubtime || 0,
            favTime: media.fav_time || 0,
            bvid: media.bvid || '',
            cnt_info: {
              play: media.cnt_info?.play || 0,
              danmaku: media.cnt_info?.danmaku || 0,
              collect: media.cnt_info?.collect || 0,
            },
            // 如果视频已失效，attr 会有标记
            attr: media.attr || 0,
          });
        }

        log('拉取进度', {
          title: folderTitle,
          page: pn,
          fetched: items.length,
          total: mediaCount
        });

        if (!result.has_more || items.length >= mediaCount) break;
        pn += 1;
      } catch (err) {
        log('拉取收藏夹内容失败', {
          title: folderTitle,
          page: pn,
          message: err?.message || String(err)
        });
        break;
      }
    }

    allContents[mediaId] = items;
    totalItems += items.length;
    await writeJson(contentsFile, allContents);
  }

  log('收藏夹数据拉取完成', { folders: folders.length, totalItems });

  return { folders, contents: allContents };
}
