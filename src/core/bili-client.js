import axios from 'axios';
import { encWbi } from './wbi.js';
import { parseCsrf, sleep } from './helpers.js';

/**
 * 创建 B 站 API 客户端
 * 通用封装：包含认证、重试、WBI 签名
 * 
 * @param {object} config - 全局配置
 * @param {Function} log - 日志函数
 * @returns {object} B 站 API 方法集合
 */
export function createBiliClient(config, log) {
  const csrf = parseCsrf(config.biliCookie);

  const baseHeaders = {
    cookie: config.biliCookie,
    'user-agent': 'Mozilla/5.0',
    referer: 'https://space.bilibili.com/'
  };

  async function requestWithRetry(taskName, fn) {
    let lastError;
    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const status = error?.response?.status;
        const code = error?.response?.data?.code;
        const msg = error?.response?.data?.message || error?.message || String(error);
        log('请求失败', { taskName, attempt, status, code, msg });
        if (attempt < config.maxRetries) {
          await sleep(config.retryBaseDelayMs * (attempt + 1));
        }
      }
    }
    throw lastError;
  }

  function ensureOk(data, label) {
    if (data?.code !== 0) {
      throw new Error(`${label} 失败: ${data?.message || data?.code}`);
    }
    return data.data;
  }

  /**
   * 通用 GET 请求
   */
  async function get(url, params = {}, label = 'GET') {
    return requestWithRetry(label, async () => {
      const { data } = await axios.get(url, { headers: baseHeaders, params });
      return ensureOk(data, label);
    });
  }

  /**
   * 通用 POST 请求 (表单)
   */
  async function postForm(url, formData = {}, label = 'POST') {
    return requestWithRetry(label, async () => {
      const form = new URLSearchParams({ ...formData, csrf });
      const { data } = await axios.post(url, form, {
        headers: { ...baseHeaders, 'content-type': 'application/x-www-form-urlencoded' }
      });
      return ensureOk(data, label);
    });
  }

  /**
   * 带 WBI 签名的 GET 请求
   */
  async function getWithWbi(url, params, nav, label = 'GET+WBI') {
    return requestWithRetry(label, async () => {
      const qs = encWbi(params, nav.wbi_img.img_url, nav.wbi_img.sub_url);
      const { data } = await axios.get(`${url}?${qs}`, { headers: baseHeaders });
      return ensureOk(data, label);
    });
  }

  return {
    // --- 通用底层方法 ---
    get,
    postForm,
    getWithWbi,
    csrf,

    // --- 导航信息 ---
    async getNav() {
      return get('https://api.bilibili.com/x/web-interface/nav', {}, 'getNav');
    },

    // ========================
    //  关注模块 API
    // ========================

    async getFollowings(page) {
      const data = await get('https://api.bilibili.com/x/relation/followings', {
        vmid: config.biliUid, pn: page, ps: config.pageSize, order: 'desc'
      }, 'getFollowings');
      return data?.list || [];
    },

    async getAccInfo(mid, nav) {
      return getWithWbi('https://api.bilibili.com/x/space/wbi/acc/info', { mid }, nav, 'getAccInfo');
    },

    async getRecentVideos(mid, nav) {
      const body = await getWithWbi('https://api.bilibili.com/x/space/wbi/arc/search', {
        mid, pn: 1, ps: config.maxVideoSamples
      }, nav, 'getRecentVideos');
      return body?.list?.vlist || [];
    },

    async getTags() {
      return get('https://api.bilibili.com/x/relation/tags', {}, 'getTags') || [];
    },

    async createTag(name) {
      const body = await postForm('https://api.bilibili.com/x/relation/tag/create', { tag: name }, 'createTag');
      return body?.tagid;
    },

    async assignTag(mid, tagId) {
      const endpoint = config.moveMode ? 'moveUsers' : 'addUsers';
      await postForm(`https://api.bilibili.com/x/relation/tags/${endpoint}`, {
        fids: String(mid), tagids: String(tagId)
      }, endpoint);
      return true;
    },

    // ========================
    //  收藏夹模块 API
    // ========================

    async getFavFolders(uid) {
      return get('https://api.bilibili.com/x/v3/fav/folder/created/list-all', {
        up_mid: uid || config.biliUid
      }, 'getFavFolders');
    },

    async getFavContent(mediaId, pn = 1, ps = 20) {
      return get('https://api.bilibili.com/x/v3/fav/resource/list', {
        media_id: mediaId, pn, ps, order: 'mtime', platform: 'web'
      }, 'getFavContent');
    },

    async createFavFolder(title, intro = '', privacy = 0) {
      return postForm('https://api.bilibili.com/x/v3/fav/folder/add', {
        title, intro, privacy: String(privacy)
      }, 'createFavFolder');
    },

    async moveFavResources(srcMediaId, tarMediaId, resources) {
      // resources 格式: "avid:2,avid:2,..." 例如 "12345:2,67890:2"
      return postForm('https://api.bilibili.com/x/v3/fav/resource/move', {
        src_media_id: String(srcMediaId),
        tar_media_id: String(tarMediaId),
        mid: String(config.biliUid),
        resources: String(resources),
        platform: 'web'
      }, 'moveFavResources');
    },

    async deleteFavResources(mediaId, resources) {
      return postForm('https://api.bilibili.com/x/v3/fav/resource/batch-del', {
        media_id: String(mediaId),
        resources: String(resources),
        platform: 'web'
      }, 'deleteFavResources');
    },


    // ========================
    //  稍后再看模块 API
    // ========================

    async getWatchLater() {
      return get('https://api.bilibili.com/x/v2/history/toview', {}, 'getWatchLater');
    },

    // ========================
    //  历史记录模块 API
    // ========================

    async getHistory(max = 0, viewAt = 0, business = '') {
      const params = { ps: 30 };
      if (max) params.max = max;
      if (viewAt) params.view_at = viewAt;
      if (business) params.business = business;
      return get('https://api.bilibili.com/x/web-interface/history/cursor', params, 'getHistory');
    },

    // ========================
    //  互动（投币 / 点赞）模块 API
    // ========================

    async getCoinVideos(pn = 1, ps = 20) {
      return getWithWbi('https://api.bilibili.com/x/space/coin/video', {
        vmid: config.biliUid, pn, ps
      }, await this.getNav(), 'getCoinVideos');
    },
  };
}
