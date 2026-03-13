/**
 * 通用工具函数（非日志、非存储）
 */

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function randomDelay(min, max) {
  const ms = Math.floor(min + Math.random() * Math.max(0, max - min));
  await sleep(ms);
}

export function parseCsrf(cookie) {
  const match = cookie.match(/(?:^|;\s*)bili_jct=([^;]+)/);
  return match?.[1] || '';
}

export function normalizeCategory(value, categories = [], allowCustom = false) {
  const clean = String(value || '').trim().replace(/[，。；;：:\s/\\[\]（）()]/g, '');
  if (categories.includes(clean)) return clean;
  if (allowCustom && clean.length > 0 && clean.length <= 8) {
    return clean;
  }
  return '其他';
}
