/**
 * B 站 API 客户端 — 浏览器 fetch 版本
 *
 * 在后台脚本中通过 B站页面上下文请求 API，
 * 避免直接从扩展上下文请求时丢失登录态。
 */

import { requestBiliPageAction } from './page-actions.js';

async function getCookieValue(name) {
  try {
    const cookies = await chrome.cookies.getAll({ name });
    const cookie = cookies.find(c => c.domain.includes('bilibili.com'));
    return cookie?.value || '';
  } catch (e) {
    console.warn(`getCookieValue(${name}) error:`, e);
    return '';
  }
}

/**
 * 从当前 cookie 中提取 CSRF (bili_jct)
 */
export async function getCsrf() {
  return getCookieValue('bili_jct');
}

/**
 * 从 cookie 获取当前 UID
 */
export async function getUid(options = {}) {
  try {
    const status = await getLoginStatus(options);
    return status.uid || await getCookieValue('DedeUserID');
  } catch {
    return getCookieValue('DedeUserID');
  }
}

/**
 * 统一登录态检测
 */
export async function getLoginStatus(options = {}) {
  return requestBiliPageAction({ type: 'BILIBOARD_PAGE_LOGIN_STATUS' }, options);
}

/**
 * 通用 GET
 */
async function apiGet(path, params = {}, options = {}) {
  return requestBiliPageAction({
    type: 'BILIBOARD_PAGE_ACTION',
    action: 'apiRequest',
    payload: {
      method: 'GET',
      path,
      params,
    },
  }, options);
}

async function apiGetWithWbi(path, params = {}, options = {}) {
  return requestBiliPageAction({
    type: 'BILIBOARD_PAGE_ACTION',
    action: 'apiRequest',
    payload: {
      method: 'GET',
      path,
      params,
      useWbi: true,
    },
  }, options);
}

/**
 * 通用 POST (表单)
 */
async function apiPost(path, formData = {}, options = {}) {
  return requestBiliPageAction({
    type: 'BILIBOARD_PAGE_ACTION',
    action: 'apiRequest',
    payload: {
      method: 'POST',
      path,
      formData,
    },
  }, options);
}

// ========================
//  关注模块
// ========================

/** 获取 UP 主信息 */
export async function getAccInfo(mid, options = {}) {
  return apiGetWithWbi('/x/space/wbi/acc/info', { mid }, options);
}

/** 获取 UP 主最近视频 */
export async function getRecentVideos(mid, ps = 5, options = {}) {
  const data = await apiGetWithWbi('/x/space/wbi/arc/search', { mid, pn: 1, ps }, options);
  return data?.list?.vlist || [];
}

/** 获取当前所有分组标签 */
export async function getTags(options = {}) {
  return (await apiGet('/x/relation/tags', {}, options)) || [];
}

/** 创建分组标签 */
export async function createTag(name, options = {}) {
  const data = await apiPost('/x/relation/tag/create', { tag: name }, options);
  return data?.tagid;
}

/** 分配 UP 主到分组 */
export async function assignTag(fids, tagId, options = {}) {
  await apiPost('/x/relation/tags/addUsers', {
    fids: String(fids),
    tagids: String(tagId),
  }, options);
}

// ========================
//  收藏夹模块
// ========================

/** 获取所有收藏夹列表 */
export async function getFavFolders(uid, options = {}) {
  return apiGet('/x/v3/fav/folder/created/list-all', { up_mid: uid }, options);
}

/** 获取视频信息 */
export async function getVideoInfo(aid, options = {}) {
  return apiGet('/x/web-interface/view', { aid }, options);
}

/** 创建收藏夹 */
export async function createFavFolder(title, options = {}) {
  return apiPost('/x/v3/fav/folder/add', { title, privacy: '0' }, options);
}

/** 移动收藏资源 */
export async function moveFavResource(srcMediaId, tarMediaId, resources, uid, options = {}) {
  return apiPost('/x/v3/fav/resource/move', {
    src_media_id: String(srcMediaId),
    tar_media_id: String(tarMediaId),
    mid: String(uid),
    resources: String(resources),
    platform: 'web',
  }, options);
}

// ========================
//  稍后再看
// ========================

/** 获取稍后再看列表 */
export async function getWatchLater(options = {}) {
  return apiGet('/x/v2/history/toview', {}, options);
}

// ========================
//  历史记录
// ========================

/** 获取观看历史 (游标分页) */
export async function getHistory(max = 0, viewAt = 0, options = {}) {
  const params = { ps: 30 };
  if (max) params.max = max;
  if (viewAt) params.view_at = viewAt;
  return apiGet('/x/web-interface/history/cursor', params, options);
}
