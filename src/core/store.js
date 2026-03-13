import fs from 'fs-extra';
import path from 'path';

/**
 * 统一的 JSON 文件存储层
 * 所有模块的数据读写都通过此模块，保证一致性
 */

/**
 * 确保指定目录存在
 * @param  {...string} dirs - 需要确保存在的目录路径
 */
export async function ensureDirs(...dirs) {
  for (const dir of dirs) {
    await fs.ensureDir(dir);
  }
}

/**
 * 读取 JSON 文件，文件不存在时返回 fallback
 * @param {string} file - JSON 文件路径
 * @param {*} fallback - 文件不存在时的默认值
 * @returns {Promise<*>}
 */
export async function readJson(file, fallback) {
  try {
    if (await fs.pathExists(file)) return await fs.readJson(file);
  } catch { }
  return fallback;
}

/**
 * 写入 JSON 文件（格式化输出）
 * @param {string} file - JSON 文件路径
 * @param {*} value - 要写入的值
 */
export async function writeJson(file, value) {
  await fs.ensureDir(path.dirname(file));
  await fs.writeJson(file, value, { spaces: 2 });
}
